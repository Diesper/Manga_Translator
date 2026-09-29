# Bíblia técnica — `extension/content/gemini/job-runner.js`

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE ATIVA
> **SHA auditado:** `1b16fd656e82e64ef2d26977e061f87e469aa3ff`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#G`  
> **Tipo:** JavaScript — content-script orchestrator / runner Gemini  
> **Linhas textuais:** **1471**  
> **Posições documentais:** **1472** contando newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`
## Papel arquitetural

Este arquivo é o **orquestrador de execução de um job Gemini já reivindicado**. A fronteira é deliberada: `content_gemini.js` faz bootstrap, claim, keepalive wiring e handlers; o runner recebe o objeto `job` e coordena o ciclo operacional: recuperar deleção pendente → obter imagem original → preparar UI → opcionalmente ativar temp chat → estabilizar composer → anexar imagem → injetar prompt → instalar observer → submeter com confirmação → esperar resultado → extrair/quarentenar → persistir → commitar → limpar recursos.

Ele é carregado como content script antes de `content_gemini.js` e publica `globalThis.MangaTranslatorGeminiJobRunner`. Em Jest, o mesmo arquivo exporta CommonJS. `content_gemini.js` instancia exatamente um runner com DOM/Chrome/módulos reais e chama `jobRunner.run(job)` somente depois do claim.

## Dependências e consumidores

- **Consumidor direto:** `extension/content/content_gemini.js` (`createGeminiJobRunner`, `jobRunner.run(job)` e reexports de helpers).
- **Carregador:** `extension/manifest.json`, na sequência de módulos Gemini antes de `content/content_gemini.js`.
- **DOM:** `MangaTranslatorGeminiDom` para busca profunda, visibilidade, send button e classificação de imagens.
- **Quarentena:** `MangaTranslatorGeminiImageQuarantine` para ownership estrutural, SHA-256 e comparação final.
- **Observer:** `MangaTranslatorGeminiObserver` para confirmar geração, submit, erro e resultado.
- **Editor:** `MangaTranslatorGeminiEditor` para submit com confirmação e fallback MAIN-world.
- **Attachment:** `MangaTranslatorGeminiAttachment` para attachFile + evidência de preview.
- **Temporary chat:** `MangaTranslatorGeminiTemporaryChat`.
- **Result extractor:** injetado por `content_gemini.js`; extrai direto ou registra fallback auxiliar.
- **Deletion controller:** injetado por `content_gemini.js`; recovery e deleção segura.
- **Background via runtime:** `REQUEST_IMAGE_DATA`, `REFRESH_JOB_WATCHDOG`, `GEMINI_IMAGE_EXTRACTED`, `GEMINI_RESULT_COMMIT`, `GEMINI_RESULT_URL`, `GEMINI_ERROR`.

## Mensagens e efeitos laterais

| Mensagem/evento | Origem neste arquivo | Destino/efeito |
|---|---|---|
| `REQUEST_IMAGE_DATA` | `requestImageData` | Background encaminha ao content script do mangá e devolve data URL da página. |
| `REFRESH_JOB_WATCHDOG` | primeiro `generation_started` | Background revalida ownership e renova watchdog uma vez. |
| `GEMINI_IMAGE_EXTRACTED` | resultado direto | Staging/persistência dos bytes no leitor. |
| `GEMINI_RESULT_COMMIT` | após staging | Finalização do job, com até três tentativas e sem reenviar bytes. |
| `GEMINI_RESULT_URL` | fallback auxiliar | Registra extração por URL; requer `extractionRegistered`. |
| `GEMINI_ERROR` | erros/timeout | Propaga falha com job/batch/index/tab. |
| `MANGA_TRANSLATOR_SET_PROMPT` | antes da injeção DOM | Ponte MAIN-world para sincronizar prompt. |
| `MANGA_TRANSLATOR_TRIGGER_SEND` | fallback de submit | Solicita tentativa MAIN-world, ainda sujeita a confirmação observável. |
| `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` | mudança de modo | Ajusta mitigação de throttling no código injetado. |

## Estado, lifecycle e MV3

O arquivo não persiste estado próprio durável; mantém `activeObserver` e timers apenas enquanto a instância está viva. Isso é apropriado ao content script, mas a conclusão real do job depende do background/storage e dos ACKs de staging/commit. A lógica foi desenhada para não confiar em memória como prova de persistência: a imagem só é considerada entregue depois do ACK `staged/persisted`, e a finalização só depois de `committed`.

A suspensão de service worker MV3 pode afetar callbacks de runtime; por isso mensagens críticas retornam ACK e commit é repetível. A aba Gemini também pode trocar/hidratar DOM; por isso o runner re-resolve composer, observa Shadow DOM e não conserva referências antigas como autoridade.

## Segurança e privacidade

- A URL final é validada por esquema antes da extração; URLs Google recebem somente transformação de resolução.
- Imagens de input são bloqueadas por ownership estrutural e, quando possível, por hash exato.
- Logs de URL usam `getUrlLogMetadata`; o fluxo testado exige redaction de segredo/query. Prompt é logado por comprimento, não por conteúdo.
- O HUD manual não interpola dados do job em `innerHTML`; conteúdo dinâmico usa `textContent`.
- Eventos MAIN-world expõem ao contexto da página apenas dados necessários à automação; o host Gemini já é o destinatário funcional do prompt, mas extensões não devem adicionar segredos nesses payloads.
- Mensagens de conclusão carregam IDs de ownership; a validação final desses IDs pertence ao background.

## Evidências automatizadas inspecionadas

> Esta auditoria **não executou** as suítes. A classificação abaixo vem da leitura do teste real e de suas assertions, distinguindo prova direta de simples carregamento/ocorrência.

| Classificação | Arquivo | O que a assertion prova |
|---|---|---|
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/job-runner.test.js` | RUN-00…RUN-14 e RUN-COV-01/02 carregam o módulo real e afirmam dependências, conversão dataURL, recovery, cleanup, Shadow DOM, seleção manual, anti-throttle, watchdog, quarentena e staging/commit. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/rpa-flow.test.js` | Carrega os módulos Gemini reais + `content_gemini.js`; prova fluxo HTTP/blob, fallback de prompt, erro de UI, timeout, fallback MAIN-world e registro por URL. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/plan-rpa-edge-cases.test.js` | Prova attachment gate, editor desabilitado, seleção de botão válido, filtros de resultado, proporção extrema, HUD manual e persistência→commit antes de exclusão. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/resolution-elevation.test.js` | Prova elevação `=sN→=s0` dentro do fluxo que carrega o runner real. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/safe-background-delete.test.js` | Chama o helper reexportado `shouldKeepConversationForDebug` e verifica debug true/false. |
| ✅ PROVADO DIRETAMENTE (E2E) | `tests/e2e/translation-flow.spec.js` | Exercita extensão carregada: gate de attachment nos três modos, resultado rápido, Shadow DOM/wrapper assistant, submit não confirmado e ownership do resultado. |
| 🟦 GATE ESTÁTICO ESPECÍFICO | `extension/manifest.json + scripts/validation/verify-repository-structure.js` | Ordem de carregamento coloca os módulos Gemini e `job-runner.js` antes de `content_gemini.js`; o gate estrutural referencia o arquivo. |
| 🟨 EXECUTADO INDIRETAMENTE | `tests/helpers/load-content-gemini-module.js` | Carrega explicitamente `image-quarantine`, observer, editor, attachment, temporary-chat, result-extractor, deletion e job-runner antes do bootstrap. |

## Análise linha a linha

Cada posição física do blob possui um heading próprio. Linhas sintaticamente inseparáveis reutilizam o contexto da unidade, mas o campo **O que faz** identifica o papel local daquela posição.

### Linha 0001 — U01

**Fonte:** `'use strict';`

**O que faz:** Ativa semântica strict para este arquivo JavaScript.

**Como faz:** ativa strict mode e declara que o runner executa somente jobs já reivindicados.

**Por que foi implementado dessa forma:** manter claim/bootstrap fora deste módulo evita duas autoridades sobre ownership e lifecycle.

**Por que uma implementação ingênua seria pior:** misturar claim e execução poderia duplicar job, keepalive e mensagens.

### Linha 0002 — U01

**Fonte:** `// gemini/job-runner.js — orquestração de um job Gemini já reivindicado.`

**O que faz:** Documenta a intenção local: “gemini/job-runner.js — orquestração de um job Gemini já reivindicado.”.

**Como faz:** ativa strict mode e declara que o runner executa somente jobs já reivindicados.

**Por que foi implementado dessa forma:** manter claim/bootstrap fora deste módulo evita duas autoridades sobre ownership e lifecycle.

**Por que uma implementação ingênua seria pior:** misturar claim e execução poderia duplicar job, keepalive e mensagens.

### Linha 0003 — U01

**Fonte:** `//`

**O que faz:** Documenta a intenção local: “”.

**Como faz:** ativa strict mode e declara que o runner executa somente jobs já reivindicados.

**Por que foi implementado dessa forma:** manter claim/bootstrap fora deste módulo evita duas autoridades sobre ownership e lifecycle.

**Por que uma implementação ingênua seria pior:** misturar claim e execução poderia duplicar job, keepalive e mensagens.

### Linha 0004 — U01

**Fonte:** `// Este módulo recebe dependências explicitamente. Ele não faz claim e não abre`

**O que faz:** Documenta a intenção local: “Este módulo recebe dependências explicitamente. Ele não faz claim e não abre”.

**Como faz:** ativa strict mode e declara que o runner executa somente jobs já reivindicados.

**Por que foi implementado dessa forma:** manter claim/bootstrap fora deste módulo evita duas autoridades sobre ownership e lifecycle.

**Por que uma implementação ingênua seria pior:** misturar claim e execução poderia duplicar job, keepalive e mensagens.

### Linha 0005 — U01

**Fonte:** `// automação por conta própria: content_gemini.js continua responsável por`

**O que faz:** Documenta a intenção local: “automação por conta própria: content_gemini.js continua responsável por”.

**Como faz:** ativa strict mode e declara que o runner executa somente jobs já reivindicados.

**Por que foi implementado dessa forma:** manter claim/bootstrap fora deste módulo evita duas autoridades sobre ownership e lifecycle.

**Por que uma implementação ingênua seria pior:** misturar claim e execução poderia duplicar job, keepalive e mensagens.

### Linha 0006 — U01

**Fonte:** `// bootstrap/claim/keepalive/message handlers.`

**O que faz:** Documenta a intenção local: “bootstrap/claim/keepalive/message handlers.”.

**Como faz:** ativa strict mode e declara que o runner executa somente jobs já reivindicados.

**Por que foi implementado dessa forma:** manter claim/bootstrap fora deste módulo evita duas autoridades sobre ownership e lifecycle.

**Por que uma implementação ingênua seria pior:** misturar claim e execução poderia duplicar job, keepalive e mensagens.

### Linha 0007 — U01

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U01 — modo estrito e fronteira arquitetural; não executa instrução em runtime.

**Como faz:** ativa strict mode e declara que o runner executa somente jobs já reivindicados.

**Por que foi implementado dessa forma:** manter claim/bootstrap fora deste módulo evita duas autoridades sobre ownership e lifecycle.

**Por que uma implementação ingênua seria pior:** misturar claim e execução poderia duplicar job, keepalive e mensagens.

### Linha 0008 — U02

**Fonte:** `(function(scope) {`

**O que faz:** Abre a IIFE que recebe o escopo usado para publicar a API do runner.

**Como faz:** isola o módulo no `scope`, prefere a API global e usa CommonJS apenas como fallback de teste.

**Por que foi implementado dessa forma:** o mesmo código precisa rodar como content script clássico e como módulo Jest.

**Por que uma implementação ingênua seria pior:** uma implementação dependente só de global ou só de `require` quebraria um dos runtimes.

### Linha 0009 — U02

**Fonte:** `  let imageQuarantineApi = scope.MangaTranslatorGeminiImageQuarantine || null;`

**O que faz:** Declara o estado mutável `imageQuarantineApi` com o valor inicial mostrado, no contexto de IIFE e resolução da quarentena.

**Como faz:** isola o módulo no `scope`, prefere a API global e usa CommonJS apenas como fallback de teste.

**Por que foi implementado dessa forma:** o mesmo código precisa rodar como content script clássico e como módulo Jest.

**Por que uma implementação ingênua seria pior:** uma implementação dependente só de global ou só de `require` quebraria um dos runtimes.

### Linha 0010 — U02

**Fonte:** `  if (!imageQuarantineApi && typeof require === 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!imageQuarantineApi && typeof require === 'function') {`, protegendo IIFE e resolução da quarentena.

**Como faz:** isola o módulo no `scope`, prefere a API global e usa CommonJS apenas como fallback de teste.

**Por que foi implementado dessa forma:** o mesmo código precisa rodar como content script clássico e como módulo Jest.

**Por que uma implementação ingênua seria pior:** uma implementação dependente só de global ou só de `require` quebraria um dos runtimes.

### Linha 0011 — U02

**Fonte:** `    try { imageQuarantineApi = require('./image-quarantine.js'); } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de IIFE e resolução da quarentena pode falhar por DOM/API externa.

**Como faz:** isola o módulo no `scope`, prefere a API global e usa CommonJS apenas como fallback de teste.

**Por que foi implementado dessa forma:** o mesmo código precisa rodar como content script clássico e como módulo Jest.

**Por que uma implementação ingênua seria pior:** uma implementação dependente só de global ou só de `require` quebraria um dos runtimes.

### Linha 0012 — U02

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U02, delimitando IIFE e resolução da quarentena.

**Como faz:** isola o módulo no `scope`, prefere a API global e usa CommonJS apenas como fallback de teste.

**Por que foi implementado dessa forma:** o mesmo código precisa rodar como content script clássico e como módulo Jest.

**Por que uma implementação ingênua seria pior:** uma implementação dependente só de global ou só de `require` quebraria um dos runtimes.

### Linha 0013 — U02

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U02 — IIFE e resolução da quarentena; não executa instrução em runtime.

**Como faz:** isola o módulo no `scope`, prefere a API global e usa CommonJS apenas como fallback de teste.

**Por que foi implementado dessa forma:** o mesmo código precisa rodar como content script clássico e como módulo Jest.

**Por que uma implementação ingênua seria pior:** uma implementação dependente só de global ou só de `require` quebraria um dos runtimes.

### Linha 0014 — U03

**Fonte:** `  function createGeminiJobRunner({`

**O que faz:** Declara a função `createGeminiJobRunner` pertencente a U03 — factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0015 — U03

**Fonte:** `    root = scope.document || null,`

**O que faz:** Atualiza a referência/estado indicado por `root = scope.document || null,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0016 — U03

**Fonte:** `    pageWindow = scope.window || null,`

**O que faz:** Atualiza a referência/estado indicado por `pageWindow = scope.window || null,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0017 — U03

**Fonte:** `    runtime = scope.chrome?.runtime || null,`

**O que faz:** Atualiza a referência/estado indicado por `runtime = scope.chrome?.runtime || null,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0018 — U03

**Fonte:** `    storage = scope.chrome?.storage?.local || null,`

**O que faz:** Atualiza a referência/estado indicado por `storage = scope.chrome?.storage?.local || null,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0019 — U03

**Fonte:** `    domApi = scope.MangaTranslatorGeminiDom,`

**O que faz:** Atualiza a referência/estado indicado por `domApi = scope.MangaTranslatorGeminiDom,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0020 — U03

**Fonte:** `    imageQuarantine = imageQuarantineApi?.createImageQuarantine?.({ dom: domApi }),`

**O que faz:** Atualiza a referência/estado indicado por `imageQuarantine = imageQuarantineApi?.createImageQuarantine?.({ dom: domApi }),` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0021 — U03

**Fonte:** `    observerApi = scope.MangaTranslatorGeminiObserver,`

**O que faz:** Atualiza a referência/estado indicado por `observerApi = scope.MangaTranslatorGeminiObserver,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0022 — U03

**Fonte:** `    editorApi = scope.MangaTranslatorGeminiEditor,`

**O que faz:** Atualiza a referência/estado indicado por `editorApi = scope.MangaTranslatorGeminiEditor,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0023 — U03

**Fonte:** `    attachmentApi = scope.MangaTranslatorGeminiAttachment,`

**O que faz:** Atualiza a referência/estado indicado por `attachmentApi = scope.MangaTranslatorGeminiAttachment,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0024 — U03

**Fonte:** `    temporaryChatApi = scope.MangaTranslatorGeminiTemporaryChat,`

**O que faz:** Atualiza a referência/estado indicado por `temporaryChatApi = scope.MangaTranslatorGeminiTemporaryChat,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0025 — U03

**Fonte:** `    resultExtractor = null,`

**O que faz:** Atualiza a referência/estado indicado por `resultExtractor = null,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0026 — U03

**Fonte:** `    deletionController = null,`

**O que faz:** Atualiza a referência/estado indicado por `deletionController = null,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0027 — U03

**Fonte:** `    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),`

**O que faz:** Atualiza a referência/estado indicado por `sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0028 — U03

**Fonte:** `    sendLog = function() {},`

**O que faz:** Atualiza a referência/estado indicado por `sendLog = function() {},` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0029 — U03

**Fonte:** `    getUrlLogMetadata = () => ({}),`

**O que faz:** Atualiza a referência/estado indicado por `getUrlLogMetadata = () => ({}),` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0030 — U03

**Fonte:** `    debugConsole = function() {},`

**O que faz:** Atualiza a referência/estado indicado por `debugConsole = function() {},` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0031 — U03

**Fonte:** `    reportProgress = function() {},`

**O que faz:** Atualiza a referência/estado indicado por `reportProgress = function() {},` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0032 — U03

**Fonte:** `    openKeepAlive = function() {},`

**O que faz:** Atualiza a referência/estado indicado por `openKeepAlive = function() {},` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0033 — U03

**Fonte:** `    closeKeepAlive = function() {},`

**O que faz:** Atualiza a referência/estado indicado por `closeKeepAlive = function() {},` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0034 — U03

**Fonte:** `    FileImpl = scope.File,`

**O que faz:** Atualiza a referência/estado indicado por `FileImpl = scope.File,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0035 — U03

**Fonte:** `    DataUrlAtob = scope.atob ? scope.atob.bind(scope) : null,`

**O que faz:** Atualiza a referência/estado indicado por `DataUrlAtob = scope.atob ? scope.atob.bind(scope) : null,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0036 — U03

**Fonte:** `    setIntervalFn = scope.setInterval ? scope.setInterval.bind(scope) : setInterval,`

**O que faz:** Atualiza a referência/estado indicado por `setIntervalFn = scope.setInterval ? scope.setInterval.bind(scope) : setInterval,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0037 — U03

**Fonte:** `    clearIntervalFn = scope.clearInterval ? scope.clearInterval.bind(scope) : clearInterval,`

**O que faz:** Atualiza a referência/estado indicado por `clearIntervalFn = scope.clearInterval ? scope.clearInterval.bind(scope) : clearInterval,` dentro de factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0038 — U03

**Fonte:** `  } = {}) {`

**O que faz:** Completa a expressão `} = {}) {` dentro de U03 — factory e injeção de dependências.

**Como faz:** recebe DOM, Chrome APIs, módulos Gemini, callbacks e timers por parâmetros com defaults reais.

**Por que foi implementado dessa forma:** injeção explícita torna efeitos observáveis e permite testar a implementação real sem reescrevê-la.

**Por que uma implementação ingênua seria pior:** acoplamento rígido aos globais tornaria falhas, timers e cleanup difíceis de isolar.

### Linha 0039 — U04

**Fonte:** `    if (!root || !pageWindow || !runtime || !storage) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!root || !pageWindow || !runtime || !storage) {`, protegendo validação de dependências e estado do observer.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0040 — U04

**Fonte:** `      throw new Error('JobRunner requer document/window/runtime/storage');`

**O que faz:** Interrompe o fluxo lançando `new Error('JobRunner requer document/window/runtime/storage');` quando a invariante da unidade falha.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0041 — U04

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U04, delimitando validação de dependências e estado do observer.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0042 — U04

**Fonte:** `    if (!domApi || !imageQuarantine || !observerApi || !editorApi || !attachmentApi || !temporaryChatApi) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!domApi || !imageQuarantine || !observerApi || !editorApi || !attachmentApi || !temporaryChatAp…`, protegendo validação de dependências e estado do observer.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0043 — U04

**Fonte:** `      throw new Error('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');`

**O que faz:** Interrompe o fluxo lançando `new Error('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');` quando a invariante da unidade falha.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0044 — U04

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U04, delimitando validação de dependências e estado do observer.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0045 — U04

**Fonte:** `    if (!resultExtractor || !deletionController) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!resultExtractor || !deletionController) {`, protegendo validação de dependências e estado do observer.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0046 — U04

**Fonte:** `      throw new Error('JobRunner requer resultExtractor e deletionController');`

**O que faz:** Interrompe o fluxo lançando `new Error('JobRunner requer resultExtractor e deletionController');` quando a invariante da unidade falha.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0047 — U04

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U04, delimitando validação de dependências e estado do observer.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0048 — U04

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U04 — validação de dependências e estado do observer; não executa instrução em runtime.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0049 — U04

**Fonte:** `    let activeObserver = null;`

**O que faz:** Declara o estado mutável `activeObserver` com o valor inicial mostrado, no contexto de validação de dependências e estado do observer.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0050 — U04

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U04 — validação de dependências e estado do observer; não executa instrução em runtime.

**Como faz:** falha cedo quando faltam fronteiras obrigatórias e cria `activeObserver` por instância.

**Por que foi implementado dessa forma:** um job não deve começar parcialmente configurado nem operar sem observer controlável.

**Por que uma implementação ingênua seria pior:** adiar essas falhas produziria erros tardios e cleanup incompleto.

### Linha 0051 — U05

**Fonte:** `    function getAntiThrottleModeForExecutionMode(executionMode) {`

**O que faz:** Declara a função `getAntiThrottleModeForExecutionMode` pertencente a U05 — seleção do modo anti-throttle.

**Como faz:** mapeia modos destrutivos/em background para `balanced` e os demais para `minimal`.

**Por que foi implementado dessa forma:** o grau de mitigação precisa acompanhar o risco de throttling sem tornar todo fluxo invasivo.

**Por que uma implementação ingênua seria pior:** usar sempre legacy aumentaria interferência; usar sempre minimal fragilizaria background.

### Linha 0052 — U05

**Fonte:** `      return executionMode === 'minimized_window' || executionMode === 'background_delete'`

**O que faz:** Retorna `executionMode === 'minimized_window' || executionMode === 'background_delete'` como resultado desta etapa de seleção do modo anti-throttle.

**Como faz:** mapeia modos destrutivos/em background para `balanced` e os demais para `minimal`.

**Por que foi implementado dessa forma:** o grau de mitigação precisa acompanhar o risco de throttling sem tornar todo fluxo invasivo.

**Por que uma implementação ingênua seria pior:** usar sempre legacy aumentaria interferência; usar sempre minimal fragilizaria background.

### Linha 0053 — U05

**Fonte:** `        ? 'balanced'`

**O que faz:** Completa a expressão `? 'balanced'` dentro de U05 — seleção do modo anti-throttle.

**Como faz:** mapeia modos destrutivos/em background para `balanced` e os demais para `minimal`.

**Por que foi implementado dessa forma:** o grau de mitigação precisa acompanhar o risco de throttling sem tornar todo fluxo invasivo.

**Por que uma implementação ingênua seria pior:** usar sempre legacy aumentaria interferência; usar sempre minimal fragilizaria background.

### Linha 0054 — U05

**Fonte:** `        : 'minimal';`

**O que faz:** Completa a expressão `: 'minimal';` dentro de U05 — seleção do modo anti-throttle.

**Como faz:** mapeia modos destrutivos/em background para `balanced` e os demais para `minimal`.

**Por que foi implementado dessa forma:** o grau de mitigação precisa acompanhar o risco de throttling sem tornar todo fluxo invasivo.

**Por que uma implementação ingênua seria pior:** usar sempre legacy aumentaria interferência; usar sempre minimal fragilizaria background.

### Linha 0055 — U05

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U05, delimitando seleção do modo anti-throttle.

**Como faz:** mapeia modos destrutivos/em background para `balanced` e os demais para `minimal`.

**Por que foi implementado dessa forma:** o grau de mitigação precisa acompanhar o risco de throttling sem tornar todo fluxo invasivo.

**Por que uma implementação ingênua seria pior:** usar sempre legacy aumentaria interferência; usar sempre minimal fragilizaria background.

### Linha 0056 — U05

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U05 — seleção do modo anti-throttle; não executa instrução em runtime.

**Como faz:** mapeia modos destrutivos/em background para `balanced` e os demais para `minimal`.

**Por que foi implementado dessa forma:** o grau de mitigação precisa acompanhar o risco de throttling sem tornar todo fluxo invasivo.

**Por que uma implementação ingênua seria pior:** usar sempre legacy aumentaria interferência; usar sempre minimal fragilizaria background.

### Linha 0057 — U06

**Fonte:** `    function setAntiThrottleMode(mode) {`

**O que faz:** Declara a função `setAntiThrottleMode` pertencente a U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0058 — U06

**Fonte:** `      const normalized = ['minimal', 'balanced', 'legacy'].includes(mode)`

**O que faz:** Declara a constante `normalized` e inicia sua expressão em U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0059 — U06

**Fonte:** `        ? mode`

**O que faz:** Completa a expressão `? mode` dentro de U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0060 — U06

**Fonte:** `        : 'minimal';`

**O que faz:** Completa a expressão `: 'minimal';` dentro de U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0061 — U06

**Fonte:** `      const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;`

**O que faz:** Declara a constante `CustomEventImpl` e inicia sua expressão em U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0062 — U06

**Fonte:** `      if (typeof CustomEventImpl !== 'function' || typeof pageWindow.dispatchEvent !== 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof CustomEventImpl !== 'function' || typeof pageWindow.dispatchEvent !== 'function') {`, protegendo publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0063 — U06

**Fonte:** `        return normalized;`

**O que faz:** Retorna `normalized;` como resultado desta etapa de publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0064 — U06

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U06, delimitando publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0065 — U06

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U06 — publicação do anti-throttle; não executa instrução em runtime.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0066 — U06

**Fonte:** `      try {`

**O que faz:** Inicia bloco protegido porque esta operação de publicação do anti-throttle pode falhar por DOM/API externa.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0067 — U06

**Fonte:** `        pageWindow.dispatchEvent(new CustomEventImpl(`

**O que faz:** Inicia despacho de evento para a janela da página como parte de publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0068 — U06

**Fonte:** `          'MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE',`

**O que faz:** Completa a expressão `'MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE',` dentro de U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0069 — U06

**Fonte:** `          { detail: { mode: normalized } }`

**O que faz:** Completa a expressão `{ detail: { mode: normalized } }` dentro de U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0070 — U06

**Fonte:** `        ));`

**O que faz:** Completa a expressão `));` dentro de U06 — publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0071 — U06

**Fonte:** `      } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0072 — U06

**Fonte:** `      return normalized;`

**O que faz:** Retorna `normalized;` como resultado desta etapa de publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0073 — U06

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U06, delimitando publicação do anti-throttle.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0074 — U06

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U06 — publicação do anti-throttle; não executa instrução em runtime.

**Como faz:** normaliza o modo e despacha `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` quando CustomEvent/dispatch estão disponíveis.

**Por que foi implementado dessa forma:** o evento desacopla o runner da implementação MAIN-world e restringe valores arbitrários.

**Por que uma implementação ingênua seria pior:** aceitar strings livres ou depender de dispatcher obrigatório criaria estados inválidos ou falhas desnecessárias.

### Linha 0075 — U07

**Fonte:** `    function storageGet(keys) {`

**O que faz:** Declara a função `storageGet` pertencente a U07 — leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0076 — U07

**Fonte:** `      return new Promise(resolve => {`

**O que faz:** Retorna `new Promise(resolve => {` como resultado desta etapa de leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0077 — U07

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de leitura resiliente de storage pode falhar por DOM/API externa.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0078 — U07

**Fonte:** `          storage.get(keys, data => resolve(data || {}));`

**O que faz:** Executa a chamada `storage.get(keys, data => resolve(data || {}));` como passo concreto de leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0079 — U07

**Fonte:** `        } catch (_e) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0080 — U07

**Fonte:** `          resolve({});`

**O que faz:** Executa a chamada `resolve({});` como passo concreto de leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0081 — U07

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U07, delimitando leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0082 — U07

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U07 — leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0083 — U07

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U07, delimitando leitura resiliente de storage.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0084 — U07

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U07 — leitura resiliente de storage; não executa instrução em runtime.

**Como faz:** embrulha `storage.get` em Promise e converte exceção síncrona em objeto vazio.

**Por que foi implementado dessa forma:** o fluxo assíncrono pode usar defaults quando storage está temporariamente indisponível.

**Por que uma implementação ingênua seria pior:** propagar exceção de leitura derrubaria jobs por configuração auxiliar; silenciar tudo também é uma lacuna observável.

### Linha 0085 — U08

**Fonte:** `    function selectLiveComposer() {`

**O que faz:** Declara a função `selectLiveComposer` pertencente a U08 — seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0086 — U08

**Fonte:** `      const all = domApi.findAllDeep(root.body || root.documentElement || root, element =>`

**O que faz:** Declara a constante `all` e inicia sua expressão em U08 — seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0087 — U08

**Fonte:** `        element.matches?.('[contenteditable="true"]') && element.isConnected !== false &&`

**O que faz:** Executa a chamada `element.matches?.('[contenteditable="true"]') && element.isConnected !== false &&` como passo concreto de seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0088 — U08

**Fonte:** `        domApi.isElementVisible(element) && element.getAttribute('aria-disabled') !== 'true' &&`

**O que faz:** Executa a chamada `domApi.isElementVisible(element) && element.getAttribute('aria-disabled') !== 'true' &&` como passo concreto de seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0089 — U08

**Fonte:** `        !element.closest?.('[data-message-author], [data-turn-role], model-response, .user-query-container')`

**O que faz:** Completa a expressão `!element.closest?.('[data-message-author], [data-turn-role], model-response, .user-query-container')` dentro de U08 — seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0090 — U08

**Fonte:** `      );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U08, delimitando seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0091 — U08

**Fonte:** `      const editable = all.find(element => element.closest?.('rich-textarea, .input-area, .chat-input-container, input-area')) || all[0];`

**O que faz:** Declara a constante `editable` e inicia sua expressão em U08 — seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0092 — U08

**Fonte:** `      if (!editable) return null;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!editable) return null;`, protegendo seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0093 — U08

**Fonte:** `      let composer = editable;`

**O que faz:** Declara o estado mutável `composer` com o valor inicial mostrado, no contexto de seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0094 — U08

**Fonte:** `      for (let current = editable; current; current = current.parentElement || current.getRootNode?.().host) {`

**O que faz:** Inicia iteração `for (let current = editable; current; current = current.parentElement || current.getRootNode?.().host) {` necessária a seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0095 — U08

**Fonte:** `        if (current.matches?.('rich-textarea, .input-area, .chat-input-container, input-area')) { composer = current; break; }`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (current.matches?.('rich-textarea, .input-area, .chat-input-container, input-area')) { composer …`, protegendo seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0096 — U08

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U08, delimitando seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0097 — U08

**Fonte:** `      if ([editable, composer].some(element => element.disabled === true || element.getAttribute?.('aria-disabled') === 'true')) return null;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if ([editable, composer].some(element => element.disabled === true || element.getAttribute?.('aria-…`, protegendo seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0098 — U08

**Fonte:** `      return { editor: editable, composer };`

**O que faz:** Retorna `{ editor: editable, composer };` como resultado desta etapa de seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0099 — U08

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U08, delimitando seleção do composer vivo.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0100 — U08

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U08 — seleção do composer vivo; não executa instrução em runtime.

**Como faz:** varre DOM profundo, exige contenteditable visível/conectado/habilitado e exclui editores dentro de mensagens históricas.

**Por que foi implementado dessa forma:** upload e prompt precisam apontar para o composer atual e não para conteúdo renderizado.

**Por que uma implementação ingênua seria pior:** selecionar o primeiro contenteditable poderia editar uma mensagem/turn antigo ou nó stale.

### Linha 0101 — U09

**Fonte:** `    async function waitForStableComposer(timeoutMs = 12_000) {`

**O que faz:** Declara a função `waitForStableComposer` pertencente a U09 — estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0102 — U09

**Fonte:** `      const started = Date.now();`

**O que faz:** Declara a constante `started` e inicia sua expressão em U09 — estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0103 — U09

**Fonte:** `      let previousEditor = null, previousComposer = null, stableSince = 0;`

**O que faz:** Declara o estado mutável `previousEditor` com o valor inicial mostrado, no contexto de estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0104 — U09

**Fonte:** `      while (Date.now() - started < timeoutMs) {`

**O que faz:** Mantém o laço enquanto `while (Date.now() - started < timeoutMs) {`, implementando a espera/retry de estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0105 — U09

**Fonte:** `        const current = selectLiveComposer();`

**O que faz:** Declara a constante `current` e inicia sua expressão em U09 — estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0106 — U09

**Fonte:** `        if (current && current.editor === previousEditor && current.composer === previousComposer) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (current && current.editor === previousEditor && current.composer === previousComposer) {`, protegendo estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0107 — U09

**Fonte:** `          if (Date.now() - stableSince >= 750 && Date.now() - started >= 1500) return current;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (Date.now() - stableSince >= 750 && Date.now() - started >= 1500) return current;`, protegendo estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0108 — U09

**Fonte:** `        } else {`

**O que faz:** Abre o ramo alternativo da decisão imediatamente anterior em estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0109 — U09

**Fonte:** `          previousEditor = current?.editor || null;`

**O que faz:** Atualiza a referência/estado indicado por `previousEditor = current?.editor || null;` dentro de estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0110 — U09

**Fonte:** `          previousComposer = current?.composer || null;`

**O que faz:** Atualiza a referência/estado indicado por `previousComposer = current?.composer || null;` dentro de estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0111 — U09

**Fonte:** `          stableSince = Date.now();`

**O que faz:** Atualiza a referência/estado indicado por `stableSince = Date.now();` dentro de estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0112 — U09

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U09, delimitando estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0113 — U09

**Fonte:** `        await sleep(250);`

**O que faz:** Suspende esta função até concluir `sleep(250);`, preservando a ordem assíncrona de estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0114 — U09

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U09, delimitando estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0115 — U09

**Fonte:** `      const error = new Error('Editor editável do Gemini não estabilizou em 12s; envio bloqueado.');`

**O que faz:** Declara a constante `error` e inicia sua expressão em U09 — estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0116 — U09

**Fonte:** `      error.code = 'GEMINI_COMPOSER_NOT_READY';`

**O que faz:** Atualiza a referência/estado indicado por `error.code = 'GEMINI_COMPOSER_NOT_READY';` dentro de estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0117 — U09

**Fonte:** `      throw error;`

**O que faz:** Interrompe o fluxo lançando `error;` quando a invariante da unidade falha.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0118 — U09

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U09, delimitando estabilização do composer.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0119 — U09

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U09 — estabilização do composer; não executa instrução em runtime.

**Como faz:** reconsulta o par editor/composer a cada 250 ms e só aceita a mesma identidade por 750 ms depois de pelo menos 1,5 s.

**Por que foi implementado dessa forma:** o Gemini pode hidratar/substituir wrappers depois de eles aparecerem.

**Por que uma implementação ingênua seria pior:** usar a primeira referência encontrada abriria race de hidratação e envio para nó desconectado.

### Linha 0120 — U10

**Fonte:** `    function attachmentSnapshot() {`

**O que faz:** Declara a função `attachmentSnapshot` pertencente a U10 — snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0121 — U10

**Fonte:** `      const current = selectLiveComposer();`

**O que faz:** Declara a constante `current` e inicia sua expressão em U10 — snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0122 — U10

**Fonte:** `      const searchRoot = root.body || root.documentElement || root;`

**O que faz:** Declara a constante `searchRoot` e inicia sua expressão em U10 — snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0123 — U10

**Fonte:** `      return {`

**O que faz:** Retorna `{` como resultado desta etapa de snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0124 — U10

**Fonte:** `        editorConnected: current?.editor.isConnected === true,`

**O que faz:** Define a propriedade `editorConnected` do objeto/configuração construído em snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0125 — U10

**Fonte:** `        composerTag: current?.composer.tagName?.toLowerCase() || null,`

**O que faz:** Define a propriedade `composerTag` do objeto/configuração construído em snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0126 — U10

**Fonte:** `        fileInputs: domApi.findAllDeep(searchRoot, element => element.matches?.('input[type="file"]')).length,`

**O que faz:** Define a propriedade `fileInputs` do objeto/configuração construído em snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0127 — U10

**Fonte:** `        imageInputs: attachmentApi.findFileInputsDeep(searchRoot).length,`

**O que faz:** Define a propriedade `imageInputs` do objeto/configuração construído em snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0128 — U10

**Fonte:** `        previewCount: attachmentApi.listAttachmentEvidence(root).length,`

**O que faz:** Define a propriedade `previewCount` do objeto/configuração construído em snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0129 — U10

**Fonte:** `      };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U10, delimitando snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0130 — U10

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U10, delimitando snapshot de attachment.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0131 — U10

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U10 — snapshot de attachment; não executa instrução em runtime.

**Como faz:** mede conectividade do editor, tag do composer, inputs de arquivo e previews observados.

**Por que foi implementado dessa forma:** telemetria estrutural permite diagnosticar falhas sem registrar bytes ou prompt.

**Por que uma implementação ingênua seria pior:** logar apenas sucesso/falha esconderia em qual estágio a UI divergiu.

### Linha 0132 — U11

**Fonte:** `    function dataURLtoFile(dataurl, filename) {`

**O que faz:** Declara a função `dataURLtoFile` pertencente a U11 — conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0133 — U11

**Fonte:** `      const raw = String(dataurl || '');`

**O que faz:** Declara a constante `raw` e inicia sua expressão em U11 — conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0134 — U11

**Fonte:** `      const commaIndex = raw.indexOf(',');`

**O que faz:** Declara a constante `commaIndex` e inicia sua expressão em U11 — conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0135 — U11

**Fonte:** `      if (commaIndex === -1) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (commaIndex === -1) {`, protegendo conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0136 — U11

**Fonte:** `        throw new Error('dataURL malformada: sem vírgula separadora');`

**O que faz:** Interrompe o fluxo lançando `new Error('dataURL malformada: sem vírgula separadora');` quando a invariante da unidade falha.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0137 — U11

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U11, delimitando conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0138 — U11

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U11 — conversão data URL para File; não executa instrução em runtime.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0139 — U11

**Fonte:** `      const header = raw.slice(0, commaIndex);`

**O que faz:** Declara a constante `header` e inicia sua expressão em U11 — conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0140 — U11

**Fonte:** `      const mimeMatch = header.match(/:(.*?);/);`

**O que faz:** Declara a constante `mimeMatch` e inicia sua expressão em U11 — conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0141 — U11

**Fonte:** `      if (!mimeMatch || !mimeMatch[1]) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!mimeMatch || !mimeMatch[1]) {`, protegendo conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0142 — U11

**Fonte:** `        throw new Error('dataURL malformada: MIME não encontrado');`

**O que faz:** Interrompe o fluxo lançando `new Error('dataURL malformada: MIME não encontrado');` quando a invariante da unidade falha.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0143 — U11

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U11, delimitando conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0144 — U11

**Fonte:** `      if (typeof DataUrlAtob !== 'function' || typeof FileImpl !== 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof DataUrlAtob !== 'function' || typeof FileImpl !== 'function') {`, protegendo conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0145 — U11

**Fonte:** `        throw new Error('APIs de arquivo indisponíveis');`

**O que faz:** Interrompe o fluxo lançando `new Error('APIs de arquivo indisponíveis');` quando a invariante da unidade falha.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0146 — U11

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U11, delimitando conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0147 — U11

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U11 — conversão data URL para File; não executa instrução em runtime.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0148 — U11

**Fonte:** `      const binary = DataUrlAtob(raw.slice(commaIndex + 1));`

**O que faz:** Declara a constante `binary` e inicia sua expressão em U11 — conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0149 — U11

**Fonte:** `      let length = binary.length;`

**O que faz:** Declara o estado mutável `length` com o valor inicial mostrado, no contexto de conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0150 — U11

**Fonte:** `      const bytes = new Uint8Array(length);`

**O que faz:** Declara a constante `bytes` e inicia sua expressão em U11 — conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0151 — U11

**Fonte:** `      while (length--) bytes[length] = binary.charCodeAt(length);`

**O que faz:** Mantém o laço enquanto `while (length--) bytes[length] = binary.charCodeAt(length);`, implementando a espera/retry de conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0152 — U11

**Fonte:** `      return new FileImpl([bytes], filename, { type: mimeMatch[1] });`

**O que faz:** Retorna `new FileImpl([bytes], filename, { type: mimeMatch[1] });` como resultado desta etapa de conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0153 — U11

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U11, delimitando conversão data URL para File.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0154 — U11

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U11 — conversão data URL para File; não executa instrução em runtime.

**Como faz:** valida separador/MIME/APIs, decodifica Base64 em bytes e instancia `File`.

**Por que foi implementado dessa forma:** os mecanismos reais de upload trabalham com File e precisam falhar cedo em payload malformado.

**Por que uma implementação ingênua seria pior:** criar File sem validar MIME/Base64 poderia anexar conteúdo inválido ou falhar longe da origem.

### Linha 0155 — U12

**Fonte:** `    function queryAllDeep(selector, base = root) {`

**O que faz:** Declara a função `queryAllDeep` pertencente a U12 — consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0156 — U12

**Fonte:** `      if (!base || !selector) return [];`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!base || !selector) return [];`, protegendo consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0157 — U12

**Fonte:** `      const searchRoot = base.body || base.documentElement || base;`

**O que faz:** Declara a constante `searchRoot` e inicia sua expressão em U12 — consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0158 — U12

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U12 — consulta DOM profunda com fallback; não executa instrução em runtime.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0159 — U12

**Fonte:** `      if (typeof domApi.findAllDeep === 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof domApi.findAllDeep === 'function') {`, protegendo consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0160 — U12

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de consulta DOM profunda com fallback pode falhar por DOM/API externa.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0161 — U12

**Fonte:** `          const matches = domApi.findAllDeep(searchRoot, element => {`

**O que faz:** Declara a constante `matches` e inicia sua expressão em U12 — consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0162 — U12

**Fonte:** `            if (!element || element.nodeType !== 1 || typeof element.matches !== 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!element || element.nodeType !== 1 || typeof element.matches !== 'function') {`, protegendo consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0163 — U12

**Fonte:** `              return false;`

**O que faz:** Retorna `false;` como resultado desta etapa de consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0164 — U12

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U12, delimitando consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0165 — U12

**Fonte:** `            try { return element.matches(selector); } catch (_e) { return false; }`

**O que faz:** Inicia bloco protegido porque esta operação de consulta DOM profunda com fallback pode falhar por DOM/API externa.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0166 — U12

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U12 — consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0167 — U12

**Fonte:** `          if (matches.length) return matches;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (matches.length) return matches;`, protegendo consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0168 — U12

**Fonte:** `        } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0169 — U12

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U12, delimitando consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0170 — U12

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U12 — consulta DOM profunda com fallback; não executa instrução em runtime.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0171 — U12

**Fonte:** `      try { return Array.from(base.querySelectorAll?.(selector) || []); } catch (_e) { return []; }`

**O que faz:** Inicia bloco protegido porque esta operação de consulta DOM profunda com fallback pode falhar por DOM/API externa.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0172 — U12

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U12, delimitando consulta DOM profunda com fallback.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0173 — U12

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U12 — consulta DOM profunda com fallback; não executa instrução em runtime.

**Como faz:** usa `findAllDeep` quando possível, protege `matches`/seletor e cai para `querySelectorAll`.

**Por que foi implementado dessa forma:** o Gemini usa Shadow DOM aberto e markup variável.

**Por que uma implementação ingênua seria pior:** busca DOM rasa perderia elementos; deixar exceções de seletor abortarem o job seria frágil.

### Linha 0174 — U13

**Fonte:** `    function queryFirstDeep(selector, base = root) {`

**O que faz:** Declara a função `queryFirstDeep` pertencente a U13 — primeiro match profundo.

**Como faz:** reutiliza a política de `queryAllDeep` e reduz o resultado ao primeiro elemento ou null.

**Por que foi implementado dessa forma:** centralizar seleção evita regras divergentes entre editor, botão e imagens.

**Por que uma implementação ingênua seria pior:** duplicar consultas distintas poderia escolher alvos diferentes no mesmo DOM.

### Linha 0175 — U13

**Fonte:** `      const matches = queryAllDeep(selector, base);`

**O que faz:** Declara a constante `matches` e inicia sua expressão em U13 — primeiro match profundo.

**Como faz:** reutiliza a política de `queryAllDeep` e reduz o resultado ao primeiro elemento ou null.

**Por que foi implementado dessa forma:** centralizar seleção evita regras divergentes entre editor, botão e imagens.

**Por que uma implementação ingênua seria pior:** duplicar consultas distintas poderia escolher alvos diferentes no mesmo DOM.

### Linha 0176 — U13

**Fonte:** `      return matches.length ? matches[0] : null;`

**O que faz:** Retorna `matches.length ? matches[0] : null;` como resultado desta etapa de primeiro match profundo.

**Como faz:** reutiliza a política de `queryAllDeep` e reduz o resultado ao primeiro elemento ou null.

**Por que foi implementado dessa forma:** centralizar seleção evita regras divergentes entre editor, botão e imagens.

**Por que uma implementação ingênua seria pior:** duplicar consultas distintas poderia escolher alvos diferentes no mesmo DOM.

### Linha 0177 — U13

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U13, delimitando primeiro match profundo.

**Como faz:** reutiliza a política de `queryAllDeep` e reduz o resultado ao primeiro elemento ou null.

**Por que foi implementado dessa forma:** centralizar seleção evita regras divergentes entre editor, botão e imagens.

**Por que uma implementação ingênua seria pior:** duplicar consultas distintas poderia escolher alvos diferentes no mesmo DOM.

### Linha 0178 — U13

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U13 — primeiro match profundo; não executa instrução em runtime.

**Como faz:** reutiliza a política de `queryAllDeep` e reduz o resultado ao primeiro elemento ou null.

**Por que foi implementado dessa forma:** centralizar seleção evita regras divergentes entre editor, botão e imagens.

**Por que uma implementação ingênua seria pior:** duplicar consultas distintas poderia escolher alvos diferentes no mesmo DOM.

### Linha 0179 — U14

**Fonte:** `    function collectOpenShadowRoots(base = root) {`

**O que faz:** Declara a função `collectOpenShadowRoots` pertencente a U14 — coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0180 — U14

**Fonte:** `      if (!base || typeof domApi.findAllDeep !== 'function') return [];`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!base || typeof domApi.findAllDeep !== 'function') return [];`, protegendo coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0181 — U14

**Fonte:** `      const searchRoot = base.body || base.documentElement || base;`

**O que faz:** Declara a constante `searchRoot` e inicia sua expressão em U14 — coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0182 — U14

**Fonte:** `      try {`

**O que faz:** Inicia bloco protegido porque esta operação de coleta de ShadowRoots abertos pode falhar por DOM/API externa.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0183 — U14

**Fonte:** `        return domApi.findAllDeep(searchRoot, element => Boolean(element?.shadowRoot))`

**O que faz:** Retorna `domApi.findAllDeep(searchRoot, element => Boolean(element?.shadowRoot))` como resultado desta etapa de coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0184 — U14

**Fonte:** `          .map(element => element.shadowRoot)`

**O que faz:** Executa a chamada `.map(element => element.shadowRoot)` como passo concreto de coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0185 — U14

**Fonte:** `          .filter(Boolean);`

**O que faz:** Executa a chamada `.filter(Boolean);` como passo concreto de coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0186 — U14

**Fonte:** `      } catch (_e) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0187 — U14

**Fonte:** `        return [];`

**O que faz:** Retorna `[];` como resultado desta etapa de coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0188 — U14

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U14, delimitando coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0189 — U14

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U14, delimitando coleta de ShadowRoots abertos.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0190 — U14

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U14 — coleta de ShadowRoots abertos; não executa instrução em runtime.

**Como faz:** descobre hosts com `shadowRoot`, mapeia as raízes e ignora falha best-effort.

**Por que foi implementado dessa forma:** MutationObserver precisa alcançar inserções dentro de roots já existentes.

**Por que uma implementação ingênua seria pior:** observar somente document/body deixaria mudanças profundas invisíveis.

### Linha 0191 — U15

**Fonte:** `    function waitForElement(selector, timeout = 20_000) {`

**O que faz:** Declara a função `waitForElement` pertencente a U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0192 — U15

**Fonte:** `      const existing = queryFirstDeep(selector);`

**O que faz:** Declara a constante `existing` e inicia sua expressão em U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0193 — U15

**Fonte:** `      if (existing) return Promise.resolve(existing);`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (existing) return Promise.resolve(existing);`, protegendo espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0194 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0195 — U15

**Fonte:** `      const MutationObserverImpl = scope.MutationObserver || pageWindow.MutationObserver;`

**O que faz:** Declara a constante `MutationObserverImpl` e inicia sua expressão em U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0196 — U15

**Fonte:** `      if (typeof MutationObserverImpl !== 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof MutationObserverImpl !== 'function') {`, protegendo espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0197 — U15

**Fonte:** `        return Promise.resolve(null);`

**O que faz:** Retorna `Promise.resolve(null);` como resultado desta etapa de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0198 — U15

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0199 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0200 — U15

**Fonte:** `      return new Promise(resolve => {`

**O que faz:** Retorna `new Promise(resolve => {` como resultado desta etapa de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0201 — U15

**Fonte:** `        let timer = null;`

**O que faz:** Declara o estado mutável `timer` com o valor inicial mostrado, no contexto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0202 — U15

**Fonte:** `        let observer = null;`

**O que faz:** Declara o estado mutável `observer` com o valor inicial mostrado, no contexto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0203 — U15

**Fonte:** `        let settled = false;`

**O que faz:** Declara o estado mutável `settled` com o valor inicial mostrado, no contexto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0204 — U15

**Fonte:** `        const observedRoots = new WeakSet();`

**O que faz:** Declara a constante `observedRoots` e inicia sua expressão em U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0205 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0206 — U15

**Fonte:** `        const finish = element => {`

**O que faz:** Declara a constante `finish` e inicia sua expressão em U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0207 — U15

**Fonte:** `          if (settled) return;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (settled) return;`, protegendo espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0208 — U15

**Fonte:** `          settled = true;`

**O que faz:** Atualiza a referência/estado indicado por `settled = true;` dentro de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0209 — U15

**Fonte:** `          if (timer !== null) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (timer !== null) {`, protegendo espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0210 — U15

**Fonte:** `            try { scope.clearTimeout(timer); } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de espera por elemento dinâmico pode falhar por DOM/API externa.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0211 — U15

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0212 — U15

**Fonte:** `          if (observer) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (observer) {`, protegendo espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0213 — U15

**Fonte:** `            try { observer.disconnect(); } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de espera por elemento dinâmico pode falhar por DOM/API externa.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0214 — U15

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0215 — U15

**Fonte:** `          resolve(element || null);`

**O que faz:** Executa a chamada `resolve(element || null);` como passo concreto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0216 — U15

**Fonte:** `        };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0217 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0218 — U15

**Fonte:** `        const observeTarget = target => {`

**O que faz:** Declara a constante `observeTarget` e inicia sua expressão em U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0219 — U15

**Fonte:** `          if (!observer || !target || observedRoots.has(target)) return;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!observer || !target || observedRoots.has(target)) return;`, protegendo espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0220 — U15

**Fonte:** `          try {`

**O que faz:** Inicia bloco protegido porque esta operação de espera por elemento dinâmico pode falhar por DOM/API externa.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0221 — U15

**Fonte:** `            observer.observe(target, { childList: true, subtree: true });`

**O que faz:** Executa a chamada `observer.observe(target, { childList: true, subtree: true });` como passo concreto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0222 — U15

**Fonte:** `            observedRoots.add(target);`

**O que faz:** Executa a chamada `observedRoots.add(target);` como passo concreto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0223 — U15

**Fonte:** `          } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0224 — U15

**Fonte:** `        };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0225 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0226 — U15

**Fonte:** `        const observeDeepRoots = () => {`

**O que faz:** Declara a constante `observeDeepRoots` e inicia sua expressão em U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0227 — U15

**Fonte:** `          observeTarget(root.body || root.documentElement || root);`

**O que faz:** Executa a chamada `observeTarget(root.body || root.documentElement || root);` como passo concreto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0228 — U15

**Fonte:** `          for (const shadowRoot of collectOpenShadowRoots()) observeTarget(shadowRoot);`

**O que faz:** Inicia iteração `for (const shadowRoot of collectOpenShadowRoots()) observeTarget(shadowRoot);` necessária a espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0229 — U15

**Fonte:** `        };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0230 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0231 — U15

**Fonte:** `        timer = scope.setTimeout(`

**O que faz:** Atualiza a referência/estado indicado por `timer = scope.setTimeout(` dentro de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0232 — U15

**Fonte:** `          () => finish(queryFirstDeep(selector)),`

**O que faz:** Completa a expressão `() => finish(queryFirstDeep(selector)),` dentro de U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0233 — U15

**Fonte:** `          timeout`

**O que faz:** Completa a expressão `timeout` dentro de U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0234 — U15

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0235 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0236 — U15

**Fonte:** `        observer = new MutationObserverImpl(() => {`

**O que faz:** Atualiza a referência/estado indicado por `observer = new MutationObserverImpl(() => {` dentro de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0237 — U15

**Fonte:** `          observeDeepRoots();`

**O que faz:** Executa a chamada `observeDeepRoots();` como passo concreto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0238 — U15

**Fonte:** `          const element = queryFirstDeep(selector);`

**O que faz:** Declara a constante `element` e inicia sua expressão em U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0239 — U15

**Fonte:** `          if (element) finish(element);`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (element) finish(element);`, protegendo espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0240 — U15

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0241 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0242 — U15

**Fonte:** `        observeDeepRoots();`

**O que faz:** Executa a chamada `observeDeepRoots();` como passo concreto de espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0243 — U15

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U15 — espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0244 — U15

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U15, delimitando espera por elemento dinâmico.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0245 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U15 — espera por elemento dinâmico; não executa instrução em runtime.

**Como faz:** resolve imediatamente se possível; senão observa root e ShadowRoots, adiciona novas raízes, aplica timeout e finalização idempotente.

**Por que foi implementado dessa forma:** a UI é assíncrona e pode criar o editor após a inicialização.

**Por que uma implementação ingênua seria pior:** polling cego ou observer sem cleanup causaria latência, vazamento e dupla resolução.

### Linha 0246 — U16

**Fonte:** `    function getImageSource(image) {`

**O que faz:** Declara a função `getImageSource` pertencente a U16 — delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0247 — U16

**Fonte:** `      return domApi.getImageSource(image);`

**O que faz:** Retorna `domApi.getImageSource(image);` como resultado desta etapa de delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0248 — U16

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U16, delimitando delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0249 — U16

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U16 — delegação de semântica de imagem; não executa instrução em runtime.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0250 — U16

**Fonte:** `    function isIgnoredGeminiImageSource(src) {`

**O que faz:** Declara a função `isIgnoredGeminiImageSource` pertencente a U16 — delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0251 — U16

**Fonte:** `      return domApi.isIgnoredGeminiImageSource(src);`

**O que faz:** Retorna `domApi.isIgnoredGeminiImageSource(src);` como resultado desta etapa de delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0252 — U16

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U16, delimitando delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0253 — U16

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U16 — delegação de semântica de imagem; não executa instrução em runtime.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0254 — U16

**Fonte:** `    function isModelResponseImage(image) {`

**O que faz:** Declara a função `isModelResponseImage` pertencente a U16 — delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0255 — U16

**Fonte:** `      return domApi.isModelResponseImage(image);`

**O que faz:** Retorna `domApi.isModelResponseImage(image);` como resultado desta etapa de delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0256 — U16

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U16, delimitando delegação de semântica de imagem.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0257 — U16

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U16 — delegação de semântica de imagem; não executa instrução em runtime.

**Como faz:** encaminha source/ignore/model ownership para `domApi`.

**Por que foi implementado dessa forma:** classificação de DOM pertence ao módulo especializado e o runner apenas compõe decisões.

**Por que uma implementação ingênua seria pior:** duplicar heurísticas aqui criaria drift entre observer, quarentena e runner.

### Linha 0258 — U17

**Fonte:** `    function tryClickModelImageCards() {`

**O que faz:** Declara a função `tryClickModelImageCards` pertencente a U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0259 — U17

**Fonte:** `      const selectors = [`

**O que faz:** Declara a constante `selectors` e inicia sua expressão em U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0260 — U17

**Fonte:** `        'model-response button[aria-label*="imagem" i]',`

**O que faz:** Completa a expressão `'model-response button[aria-label*="imagem" i]',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0261 — U17

**Fonte:** `        'model-response button[aria-label*="image" i]',`

**O que faz:** Completa a expressão `'model-response button[aria-label*="image" i]',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0262 — U17

**Fonte:** `        'model-response .image-card',`

**O que faz:** Completa a expressão `'model-response .image-card',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0263 — U17

**Fonte:** `        'model-response [data-test-id*="image"]',`

**O que faz:** Completa a expressão `'model-response [data-test-id*="image"]',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0264 — U17

**Fonte:** `        'model-response [data-test-id*="generated-image"]',`

**O que faz:** Completa a expressão `'model-response [data-test-id*="generated-image"]',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0265 — U17

**Fonte:** `        'model-response img',`

**O que faz:** Completa a expressão `'model-response img',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0266 — U17

**Fonte:** `        '[data-message-author="model"] button[aria-label*="imagem" i]',`

**O que faz:** Completa a expressão `'[data-message-author="model"] button[aria-label*="imagem" i]',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0267 — U17

**Fonte:** `        '[data-message-author="model"] [data-test-id*="image"]',`

**O que faz:** Completa a expressão `'[data-message-author="model"] [data-test-id*="image"]',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0268 — U17

**Fonte:** `        '[data-message-author="model"] img',`

**O que faz:** Completa a expressão `'[data-message-author="model"] img',` dentro de U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0269 — U17

**Fonte:** `      ];`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U17, delimitando clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0270 — U17

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U17 — clique em cartões de resultado; não executa instrução em runtime.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0271 — U17

**Fonte:** `      for (const selector of selectors) {`

**O que faz:** Inicia iteração `for (const selector of selectors) {` necessária a clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0272 — U17

**Fonte:** `        const element = queryFirstDeep(selector);`

**O que faz:** Declara a constante `element` e inicia sua expressão em U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0273 — U17

**Fonte:** `        if (!element) continue;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!element) continue;`, protegendo clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0274 — U17

**Fonte:** `        const target = element.closest?.('button, [role="button"]') || element;`

**O que faz:** Declara a constante `target` e inicia sua expressão em U17 — clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0275 — U17

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de clique em cartões de resultado pode falhar por DOM/API externa.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0276 — U17

**Fonte:** `          target.click();`

**O que faz:** Executa a chamada `target.click();` como passo concreto de clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0277 — U17

**Fonte:** `          return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0278 — U17

**Fonte:** `        } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0279 — U17

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U17, delimitando clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0280 — U17

**Fonte:** `      return false;`

**O que faz:** Retorna `false;` como resultado desta etapa de clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0281 — U17

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U17, delimitando clique em cartões de resultado.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0282 — U17

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U17 — clique em cartões de resultado; não executa instrução em runtime.

**Como faz:** tenta seletores de resposta em ordem, sobe para alvo clicável e continua se um clique falhar.

**Por que foi implementado dessa forma:** o markup do Gemini varia e um candidato encontrado pode não ser clicável.

**Por que uma implementação ingênua seria pior:** parar no primeiro seletor quebrado impediria o fallback seguinte.

### Linha 0283 — U18

**Fonte:** `    function isLikelyGeneratedImage(image, ignoreImages = new Set()) {`

**O que faz:** Declara a função `isLikelyGeneratedImage` pertencente a U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0284 — U18

**Fonte:** `      if (imageQuarantine.isStructurallyInput(image)) return false;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (imageQuarantine.isStructurallyInput(image)) return false;`, protegendo heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0285 — U18

**Fonte:** `      const src = getImageSource(image);`

**O que faz:** Declara a constante `src` e inicia sua expressão em U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0286 — U18

**Fonte:** `      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;`, protegendo heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0287 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U18 — heurística automática de imagem gerada; não executa instrução em runtime.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0288 — U18

**Fonte:** `      if (isModelResponseImage(image)) return true;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (isModelResponseImage(image)) return true;`, protegendo heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0289 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U18 — heurística automática de imagem gerada; não executa instrução em runtime.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0290 — U18

**Fonte:** `      if (`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (`, protegendo heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0291 — U18

**Fonte:** `        src.includes('gemini-result-image') ||`

**O que faz:** Executa a chamada `src.includes('gemini-result-image') ||` como passo concreto de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0292 — U18

**Fonte:** `        src.includes('googleusercontent.com/gg-dl/') ||`

**O que faz:** Executa a chamada `src.includes('googleusercontent.com/gg-dl/') ||` como passo concreto de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0293 — U18

**Fonte:** `        src.startsWith('blob:https://gemini.google.com/') ||`

**O que faz:** Executa a chamada `src.startsWith('blob:https://gemini.google.com/') ||` como passo concreto de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0294 — U18

**Fonte:** `        src.startsWith('blob:http://127.0.0.1/')`

**O que faz:** Executa a chamada `src.startsWith('blob:http://127.0.0.1/')` como passo concreto de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0295 — U18

**Fonte:** `      ) {`

**O que faz:** Completa a expressão `) {` dentro de U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0296 — U18

**Fonte:** `        return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0297 — U18

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U18, delimitando heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0298 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U18 — heurística automática de imagem gerada; não executa instrução em runtime.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0299 — U18

**Fonte:** `      const width = image.naturalWidth || image.width || 0;`

**O que faz:** Declara a constante `width` e inicia sua expressão em U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0300 — U18

**Fonte:** `      const height = image.naturalHeight || image.height || 0;`

**O que faz:** Declara a constante `height` e inicia sua expressão em U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0301 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U18 — heurística automática de imagem gerada; não executa instrução em runtime.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0302 — U18

**Fonte:** `      if (`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (`, protegendo heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0303 — U18

**Fonte:** `        src.includes('googleusercontent.com') &&`

**O que faz:** Executa a chamada `src.includes('googleusercontent.com') &&` como passo concreto de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0304 — U18

**Fonte:** `        !isIgnoredGeminiImageSource(src) &&`

**O que faz:** Completa a expressão `!isIgnoredGeminiImageSource(src) &&` dentro de U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0305 — U18

**Fonte:** `        width <= 0 &&`

**O que faz:** Completa a expressão `width <= 0 &&` dentro de U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0306 — U18

**Fonte:** `        height <= 0`

**O que faz:** Completa a expressão `height <= 0` dentro de U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0307 — U18

**Fonte:** `      ) {`

**O que faz:** Completa a expressão `) {` dentro de U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0308 — U18

**Fonte:** `        return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0309 — U18

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U18, delimitando heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0310 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U18 — heurística automática de imagem gerada; não executa instrução em runtime.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0311 — U18

**Fonte:** `      if (width <= 0 || height <= 0) return false;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (width <= 0 || height <= 0) return false;`, protegendo heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0312 — U18

**Fonte:** `      if (image.complete === false && height <= 0) return false;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (image.complete === false && height <= 0) return false;`, protegendo heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0313 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U18 — heurística automática de imagem gerada; não executa instrução em runtime.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0314 — U18

**Fonte:** `      const maxSide = Math.max(width, height);`

**O que faz:** Declara a constante `maxSide` e inicia sua expressão em U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0315 — U18

**Fonte:** `      const minSide = Math.min(width, height);`

**O que faz:** Declara a constante `minSide` e inicia sua expressão em U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0316 — U18

**Fonte:** `      const area = width * height;`

**O que faz:** Declara a constante `area` e inicia sua expressão em U18 — heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0317 — U18

**Fonte:** `      return maxSide >= 256 && minSide >= 40 && area >= 12_000;`

**O que faz:** Retorna `maxSide >= 256 && minSide >= 40 && area >= 12_000;` como resultado desta etapa de heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0318 — U18

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U18, delimitando heurística automática de imagem gerada.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0319 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U18 — heurística automática de imagem gerada; não executa instrução em runtime.

**Como faz:** bloqueia input/ignored/preexistente, aceita autoria explícita/padrões conhecidos e usa dimensões como último critério.

**Por que foi implementado dessa forma:** ownership estrutural deve vencer heurística positiva para não devolver o próprio anexo.

**Por que uma implementação ingênua seria pior:** aceitar qualquer imagem grande produziria falsos resultados como avatar, preview ou input.

### Linha 0320 — U19

**Fonte:** `    function isManualSelectableImage(image, ignoreImages = new Set()) {`

**O que faz:** Declara a função `isManualSelectableImage` pertencente a U19 — heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0321 — U19

**Fonte:** `      if (imageQuarantine.isStructurallyInput(image)) return false;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (imageQuarantine.isStructurallyInput(image)) return false;`, protegendo heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0322 — U19

**Fonte:** `      const src = getImageSource(image);`

**O que faz:** Declara a constante `src` e inicia sua expressão em U19 — heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0323 — U19

**Fonte:** `      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;`, protegendo heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0324 — U19

**Fonte:** `      const width = image.naturalWidth || image.width || 0;`

**O que faz:** Declara a constante `width` e inicia sua expressão em U19 — heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0325 — U19

**Fonte:** `      const height = image.naturalHeight || image.height || 0;`

**O que faz:** Declara a constante `height` e inicia sua expressão em U19 — heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0326 — U19

**Fonte:** `      return width > 0 && height > 0 && Math.max(width, height) >= 40;`

**O que faz:** Retorna `width > 0 && height > 0 && Math.max(width, height) >= 40;` como resultado desta etapa de heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0327 — U19

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U19, delimitando heurística de seleção manual.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0328 — U19

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U19 — heurística de seleção manual; não executa instrução em runtime.

**Como faz:** mantém bloqueios de input/source, mas relaxa o tamanho para permitir intervenção humana.

**Por que foi implementado dessa forma:** o usuário precisa recuperar resultados válidos que a heurística automática não reconhece.

**Por que uma implementação ingênua seria pior:** reutilizar exatamente o filtro automático tornaria o fallback manual incapaz de superar falso negativo.

### Linha 0329 — U20

**Fonte:** `    function findGeneratedResultImages(ignoreImages = new Set()) {`

**O que faz:** Declara a função `findGeneratedResultImages` pertencente a U20 — descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0330 — U20

**Fonte:** `      const images = domApi.findAllDeep(`

**O que faz:** Declara a constante `images` e inicia sua expressão em U20 — descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0331 — U20

**Fonte:** `        root.body || root.documentElement,`

**O que faz:** Completa a expressão `root.body || root.documentElement,` dentro de U20 — descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0332 — U20

**Fonte:** `        element => String(element.tagName || '').toUpperCase() === 'IMG'`

**O que faz:** Atualiza a referência/estado indicado por `element => String(element.tagName || '').toUpperCase() === 'IMG'` dentro de descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0333 — U20

**Fonte:** `      );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U20, delimitando descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0334 — U20

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U20 — descoberta de imagens candidatas; não executa instrução em runtime.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0335 — U20

**Fonte:** `      images.forEach(image => {`

**O que faz:** Executa a chamada `images.forEach(image => {` como passo concreto de descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0336 — U20

**Fonte:** `        if (image.getAttribute?.('loading') === 'lazy') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (image.getAttribute?.('loading') === 'lazy') {`, protegendo descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0337 — U20

**Fonte:** `          image.removeAttribute('loading');`

**O que faz:** Executa a chamada `image.removeAttribute('loading');` como passo concreto de descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0338 — U20

**Fonte:** `          image.setAttribute('loading', 'eager');`

**O que faz:** Executa a chamada `image.setAttribute('loading', 'eager');` como passo concreto de descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0339 — U20

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U20, delimitando descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0340 — U20

**Fonte:** `        if (image.dataset?.src) image.src = image.dataset.src;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (image.dataset?.src) image.src = image.dataset.src;`, protegendo descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0341 — U20

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U20 — descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0342 — U20

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U20 — descoberta de imagens candidatas; não executa instrução em runtime.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0343 — U20

**Fonte:** `      return images.filter(image => isLikelyGeneratedImage(image, ignoreImages));`

**O que faz:** Retorna `images.filter(image => isLikelyGeneratedImage(image, ignoreImages));` como resultado desta etapa de descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0344 — U20

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U20, delimitando descoberta de imagens candidatas.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0345 — U20

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U20 — descoberta de imagens candidatas; não executa instrução em runtime.

**Como faz:** força lazy para eager, promove `data-src` e filtra todas as IMG profundas pelo classificador.

**Por que foi implementado dessa forma:** resultados podem existir no DOM sem terem sido materializados em `src`/viewport.

**Por que uma implementação ingênua seria pior:** ignorar lazy/data-src poderia concluir incorretamente que não existe resultado.

### Linha 0346 — U21

**Fonte:** `    function setManualGeminiResultUrl(url, source = 'manual') {`

**O que faz:** Declara a função `setManualGeminiResultUrl` pertencente a U21 — aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0347 — U21

**Fonte:** `      pageWindow.__mangaTranslatorManualGeminiResultUrl = url;`

**O que faz:** Atualiza a referência/estado indicado por `pageWindow.__mangaTranslatorManualGeminiResultUrl = url;` dentro de aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0348 — U21

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U21 — aceitação manual de URL; não executa instrução em runtime.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0349 — U21

**Fonte:** `      const observer = activeObserver || pageWindow.__mangaTranslatorActiveGeminiObserver;`

**O que faz:** Declara a constante `observer` e inicia sua expressão em U21 — aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0350 — U21

**Fonte:** `      if (observer && typeof observer.acceptResult === 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (observer && typeof observer.acceptResult === 'function') {`, protegendo aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0351 — U21

**Fonte:** `        observer.acceptResult(null, url);`

**O que faz:** Executa a chamada `observer.acceptResult(null, url);` como passo concreto de aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0352 — U21

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U21, delimitando aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0353 — U21

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U21 — aceitação manual de URL; não executa instrução em runtime.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0354 — U21

**Fonte:** `      const status = root.getElementById('mt-gemini-assist-status');`

**O que faz:** Declara a constante `status` e inicia sua expressão em U21 — aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0355 — U21

**Fonte:** `      if (status) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (status) {`, protegendo aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0356 — U21

**Fonte:** `        status.textContent = 'Imagem marcada. A extensão vai usar esse resultado.';`

**O que faz:** Atualiza a referência/estado indicado por `status.textContent = 'Imagem marcada. A extensão vai usar esse resultado.';` dentro de aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0357 — U21

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U21, delimitando aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0358 — U21

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U21 — aceitação manual de URL; não executa instrução em runtime.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0359 — U21

**Fonte:** `      sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0360 — U21

**Fonte:** `        'info',`

**O que faz:** Completa a expressão `'info',` dentro de U21 — aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0361 — U21

**Fonte:** `        'GEMINI_MANUAL_RESULT',`

**O que faz:** Completa a expressão `'GEMINI_MANUAL_RESULT',` dentro de U21 — aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0362 — U21

**Fonte:** `        'Imagem marcada manualmente no Gemini',`

**O que faz:** Completa a expressão `'Imagem marcada manualmente no Gemini',` dentro de U21 — aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0363 — U21

**Fonte:** `        { source, ...getUrlLogMetadata(url) }`

**O que faz:** Completa a expressão `{ source, ...getUrlLogMetadata(url) }` dentro de U21 — aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0364 — U21

**Fonte:** `      );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U21, delimitando aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0365 — U21

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U21, delimitando aceitação manual de URL.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0366 — U21

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U21 — aceitação manual de URL; não executa instrução em runtime.

**Como faz:** armazena URL manual, entrega ao observer ativo, atualiza HUD e registra metadados sanitizados.

**Por que foi implementado dessa forma:** a intervenção deve entrar pela mesma autoridade de resultado em vez de contornar a pipeline.

**Por que uma implementação ingênua seria pior:** entrega paralela fora do observer poderia pular quarentena, ownership e cleanup.

### Linha 0367 — U22

**Fonte:** `    function removeGeminiManualPanel() {`

**O que faz:** Declara a função `removeGeminiManualPanel` pertencente a U22 — remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0368 — U22

**Fonte:** `      const existing = root.getElementById('mt-gemini-assist');`

**O que faz:** Declara a constante `existing` e inicia sua expressão em U22 — remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0369 — U22

**Fonte:** `      if (existing) existing.remove();`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (existing) existing.remove();`, protegendo remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0370 — U22

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U22 — remoção do HUD manual; não executa instrução em runtime.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0371 — U22

**Fonte:** `      if (pageWindow.__mangaTranslatorManualPickHandler) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (pageWindow.__mangaTranslatorManualPickHandler) {`, protegendo remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0372 — U22

**Fonte:** `        root.removeEventListener(`

**O que faz:** Executa a chamada `root.removeEventListener(` como passo concreto de remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0373 — U22

**Fonte:** `          'click',`

**O que faz:** Completa a expressão `'click',` dentro de U22 — remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0374 — U22

**Fonte:** `          pageWindow.__mangaTranslatorManualPickHandler,`

**O que faz:** Completa a expressão `pageWindow.__mangaTranslatorManualPickHandler,` dentro de U22 — remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0375 — U22

**Fonte:** `          true`

**O que faz:** Completa a expressão `true` dentro de U22 — remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0376 — U22

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U22, delimitando remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0377 — U22

**Fonte:** `        pageWindow.__mangaTranslatorManualPickHandler = null;`

**O que faz:** Atualiza a referência/estado indicado por `pageWindow.__mangaTranslatorManualPickHandler = null;` dentro de remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0378 — U22

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U22, delimitando remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0379 — U22

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U22 — remoção do HUD manual; não executa instrução em runtime.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0380 — U22

**Fonte:** `      queryAllDeep('[data-mt-gemini-pickable="true"]').forEach(image => {`

**O que faz:** Executa a chamada `queryAllDeep('[data-mt-gemini-pickable="true"]').forEach(image => {` como passo concreto de remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0381 — U22

**Fonte:** `        image.style.outline = '';`

**O que faz:** Atualiza a referência/estado indicado por `image.style.outline = '';` dentro de remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0382 — U22

**Fonte:** `        image.style.outlineOffset = '';`

**O que faz:** Atualiza a referência/estado indicado por `image.style.outlineOffset = '';` dentro de remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0383 — U22

**Fonte:** `        image.removeAttribute('data-mt-gemini-pickable');`

**O que faz:** Executa a chamada `image.removeAttribute('data-mt-gemini-pickable');` como passo concreto de remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0384 — U22

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U22 — remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0385 — U22

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U22, delimitando remoção do HUD manual.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0386 — U22

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U22 — remoção do HUD manual; não executa instrução em runtime.

**Como faz:** remove painel, listener de captura e estilos/data attributes de imagens marcadas.

**Por que foi implementado dessa forma:** jobs sucessivos compartilham a mesma página e não podem herdar UI/listeners anteriores.

**Por que uma implementação ingênua seria pior:** cleanup parcial criaria cliques duplicados e contaminação visual entre jobs.

### Linha 0387 — U23

**Fonte:** `    function createGeminiManualPanel(job, getIgnoreImages) {`

**O que faz:** Declara a função `createGeminiManualPanel` pertencente a U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0388 — U23

**Fonte:** `      removeGeminiManualPanel();`

**O que faz:** Executa a chamada `removeGeminiManualPanel();` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0389 — U23

**Fonte:** `      pageWindow.__mangaTranslatorManualGeminiResultUrl = '';`

**O que faz:** Atualiza a referência/estado indicado por `pageWindow.__mangaTranslatorManualGeminiResultUrl = '';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0390 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0391 — U23

**Fonte:** `      const logManualIntervention = source => {`

**O que faz:** Declara a constante `logManualIntervention` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0392 — U23

**Fonte:** `        sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0393 — U23

**Fonte:** `          'error',`

**O que faz:** Completa a expressão `'error',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0394 — U23

**Fonte:** `          'GEMINI_MANUAL_INTERVENTION_REQUIRED',`

**O que faz:** Completa a expressão `'GEMINI_MANUAL_INTERVENTION_REQUIRED',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0395 — U23

**Fonte:** `          'ERRO GRAVE: a detecção automática falhou e o usuário precisou interagir manualmente com o resultado do Gemini.',`

**O que faz:** Completa a expressão `'ERRO GRAVE: a detecção automática falhou e o usuário precisou interagir manualmente com o resultado do Gemini.',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0396 — U23

**Fonte:** `          {`

**O que faz:** Completa a expressão `{` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0397 — U23

**Fonte:** `            source,`

**O que faz:** Completa a expressão `source,` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0398 — U23

**Fonte:** `            index: job?.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0399 — U23

**Fonte:** `            executionMode: job?.executionMode,`

**O que faz:** Define a propriedade `executionMode` do objeto/configuração construído em HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0400 — U23

**Fonte:** `            jobIdPrefix: String(job?.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0401 — U23

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0402 — U23

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0403 — U23

**Fonte:** `      };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0404 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0405 — U23

**Fonte:** `      const panel = root.createElement('div');`

**O que faz:** Declara a constante `panel` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0406 — U23

**Fonte:** `      panel.id = 'mt-gemini-assist';`

**O que faz:** Atualiza a referência/estado indicado por `panel.id = 'mt-gemini-assist';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0407 — U23

**Fonte:** `      panel.style.cssText = [`

**O que faz:** Atualiza a referência/estado indicado por `panel.style.cssText = [` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0408 — U23

**Fonte:** `        'position:fixed',`

**O que faz:** Completa a expressão `'position:fixed',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0409 — U23

**Fonte:** `        'right:16px',`

**O que faz:** Completa a expressão `'right:16px',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0410 — U23

**Fonte:** `        'bottom:16px',`

**O que faz:** Completa a expressão `'bottom:16px',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0411 — U23

**Fonte:** `        'z-index:2147483647',`

**O que faz:** Completa a expressão `'z-index:2147483647',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0412 — U23

**Fonte:** `        'width:260px',`

**O que faz:** Completa a expressão `'width:260px',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0413 — U23

**Fonte:** `        'background:#111',`

**O que faz:** Completa a expressão `'background:#111',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0414 — U23

**Fonte:** `        'color:#fff',`

**O que faz:** Completa a expressão `'color:#fff',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0415 — U23

**Fonte:** `        'border:1px solid #333',`

**O que faz:** Completa a expressão `'border:1px solid #333',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0416 — U23

**Fonte:** `        'border-radius:8px',`

**O que faz:** Completa a expressão `'border-radius:8px',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0417 — U23

**Fonte:** `        'box-shadow:0 10px 28px rgba(0,0,0,0.45)',`

**O que faz:** Completa a expressão `'box-shadow:0 10px 28px rgba(0,0,0,0.45)',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0418 — U23

**Fonte:** `        'font-family:Arial,sans-serif',`

**O que faz:** Completa a expressão `'font-family:Arial,sans-serif',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0419 — U23

**Fonte:** `        'font-size:12px',`

**O que faz:** Completa a expressão `'font-size:12px',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0420 — U23

**Fonte:** `        'padding:12px',`

**O que faz:** Completa a expressão `'padding:12px',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0421 — U23

**Fonte:** `        'line-height:1.35',`

**O que faz:** Completa a expressão `'line-height:1.35',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0422 — U23

**Fonte:** `      ].join(';');`

**O que faz:** Completa a expressão `].join(';');` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0423 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0424 — U23

**Fonte:** `      panel.innerHTML = [`

**O que faz:** Atualiza a referência/estado indicado por `panel.innerHTML = [` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0425 — U23

**Fonte:** `        '<div style="font-weight:700;margin-bottom:4px;">Manga Translator</div>',`

**O que faz:** Completa a expressão `'<div style="font-weight:700;margin-bottom:4px;">Manga Translator</div>',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0426 — U23

**Fonte:** `        '<div id="mt-gemini-assist-description" style="color:#aaa;margin-bottom:8px;"></div>',`

**O que faz:** Completa a expressão `'<div id="mt-gemini-assist-description" style="color:#aaa;margin-bottom:8px;"></div>',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0427 — U23

**Fonte:** `        '<div style="display:flex;gap:6px;margin-bottom:8px;">',`

**O que faz:** Completa a expressão `'<div style="display:flex;gap:6px;margin-bottom:8px;">',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0428 — U23

**Fonte:** `        '<button id="mt-gemini-use-last" style="flex:1;background:#FF4444;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Usar última</button>',`

**O que faz:** Completa a expressão `'<button id="mt-gemini-use-last" style="flex:1;background:#FF4444;color:#fff;border:none;border-radius:5px;padding…` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0429 — U23

**Fonte:** `        '<button id="mt-gemini-pick" style="flex:1;background:#2b5f9c;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Selecionar</button>',`

**O que faz:** Completa a expressão `'<button id="mt-gemini-pick" style="flex:1;background:#2b5f9c;color:#fff;border:none;border-radius:5px;padding:7px…` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0430 — U23

**Fonte:** `        '</div>',`

**O que faz:** Completa a expressão `'</div>',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0431 — U23

**Fonte:** `        '<div id="mt-gemini-assist-status" style="color:#888;">Aguardando imagem gerada.</div>',`

**O que faz:** Completa a expressão `'<div id="mt-gemini-assist-status" style="color:#888;">Aguardando imagem gerada.</div>',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0432 — U23

**Fonte:** `      ].join('');`

**O que faz:** Completa a expressão `].join('');` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0433 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0434 — U23

**Fonte:** `      const imageNumber = Number.isFinite(Number(job.index))`

**O que faz:** Declara a constante `imageNumber` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0435 — U23

**Fonte:** `        ? Number(job.index) + 1`

**O que faz:** Completa a expressão `? Number(job.index) + 1` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0436 — U23

**Fonte:** `        : 1;`

**O que faz:** Completa a expressão `: 1;` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0437 — U23

**Fonte:** `      panel.querySelector('#mt-gemini-assist-description').textContent =`

**O que faz:** Executa a chamada `panel.querySelector('#mt-gemini-assist-description').textContent =` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0438 — U23

**Fonte:** `        \`Imagem ${imageNumber}: marque o resultado correto se a detecção automática não pegar.\`;`

**O que faz:** Completa a expressão ``Imagem ${imageNumber}: marque o resultado correto se a detecção automática não pegar.`;` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0439 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0440 — U23

**Fonte:** `      panel.addEventListener('click', event => event.stopPropagation());`

**O que faz:** Executa a chamada `panel.addEventListener('click', event => event.stopPropagation());` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0441 — U23

**Fonte:** `      root.documentElement.appendChild(panel);`

**O que faz:** Executa a chamada `root.documentElement.appendChild(panel);` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0442 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0443 — U23

**Fonte:** `      panel.querySelector('#mt-gemini-use-last').addEventListener('click', () => {`

**O que faz:** Executa a chamada `panel.querySelector('#mt-gemini-use-last').addEventListener('click', () => {` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0444 — U23

**Fonte:** `        logManualIntervention('last-button');`

**O que faz:** Executa a chamada `logManualIntervention('last-button');` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0445 — U23

**Fonte:** `        const images = findGeneratedResultImages(getIgnoreImages());`

**O que faz:** Declara a constante `images` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0446 — U23

**Fonte:** `        const candidate = images[images.length - 1];`

**O que faz:** Declara a constante `candidate` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0447 — U23

**Fonte:** `        if (candidate) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (candidate) {`, protegendo HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0448 — U23

**Fonte:** `          setManualGeminiResultUrl(getImageSource(candidate), 'last-button');`

**O que faz:** Executa a chamada `setManualGeminiResultUrl(getImageSource(candidate), 'last-button');` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0449 — U23

**Fonte:** `        } else {`

**O que faz:** Abre o ramo alternativo da decisão imediatamente anterior em HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0450 — U23

**Fonte:** `          panel.querySelector('#mt-gemini-assist-status').textContent =`

**O que faz:** Executa a chamada `panel.querySelector('#mt-gemini-assist-status').textContent =` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0451 — U23

**Fonte:** `            'Ainda não encontrei uma imagem candidata.';`

**O que faz:** Completa a expressão `'Ainda não encontrei uma imagem candidata.';` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0452 — U23

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0453 — U23

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0454 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0455 — U23

**Fonte:** `      panel.querySelector('#mt-gemini-pick').addEventListener('click', () => {`

**O que faz:** Executa a chamada `panel.querySelector('#mt-gemini-pick').addEventListener('click', () => {` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0456 — U23

**Fonte:** `        logManualIntervention('pick-button');`

**O que faz:** Executa a chamada `logManualIntervention('pick-button');` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0457 — U23

**Fonte:** `        const status = panel.querySelector('#mt-gemini-assist-status');`

**O que faz:** Declara a constante `status` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0458 — U23

**Fonte:** `        status.textContent = 'Clique diretamente na imagem correta gerada pelo Gemini.';`

**O que faz:** Atualiza a referência/estado indicado por `status.textContent = 'Clique diretamente na imagem correta gerada pelo Gemini.';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0459 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0460 — U23

**Fonte:** `        queryAllDeep('img').forEach(image => {`

**O que faz:** Executa a chamada `queryAllDeep('img').forEach(image => {` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0461 — U23

**Fonte:** `          if (!isManualSelectableImage(image, getIgnoreImages())) return;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!isManualSelectableImage(image, getIgnoreImages())) return;`, protegendo HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0462 — U23

**Fonte:** `          image.dataset.mtGeminiPickable = 'true';`

**O que faz:** Atualiza a referência/estado indicado por `image.dataset.mtGeminiPickable = 'true';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0463 — U23

**Fonte:** `          image.style.outline = '3px solid #FF4444';`

**O que faz:** Atualiza a referência/estado indicado por `image.style.outline = '3px solid #FF4444';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0464 — U23

**Fonte:** `          image.style.outlineOffset = '2px';`

**O que faz:** Atualiza a referência/estado indicado por `image.style.outlineOffset = '2px';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0465 — U23

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0466 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0467 — U23

**Fonte:** `        if (pageWindow.__mangaTranslatorManualPickHandler) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (pageWindow.__mangaTranslatorManualPickHandler) {`, protegendo HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0468 — U23

**Fonte:** `          root.removeEventListener(`

**O que faz:** Executa a chamada `root.removeEventListener(` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0469 — U23

**Fonte:** `            'click',`

**O que faz:** Completa a expressão `'click',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0470 — U23

**Fonte:** `            pageWindow.__mangaTranslatorManualPickHandler,`

**O que faz:** Completa a expressão `pageWindow.__mangaTranslatorManualPickHandler,` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0471 — U23

**Fonte:** `            true`

**O que faz:** Completa a expressão `true` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0472 — U23

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0473 — U23

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0474 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0475 — U23

**Fonte:** `        pageWindow.__mangaTranslatorManualPickHandler = event => {`

**O que faz:** Atualiza a referência/estado indicado por `pageWindow.__mangaTranslatorManualPickHandler = event => {` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0476 — U23

**Fonte:** `          const composedImage = event.composedPath?.().find(node =>`

**O que faz:** Declara a constante `composedImage` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0477 — U23

**Fonte:** `            String(node?.tagName || '').toUpperCase() === 'IMG'`

**O que faz:** Executa a chamada `String(node?.tagName || '').toUpperCase() === 'IMG'` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0478 — U23

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0479 — U23

**Fonte:** `          const image = composedImage || event.target?.closest?.('img');`

**O que faz:** Declara a constante `image` e inicia sua expressão em U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0480 — U23

**Fonte:** `          if (!image || !isManualSelectableImage(image, getIgnoreImages())) return;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!image || !isManualSelectableImage(image, getIgnoreImages())) return;`, protegendo HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0481 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0482 — U23

**Fonte:** `          event.preventDefault();`

**O que faz:** Executa a chamada `event.preventDefault();` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0483 — U23

**Fonte:** `          event.stopPropagation();`

**O que faz:** Executa a chamada `event.stopPropagation();` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0484 — U23

**Fonte:** `          setManualGeminiResultUrl(getImageSource(image), 'image-click');`

**O que faz:** Executa a chamada `setManualGeminiResultUrl(getImageSource(image), 'image-click');` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0485 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0486 — U23

**Fonte:** `          root.removeEventListener(`

**O que faz:** Executa a chamada `root.removeEventListener(` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0487 — U23

**Fonte:** `            'click',`

**O que faz:** Completa a expressão `'click',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0488 — U23

**Fonte:** `            pageWindow.__mangaTranslatorManualPickHandler,`

**O que faz:** Completa a expressão `pageWindow.__mangaTranslatorManualPickHandler,` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0489 — U23

**Fonte:** `            true`

**O que faz:** Completa a expressão `true` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0490 — U23

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0491 — U23

**Fonte:** `          pageWindow.__mangaTranslatorManualPickHandler = null;`

**O que faz:** Atualiza a referência/estado indicado por `pageWindow.__mangaTranslatorManualPickHandler = null;` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0492 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0493 — U23

**Fonte:** `          root.querySelectorAll('[data-mt-gemini-pickable="true"]').forEach(candidate => {`

**O que faz:** Executa a chamada `root.querySelectorAll('[data-mt-gemini-pickable="true"]').forEach(candidate => {` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0494 — U23

**Fonte:** `            candidate.style.outline = '';`

**O que faz:** Atualiza a referência/estado indicado por `candidate.style.outline = '';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0495 — U23

**Fonte:** `            candidate.style.outlineOffset = '';`

**O que faz:** Atualiza a referência/estado indicado por `candidate.style.outlineOffset = '';` dentro de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0496 — U23

**Fonte:** `            candidate.removeAttribute('data-mt-gemini-pickable');`

**O que faz:** Executa a chamada `candidate.removeAttribute('data-mt-gemini-pickable');` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0497 — U23

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0498 — U23

**Fonte:** `        };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0499 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0500 — U23

**Fonte:** `        root.addEventListener(`

**O que faz:** Executa a chamada `root.addEventListener(` como passo concreto de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0501 — U23

**Fonte:** `          'click',`

**O que faz:** Completa a expressão `'click',` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0502 — U23

**Fonte:** `          pageWindow.__mangaTranslatorManualPickHandler,`

**O que faz:** Completa a expressão `pageWindow.__mangaTranslatorManualPickHandler,` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0503 — U23

**Fonte:** `          true`

**O que faz:** Completa a expressão `true` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0504 — U23

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0505 — U23

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U23 — HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0506 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0507 — U23

**Fonte:** `      return panel;`

**O que faz:** Retorna `panel;` como resultado desta etapa de HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0508 — U23

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U23, delimitando HUD de assistência manual.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0509 — U23

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U23 — HUD de assistência manual; não executa instrução em runtime.

**Como faz:** cria painel estático, registra intervenção grave, oferece última candidata ou clique composto e desmonta marcações após seleção.

**Por que foi implementado dessa forma:** fallback humano deve ser observável e não silenciosamente mascarar regressão da automação.

**Por que uma implementação ingênua seria pior:** um fallback invisível esconderia falhas; innerHTML dinâmico com dados do job elevaria risco de injeção.

### Linha 0510 — U24

**Fonte:** `    function setPromptInEditor(currentEditable, currentEditor, actualPrompt) {`

**O que faz:** Declara a função `setPromptInEditor` pertencente a U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0511 — U24

**Fonte:** `      if (!currentEditable) return false;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!currentEditable) return false;`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0512 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0513 — U24

**Fonte:** `      const prompt = String(actualPrompt || '');`

**O que faz:** Declara a constante `prompt` e inicia sua expressão em U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0514 — U24

**Fonte:** `      const existing = String(currentEditable.textContent || '').trim();`

**O que faz:** Declara a constante `existing` e inicia sua expressão em U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0515 — U24

**Fonte:** `      if (existing === prompt.trim()) return true;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (existing === prompt.trim()) return true;`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0516 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0517 — U24

**Fonte:** `      try { currentEditable.focus?.(); } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de injeção de prompt pode falhar por DOM/API externa.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0518 — U24

**Fonte:** `      if (currentEditor && currentEditor !== currentEditable) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (currentEditor && currentEditor !== currentEditable) {`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0519 — U24

**Fonte:** `        try { currentEditor.focus?.(); } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de injeção de prompt pode falhar por DOM/API externa.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0520 — U24

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U24, delimitando injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0521 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0522 — U24

**Fonte:** `      const FocusEventImpl = scope.FocusEvent || scope.Event;`

**O que faz:** Declara a constante `FocusEventImpl` e inicia sua expressão em U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0523 — U24

**Fonte:** `      try {`

**O que faz:** Inicia bloco protegido porque esta operação de injeção de prompt pode falhar por DOM/API externa.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0524 — U24

**Fonte:** `        currentEditable.dispatchEvent(new FocusEventImpl('focus', {`

**O que faz:** Executa a chamada `currentEditable.dispatchEvent(new FocusEventImpl('focus', {` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0525 — U24

**Fonte:** `          bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0526 — U24

**Fonte:** `          composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0527 — U24

**Fonte:** `        }));`

**O que faz:** Completa a expressão `}));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0528 — U24

**Fonte:** `        currentEditable.dispatchEvent(new FocusEventImpl('focusin', {`

**O que faz:** Executa a chamada `currentEditable.dispatchEvent(new FocusEventImpl('focusin', {` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0529 — U24

**Fonte:** `          bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0530 — U24

**Fonte:** `          composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0531 — U24

**Fonte:** `        }));`

**O que faz:** Completa a expressão `}));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0532 — U24

**Fonte:** `      } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0533 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0534 — U24

**Fonte:** `      const quill = currentEditable.__quill ||`

**O que faz:** Declara a constante `quill` e inicia sua expressão em U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0535 — U24

**Fonte:** `        currentEditor?.__quill ||`

**O que faz:** Completa a expressão `currentEditor?.__quill ||` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0536 — U24

**Fonte:** `        (pageWindow.Quill &&`

**O que faz:** Completa a expressão `(pageWindow.Quill &&` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0537 — U24

**Fonte:** `          typeof pageWindow.Quill.find === 'function' &&`

**O que faz:** Completa a expressão `typeof pageWindow.Quill.find === 'function' &&` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0538 — U24

**Fonte:** `          (pageWindow.Quill.find(currentEditable) || pageWindow.Quill.find(currentEditor)));`

**O que faz:** Completa a expressão `(pageWindow.Quill.find(currentEditable) || pageWindow.Quill.find(currentEditor)));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0539 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0540 — U24

**Fonte:** `      if (quill) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (quill) {`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0541 — U24

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de injeção de prompt pode falhar por DOM/API externa.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0542 — U24

**Fonte:** `          if (typeof quill.setText === 'function') quill.setText(prompt, 'user');`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof quill.setText === 'function') quill.setText(prompt, 'user');`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0543 — U24

**Fonte:** `          if (typeof quill.update === 'function') quill.update('user');`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof quill.update === 'function') quill.update('user');`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0544 — U24

**Fonte:** `        } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0545 — U24

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U24, delimitando injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0546 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0547 — U24

**Fonte:** `      const paragraph = root.createElement('p');`

**O que faz:** Declara a constante `paragraph` e inicia sua expressão em U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0548 — U24

**Fonte:** `      paragraph.textContent = prompt;`

**O que faz:** Atualiza a referência/estado indicado por `paragraph.textContent = prompt;` dentro de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0549 — U24

**Fonte:** `      if (typeof currentEditable.replaceChildren === 'function') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof currentEditable.replaceChildren === 'function') {`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0550 — U24

**Fonte:** `        currentEditable.replaceChildren(paragraph);`

**O que faz:** Executa a chamada `currentEditable.replaceChildren(paragraph);` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0551 — U24

**Fonte:** `      } else {`

**O que faz:** Abre o ramo alternativo da decisão imediatamente anterior em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0552 — U24

**Fonte:** `        while (currentEditable.firstChild) {`

**O que faz:** Mantém o laço enquanto `while (currentEditable.firstChild) {`, implementando a espera/retry de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0553 — U24

**Fonte:** `          currentEditable.removeChild(currentEditable.firstChild);`

**O que faz:** Executa a chamada `currentEditable.removeChild(currentEditable.firstChild);` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0554 — U24

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U24, delimitando injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0555 — U24

**Fonte:** `        currentEditable.appendChild(paragraph);`

**O que faz:** Executa a chamada `currentEditable.appendChild(paragraph);` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0556 — U24

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U24, delimitando injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0557 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0558 — U24

**Fonte:** `      const InputEventImpl = scope.InputEvent || scope.Event;`

**O que faz:** Declara a constante `InputEventImpl` e inicia sua expressão em U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0559 — U24

**Fonte:** `      try {`

**O que faz:** Inicia bloco protegido porque esta operação de injeção de prompt pode falhar por DOM/API externa.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0560 — U24

**Fonte:** `        currentEditable.dispatchEvent(new InputEventImpl('beforeinput', {`

**O que faz:** Executa a chamada `currentEditable.dispatchEvent(new InputEventImpl('beforeinput', {` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0561 — U24

**Fonte:** `          bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0562 — U24

**Fonte:** `          cancelable: true,`

**O que faz:** Define a propriedade `cancelable` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0563 — U24

**Fonte:** `          composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0564 — U24

**Fonte:** `          inputType: 'insertText',`

**O que faz:** Define a propriedade `inputType` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0565 — U24

**Fonte:** `          data: prompt,`

**O que faz:** Define a propriedade `data` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0566 — U24

**Fonte:** `        }));`

**O que faz:** Completa a expressão `}));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0567 — U24

**Fonte:** `        currentEditable.dispatchEvent(new InputEventImpl('input', {`

**O que faz:** Executa a chamada `currentEditable.dispatchEvent(new InputEventImpl('input', {` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0568 — U24

**Fonte:** `          bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0569 — U24

**Fonte:** `          cancelable: true,`

**O que faz:** Define a propriedade `cancelable` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0570 — U24

**Fonte:** `          composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0571 — U24

**Fonte:** `          inputType: 'insertText',`

**O que faz:** Define a propriedade `inputType` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0572 — U24

**Fonte:** `          data: prompt,`

**O que faz:** Define a propriedade `data` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0573 — U24

**Fonte:** `        }));`

**O que faz:** Completa a expressão `}));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0574 — U24

**Fonte:** `        currentEditable.dispatchEvent(new scope.Event('input', {`

**O que faz:** Executa a chamada `currentEditable.dispatchEvent(new scope.Event('input', {` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0575 — U24

**Fonte:** `          bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0576 — U24

**Fonte:** `          composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0577 — U24

**Fonte:** `        }));`

**O que faz:** Completa a expressão `}));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0578 — U24

**Fonte:** `        currentEditable.dispatchEvent(new scope.Event('change', {`

**O que faz:** Executa a chamada `currentEditable.dispatchEvent(new scope.Event('change', {` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0579 — U24

**Fonte:** `          bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0580 — U24

**Fonte:** `          composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0581 — U24

**Fonte:** `        }));`

**O que faz:** Completa a expressão `}));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0582 — U24

**Fonte:** `      } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0583 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0584 — U24

**Fonte:** `      if (currentEditor && 'value' in currentEditor) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (currentEditor && 'value' in currentEditor) {`, protegendo injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0585 — U24

**Fonte:** `        try { currentEditor.value = prompt; } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de injeção de prompt pode falhar por DOM/API externa.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0586 — U24

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de injeção de prompt pode falhar por DOM/API externa.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0587 — U24

**Fonte:** `          currentEditor.dispatchEvent(new scope.Event('input', {`

**O que faz:** Executa a chamada `currentEditor.dispatchEvent(new scope.Event('input', {` como passo concreto de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0588 — U24

**Fonte:** `            bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0589 — U24

**Fonte:** `            composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0590 — U24

**Fonte:** `          }));`

**O que faz:** Completa a expressão `}));` dentro de U24 — injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0591 — U24

**Fonte:** `        } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0592 — U24

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U24, delimitando injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0593 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0594 — U24

**Fonte:** `      return String(currentEditable.textContent || '').trim().length >= 5;`

**O que faz:** Retorna `String(currentEditable.textContent || '').trim().length >= 5;` como resultado desta etapa de injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0595 — U24

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U24, delimitando injeção de prompt.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0596 — U24

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U24 — injeção de prompt; não executa instrução em runtime.

**Como faz:** foca editor, tenta API Quill, substitui conteúdo, emite eventos de input/change e espelha value quando necessário.

**Por que foi implementado dessa forma:** frameworks diferentes observam canais de atualização distintos e o Gemini pode mudar implementação.

**Por que uma implementação ingênua seria pior:** apenas atribuir `textContent` poderia deixar estado interno do framework desatualizado.

### Linha 0597 — U25

**Fonte:** `    async function shouldKeepConversationForDebug(delivery, executionMode) {`

**O que faz:** Declara a função `shouldKeepConversationForDebug` pertencente a U25 — preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0598 — U25

**Fonte:** `      if (`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (`, protegendo preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0599 — U25

**Fonte:** `        executionMode !== 'background_delete' ||`

**O que faz:** Completa a expressão `executionMode !== 'background_delete' ||` dentro de U25 — preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0600 — U25

**Fonte:** `        !delivery ||`

**O que faz:** Completa a expressão `!delivery ||` dentro de U25 — preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0601 — U25

**Fonte:** `        delivery.action !== 'GEMINI_ERROR'`

**O que faz:** Completa a expressão `delivery.action !== 'GEMINI_ERROR'` dentro de U25 — preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0602 — U25

**Fonte:** `      ) {`

**O que faz:** Completa a expressão `) {` dentro de U25 — preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0603 — U25

**Fonte:** `        return false;`

**O que faz:** Retorna `false;` como resultado desta etapa de preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0604 — U25

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U25, delimitando preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0605 — U25

**Fonte:** `      const data = await storageGet(['debugMode']);`

**O que faz:** Declara a constante `data` e inicia sua expressão em U25 — preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0606 — U25

**Fonte:** `      return data.debugMode === true;`

**O que faz:** Retorna `data.debugMode === true;` como resultado desta etapa de preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0607 — U25

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U25, delimitando preservação de conversa em debug.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0608 — U25

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U25 — preservação de conversa em debug; não executa instrução em runtime.

**Como faz:** retorna true somente para erro em `background_delete` com `debugMode` ativo.

**Por que foi implementado dessa forma:** a exceção de retenção precisa ser mínima e explícita para não alterar privacidade de casos normais.

**Por que uma implementação ingênua seria pior:** preservar toda conversa ou todo erro violaria a política de limpeza dos outros modos.

### Linha 0609 — U26

**Fonte:** `    function sendRuntimeMessage(message) {`

**O que faz:** Declara a função `sendRuntimeMessage` pertencente a U26 — sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0610 — U26

**Fonte:** `      return new Promise(resolve => {`

**O que faz:** Retorna `new Promise(resolve => {` como resultado desta etapa de sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0611 — U26

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de sendMessage tolerante para aquisição pode falhar por DOM/API externa.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0612 — U26

**Fonte:** `          runtime.sendMessage(message, response => {`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0613 — U26

**Fonte:** `            if (runtime.lastError) resolve(null);`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (runtime.lastError) resolve(null);`, protegendo sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0614 — U26

**Fonte:** `            else resolve(response || null);`

**O que faz:** Abre o ramo alternativo da decisão imediatamente anterior em sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0615 — U26

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U26 — sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0616 — U26

**Fonte:** `        } catch (_e) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0617 — U26

**Fonte:** `          resolve(null);`

**O que faz:** Executa a chamada `resolve(null);` como passo concreto de sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0618 — U26

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U26, delimitando sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0619 — U26

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U26 — sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0620 — U26

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U26, delimitando sendMessage tolerante para aquisição.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0621 — U26

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U26 — sendMessage tolerante para aquisição; não executa instrução em runtime.

**Como faz:** converte callback de runtime em Promise e retorna null em lastError/exceção.

**Por que foi implementado dessa forma:** a aquisição da imagem possui retry e precisa tratar falta transitória como ausência, não crash.

**Por que uma implementação ingênua seria pior:** propagar cada falha transitória eliminaria a janela de recuperação prevista.

### Linha 0622 — U27

**Fonte:** `    async function requestImageData(job) {`

**O que faz:** Declara a função `requestImageData` pertencente a U27 — retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0623 — U27

**Fonte:** `      for (let attempt = 1; attempt <= 5; attempt += 1) {`

**O que faz:** Inicia iteração `for (let attempt = 1; attempt <= 5; attempt += 1) {` necessária a retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0624 — U27

**Fonte:** `        const response = await sendRuntimeMessage({`

**O que faz:** Declara a constante `response` e inicia sua expressão em U27 — retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0625 — U27

**Fonte:** `          action: 'REQUEST_IMAGE_DATA',`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0626 — U27

**Fonte:** `          mangaTabId: job.mangaTabId,`

**O que faz:** Define a propriedade `mangaTabId` do objeto/configuração construído em retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0627 — U27

**Fonte:** `          index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0628 — U27

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U27 — retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0629 — U27

**Fonte:** `        if (response?.srcData) return response;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (response?.srcData) return response;`, protegendo retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0630 — U27

**Fonte:** `        await sleep(1000);`

**O que faz:** Suspende esta função até concluir `sleep(1000);`, preservando a ordem assíncrona de retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0631 — U27

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U27, delimitando retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0632 — U27

**Fonte:** `      return null;`

**O que faz:** Retorna `null;` como resultado desta etapa de retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0633 — U27

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U27, delimitando retry de REQUEST_IMAGE_DATA.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0634 — U27

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U27 — retry de REQUEST_IMAGE_DATA; não executa instrução em runtime.

**Como faz:** faz até cinco solicitações com pausa de 1 s e encerra assim que recebe `srcData`.

**Por que foi implementado dessa forma:** o content script do mangá pode ainda não responder no primeiro instante.

**Por que uma implementação ingênua seria pior:** uma tentativa única criaria falso erro por race de inicialização; retry infinito prenderia o job.

### Linha 0635 — U28

**Fonte:** `    function assertStage(condition, errorMessage, step, successMessage = '') {`

**O que faz:** Declara a função `assertStage` pertencente a U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0636 — U28

**Fonte:** `      if (!condition) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!condition) {`, protegendo assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0637 — U28

**Fonte:** `        const fullError = \`[ERRO CRÍTICO - ETAPA ${step}] ${errorMessage}\`;`

**O que faz:** Declara a constante `fullError` e inicia sua expressão em U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0638 — U28

**Fonte:** `        debugConsole('error', fullError);`

**O que faz:** Inicia diagnóstico de console para a etapa assertions de etapa, separado do log persistente.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0639 — U28

**Fonte:** `        sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0640 — U28

**Fonte:** `          'error',`

**O que faz:** Completa a expressão `'error',` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0641 — U28

**Fonte:** `          \`TEST_FAIL_STEP_${step}\`,`

**O que faz:** Completa a expressão ``TEST_FAIL_STEP_${step}`,` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0642 — U28

**Fonte:** `          errorMessage,`

**O que faz:** Completa a expressão `errorMessage,` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0643 — U28

**Fonte:** `          { path: pageWindow.location.pathname }`

**O que faz:** Completa a expressão `{ path: pageWindow.location.pathname }` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0644 — U28

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U28, delimitando assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0645 — U28

**Fonte:** `        throw new Error(fullError);`

**O que faz:** Interrompe o fluxo lançando `new Error(fullError);` quando a invariante da unidade falha.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0646 — U28

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U28, delimitando assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0647 — U28

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U28 — assertions de etapa; não executa instrução em runtime.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0648 — U28

**Fonte:** `      sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0649 — U28

**Fonte:** `        'success',`

**O que faz:** Completa a expressão `'success',` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0650 — U28

**Fonte:** `        \`TEST_PASS_STEP_${step}\`,`

**O que faz:** Completa a expressão ``TEST_PASS_STEP_${step}`,` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0651 — U28

**Fonte:** `        successMessage || \`Etapa ${step} com sucesso\`,`

**O que faz:** Completa a expressão `successMessage || `Etapa ${step} com sucesso`,` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0652 — U28

**Fonte:** `        { path: pageWindow.location.pathname }`

**O que faz:** Completa a expressão `{ path: pageWindow.location.pathname }` dentro de U28 — assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0653 — U28

**Fonte:** `      );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U28, delimitando assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0654 — U28

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U28, delimitando assertions de etapa.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0655 — U28

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U28 — assertions de etapa; não executa instrução em runtime.

**Como faz:** em falha loga `TEST_FAIL_STEP_n` e lança; em sucesso loga `TEST_PASS_STEP_n`.

**Por que foi implementado dessa forma:** invariantes de pipeline precisam interromper cedo e fornecer diagnóstico de estágio.

**Por que uma implementação ingênua seria pior:** continuar após precondição falsa propagaria estado inválido para etapas mais destrutivas.

### Linha 0656 — U29

**Fonte:** `    async function run(job) {`

**O que faz:** Declara a função `run` pertencente a U29 — entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0657 — U29

**Fonte:** `      if (!job) throw new Error('Job Gemini é obrigatório');`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!job) throw new Error('Job Gemini é obrigatório');`, protegendo entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0658 — U29

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U29 — entrada do run e recovery; não executa instrução em runtime.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0659 — U29

**Fonte:** `      setAntiThrottleMode('minimal');`

**O que faz:** Executa a chamada `setAntiThrottleMode('minimal');` como passo concreto de entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0660 — U29

**Fonte:** `      const myTabId = job.geminiTabId;`

**O que faz:** Declara a constante `myTabId` e inicia sua expressão em U29 — entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0661 — U29

**Fonte:** `      let watchdogRefreshRequested = false;`

**O que faz:** Declara o estado mutável `watchdogRefreshRequested` com o valor inicial mostrado, no contexto de entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0662 — U29

**Fonte:** `      const recoveryResult = await deletionController.recoverPending({`

**O que faz:** Declara a constante `recoveryResult` e inicia sua expressão em U29 — entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0663 — U29

**Fonte:** `        tabId: myTabId,`

**O que faz:** Define a propriedade `tabId` do objeto/configuração construído em entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0664 — U29

**Fonte:** `        sendDelivery: async delivery => {`

**O que faz:** Define a propriedade `sendDelivery` do objeto/configuração construído em entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0665 — U29

**Fonte:** `          runtime.sendMessage(delivery);`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0666 — U29

**Fonte:** `        },`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U29, delimitando entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0667 — U29

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U29 — entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0668 — U29

**Fonte:** `      if (recoveryResult.handled) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (recoveryResult.handled) {`, protegendo entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0669 — U29

**Fonte:** `        return { status: 'recovery_handled', deleted: recoveryResult.deleted };`

**O que faz:** Retorna `{ status: 'recovery_handled', deleted: recoveryResult.deleted };` como resultado desta etapa de entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0670 — U29

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U29, delimitando entrada do run e recovery.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0671 — U29

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U29 — entrada do run e recovery; não executa instrução em runtime.

**Como faz:** exige job, reseta anti-throttle, tenta recovery de deleção pendente e retorna antes do keepalive quando recovery já resolveu a obrigação.

**Por que foi implementado dessa forma:** uma entrega/recovery antigo deve ser resolvido antes de iniciar nova automação na mesma aba.

**Por que uma implementação ingênua seria pior:** abrir novo fluxo antes do recovery pode misturar duas conclusões e duplicar entrega.

### Linha 0672 — U30

**Fonte:** `      openKeepAlive();`

**O que faz:** Executa a chamada `openKeepAlive();` como passo concreto de abertura de keepalive e log de identidade.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0673 — U30

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U30 — abertura de keepalive e log de identidade; não executa instrução em runtime.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0674 — U30

**Fonte:** `      debugConsole('log', '[MangaTranslator Gemini] Job confirmado por claim:', {`

**O que faz:** Inicia diagnóstico de console para a etapa abertura de keepalive e log de identidade, separado do log persistente.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0675 — U30

**Fonte:** `        jobId: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em abertura de keepalive e log de identidade.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0676 — U30

**Fonte:** `        index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em abertura de keepalive e log de identidade.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0677 — U30

**Fonte:** `        geminiTabId: myTabId,`

**O que faz:** Define a propriedade `geminiTabId` do objeto/configuração construído em abertura de keepalive e log de identidade.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0678 — U30

**Fonte:** `      });`

**O que faz:** Completa a expressão `});` dentro de U30 — abertura de keepalive e log de identidade.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0679 — U30

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U30 — abertura de keepalive e log de identidade; não executa instrução em runtime.

**Como faz:** abre keepalive e registra prefixo do job, índice e tabId.

**Por que foi implementado dessa forma:** operações longas precisam manter o canal vivo e diagnósticos devem evitar expor identificador completo.

**Por que uma implementação ingênua seria pior:** sem keepalive a execução longa pode perder conectividade; logar ID completo amplia dados desnecessários.

### Linha 0680 — U31

**Fonte:** `      let scrollInterval = null;`

**O que faz:** Declara o estado mutável `scrollInterval` com o valor inicial mostrado, no contexto de scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0681 — U31

**Fonte:** `      let executionMode = job.executionMode || null;`

**O que faz:** Declara o estado mutável `executionMode` com o valor inicial mostrado, no contexto de scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0682 — U31

**Fonte:** `      let inputImageHash = null;`

**O que faz:** Declara o estado mutável `inputImageHash` com o valor inicial mostrado, no contexto de scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0683 — U31

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U31 — scroll assist e cleanup; não executa instrução em runtime.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0684 — U31

**Fonte:** `      const startScrollAssist = () => {`

**O que faz:** Declara a constante `startScrollAssist` e inicia sua expressão em U31 — scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0685 — U31

**Fonte:** `        scrollInterval = setIntervalFn(() => {`

**O que faz:** Atualiza a referência/estado indicado por `scrollInterval = setIntervalFn(() => {` dentro de scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0686 — U31

**Fonte:** `          try {`

**O que faz:** Inicia bloco protegido porque esta operação de scroll assist e cleanup pode falhar por DOM/API externa.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0687 — U31

**Fonte:** `            pageWindow.scrollTo(0, root.body.scrollHeight);`

**O que faz:** Executa a chamada `pageWindow.scrollTo(0, root.body.scrollHeight);` como passo concreto de scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0688 — U31

**Fonte:** `            const images = root.querySelectorAll('img');`

**O que faz:** Declara a constante `images` e inicia sua expressão em U31 — scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0689 — U31

**Fonte:** `            if (images.length > 0) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (images.length > 0) {`, protegendo scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0690 — U31

**Fonte:** `              images[images.length - 1].scrollIntoView({`

**O que faz:** Completa a expressão `images[images.length - 1].scrollIntoView({` dentro de U31 — scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0691 — U31

**Fonte:** `                behavior: 'smooth',`

**O que faz:** Define a propriedade `behavior` do objeto/configuração construído em scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0692 — U31

**Fonte:** `                block: 'center',`

**O que faz:** Define a propriedade `block` do objeto/configuração construído em scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0693 — U31

**Fonte:** `              });`

**O que faz:** Completa a expressão `});` dentro de U31 — scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0694 — U31

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U31, delimitando scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0695 — U31

**Fonte:** `          } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0696 — U31

**Fonte:** `        }, 2000);`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U31, delimitando scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0697 — U31

**Fonte:** `      };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U31, delimitando scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0698 — U31

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U31 — scroll assist e cleanup; não executa instrução em runtime.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0699 — U31

**Fonte:** `      const stopScrollAssist = () => {`

**O que faz:** Declara a constante `stopScrollAssist` e inicia sua expressão em U31 — scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0700 — U31

**Fonte:** `        if (scrollInterval !== null) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (scrollInterval !== null) {`, protegendo scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0701 — U31

**Fonte:** `          try { clearIntervalFn(scrollInterval); } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de scroll assist e cleanup pode falhar por DOM/API externa.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0702 — U31

**Fonte:** `          scrollInterval = null;`

**O que faz:** Atualiza a referência/estado indicado por `scrollInterval = null;` dentro de scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0703 — U31

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U31, delimitando scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0704 — U31

**Fonte:** `      };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U31, delimitando scroll assist e cleanup.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0705 — U31

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U31 — scroll assist e cleanup; não executa instrução em runtime.

**Como faz:** cria intervalo de 2 s para levar fim/imagem à viewport e fornece cancelamento idempotente.

**Por que foi implementado dessa forma:** renderização/lazy-loading da UI pode depender de viewport.

**Por que uma implementação ingênua seria pior:** timer sem cleanup vazaria para o próximo job; nenhuma assistência poderia deixar resultado não materializado.

### Linha 0706 — U32

**Fonte:** `      async function deliverWithSecureDeletion(delivery, shouldDeleteConversation) {`

**O que faz:** Declara a função `deliverWithSecureDeletion` pertencente a U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0707 — U32

**Fonte:** `        if (executionMode !== 'background_delete' && executionMode !== 'minimized_window') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (executionMode !== 'background_delete' && executionMode !== 'minimized_window') {`, protegendo entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0708 — U32

**Fonte:** `          if (shouldDeleteConversation) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (shouldDeleteConversation) {`, protegendo entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0709 — U32

**Fonte:** `            deletionController.deleteCurrentConversation().catch(() => {});`

**O que faz:** Executa a chamada `deletionController.deleteCurrentConversation().catch(() => {});` como passo concreto de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0710 — U32

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U32, delimitando entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0711 — U32

**Fonte:** `          runtime.sendMessage(delivery);`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0712 — U32

**Fonte:** `          return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0713 — U32

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U32, delimitando entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0714 — U32

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U32 — entrega com deleção segura; não executa instrução em runtime.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0715 — U32

**Fonte:** `        if (await shouldKeepConversationForDebug(delivery, executionMode)) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (await shouldKeepConversationForDebug(delivery, executionMode)) {`, protegendo entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0716 — U32

**Fonte:** `          sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0717 — U32

**Fonte:** `            'info',`

**O que faz:** Completa a expressão `'info',` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0718 — U32

**Fonte:** `            'DEBUG_KEEP_CONVERSATION',`

**O que faz:** Completa a expressão `'DEBUG_KEEP_CONVERSATION',` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0719 — U32

**Fonte:** `            'Modo debug: conversa preservada após erro de extração.',`

**O que faz:** Completa a expressão `'Modo debug: conversa preservada após erro de extração.',` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0720 — U32

**Fonte:** `            {}`

**O que faz:** Completa a expressão `{}` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0721 — U32

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U32, delimitando entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0722 — U32

**Fonte:** `          runtime.sendMessage(delivery);`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0723 — U32

**Fonte:** `          return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0724 — U32

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U32, delimitando entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0725 — U32

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U32 — entrega com deleção segura; não executa instrução em runtime.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0726 — U32

**Fonte:** `        stopScrollAssist();`

**O que faz:** Executa a chamada `stopScrollAssist();` como passo concreto de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0727 — U32

**Fonte:** `        sendLog('info', 'GEMINI_DELETE_BEFORE_DELIVERY', 'Aguardando exclusão antes de finalizar o job', {`

**O que faz:** Inicia log estruturado da transição/resultado corrente de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0728 — U32

**Fonte:** `          executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Completa a expressão `executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0729 — U32

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0730 — U32

**Fonte:** `        const deletion = await deletionController.deleteOrScheduleRecovery({`

**O que faz:** Declara a constante `deletion` e inicia sua expressão em U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0731 — U32

**Fonte:** `          tabId: myTabId,`

**O que faz:** Define a propriedade `tabId` do objeto/configuração construído em entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0732 — U32

**Fonte:** `          delivery,`

**O que faz:** Completa a expressão `delivery,` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0733 — U32

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U32 — entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0734 — U32

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U32 — entrega com deleção segura; não executa instrução em runtime.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0735 — U32

**Fonte:** `        if (deletion.deleted) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (deletion.deleted) {`, protegendo entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0736 — U32

**Fonte:** `          runtime.sendMessage(delivery);`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0737 — U32

**Fonte:** `          return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0738 — U32

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U32, delimitando entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0739 — U32

**Fonte:** `        return false;`

**O que faz:** Retorna `false;` como resultado desta etapa de entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0740 — U32

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U32, delimitando entrega com deleção segura.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0741 — U32

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U32 — entrega com deleção segura; não executa instrução em runtime.

**Como faz:** distingue temp_chat de background/minimized, respeita debug em erro e usa delete-or-recovery antes de entrega destrutiva.

**Por que foi implementado dessa forma:** modos que prometem limpeza não podem finalizar antes de resolver a conversa, salvo exceção explícita.

**Por que uma implementação ingênua seria pior:** entregar primeiro e tentar apagar depois perderia a garantia de privacidade/recovery.

### Linha 0742 — U33

**Fonte:** `      function sendRuntimeMessageAsync(message) {`

**O que faz:** Declara a função `sendRuntimeMessageAsync` pertencente a U33 — sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0743 — U33

**Fonte:** `        return new Promise(resolve => {`

**O que faz:** Retorna `new Promise(resolve => {` como resultado desta etapa de sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0744 — U33

**Fonte:** `          try {`

**O que faz:** Inicia bloco protegido porque esta operação de sendMessage com razão estruturada pode falhar por DOM/API externa.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0745 — U33

**Fonte:** `            runtime.sendMessage(message, response => {`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0746 — U33

**Fonte:** `              const lastError = runtime.lastError;`

**O que faz:** Declara a constante `lastError` e inicia sua expressão em U33 — sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0747 — U33

**Fonte:** `              if (lastError) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (lastError) {`, protegendo sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0748 — U33

**Fonte:** `                resolve({ ok: false, reason: lastError.message || 'runtime_error' });`

**O que faz:** Executa a chamada `resolve({ ok: false, reason: lastError.message || 'runtime_error' });` como passo concreto de sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0749 — U33

**Fonte:** `                return;`

**O que faz:** Retorna `;` como resultado desta etapa de sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0750 — U33

**Fonte:** `              }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U33, delimitando sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0751 — U33

**Fonte:** `              resolve(response || { ok: false, reason: 'empty_response' });`

**O que faz:** Executa a chamada `resolve(response || { ok: false, reason: 'empty_response' });` como passo concreto de sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0752 — U33

**Fonte:** `            });`

**O que faz:** Completa a expressão `});` dentro de U33 — sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0753 — U33

**Fonte:** `          } catch (error) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0754 — U33

**Fonte:** `            resolve({ ok: false, reason: error?.message || 'send_exception' });`

**O que faz:** Executa a chamada `resolve({ ok: false, reason: error?.message || 'send_exception' });` como passo concreto de sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0755 — U33

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U33, delimitando sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0756 — U33

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U33 — sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0757 — U33

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U33, delimitando sendMessage com razão estruturada.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0758 — U33

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U33 — sendMessage com razão estruturada; não executa instrução em runtime.

**Como faz:** retorna `{ok:false,reason}` para lastError, resposta vazia ou exceção.

**Por que foi implementado dessa forma:** staging e commit precisam diagnosticar e decidir retry sem lançar de forma opaca.

**Por que uma implementação ingênua seria pior:** reduzir tudo a null/boolean impediria distinguir no_ack, runtime_error e exception.

### Linha 0759 — U34

**Fonte:** `      async function stageAndCommitResult(delivery) {`

**O que faz:** Declara a função `stageAndCommitResult` pertencente a U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0760 — U34

**Fonte:** `        const staged = await sendRuntimeMessageAsync(delivery);`

**O que faz:** Declara a constante `staged` e inicia sua expressão em U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0761 — U34

**Fonte:** `        if (!staged?.ok || staged.staged !== true || staged.persisted === false) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!staged?.ok || staged.staged !== true || staged.persisted === false) {`, protegendo staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0762 — U34

**Fonte:** `          const error = new Error(\`Resultado não foi persistido no leitor: ${staged?.reason || 'stage_failed'}\`);`

**O que faz:** Declara a constante `error` e inicia sua expressão em U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0763 — U34

**Fonte:** `          error.code = 'RESULT_STAGE_FAILED';`

**O que faz:** Atualiza a referência/estado indicado por `error.code = 'RESULT_STAGE_FAILED';` dentro de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0764 — U34

**Fonte:** `          throw error;`

**O que faz:** Interrompe o fluxo lançando `error;` quando a invariante da unidade falha.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0765 — U34

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U34, delimitando staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0766 — U34

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U34 — staging e commit transacional; não executa instrução em runtime.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0767 — U34

**Fonte:** `        sendLog('success', 'GEMINI_RESULT_STAGED',`

**O que faz:** Inicia log estruturado da transição/resultado corrente de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0768 — U34

**Fonte:** `          'Resultado persistido no leitor antes da exclusão/finalização do Gemini.', {`

**O que faz:** Completa a expressão `'Resultado persistido no leitor antes da exclusão/finalização do Gemini.', {` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0769 — U34

**Fonte:** `            executionMode,`

**O que faz:** Completa a expressão `executionMode,` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0770 — U34

**Fonte:** `            jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0771 — U34

**Fonte:** `            batchIdPrefix: String(job.batchId || '').slice(0, 8),`

**O que faz:** Define a propriedade `batchIdPrefix` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0772 — U34

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0773 — U34

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U34 — staging e commit transacional; não executa instrução em runtime.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0774 — U34

**Fonte:** `        const commitMessage = {`

**O que faz:** Declara a constante `commitMessage` e inicia sua expressão em U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0775 — U34

**Fonte:** `          action: 'GEMINI_RESULT_COMMIT',`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0776 — U34

**Fonte:** `          mangaTabId: job.mangaTabId,`

**O que faz:** Define a propriedade `mangaTabId` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0777 — U34

**Fonte:** `          index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0778 — U34

**Fonte:** `          jobId: job.jobId,`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0779 — U34

**Fonte:** `          batchId: job.batchId,`

**O que faz:** Define a propriedade `batchId` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0780 — U34

**Fonte:** `        };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U34, delimitando staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0781 — U34

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U34 — staging e commit transacional; não executa instrução em runtime.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0782 — U34

**Fonte:** `        let committed = null;`

**O que faz:** Declara o estado mutável `committed` com o valor inicial mostrado, no contexto de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0783 — U34

**Fonte:** `        for (let attempt = 1; attempt <= 3; attempt += 1) {`

**O que faz:** Inicia iteração `for (let attempt = 1; attempt <= 3; attempt += 1) {` necessária a staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0784 — U34

**Fonte:** `          committed = await sendRuntimeMessageAsync(commitMessage);`

**O que faz:** Atualiza a referência/estado indicado por `committed = await sendRuntimeMessageAsync(commitMessage);` dentro de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0785 — U34

**Fonte:** `          if (committed?.ok && committed.committed === true) break;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (committed?.ok && committed.committed === true) break;`, protegendo staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0786 — U34

**Fonte:** `          sendLog('warn', 'GEMINI_RESULT_COMMIT_RETRY',`

**O que faz:** Inicia log estruturado da transição/resultado corrente de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0787 — U34

**Fonte:** `            'Commit pós-persistência não confirmou; repetindo sem reenviar a imagem.', {`

**O que faz:** Completa a expressão `'Commit pós-persistência não confirmou; repetindo sem reenviar a imagem.', {` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0788 — U34

**Fonte:** `              attempt,`

**O que faz:** Completa a expressão `attempt,` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0789 — U34

**Fonte:** `              reason: committed?.reason || committed?.error?.code || 'no_ack',`

**O que faz:** Define a propriedade `reason` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0790 — U34

**Fonte:** `              jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0791 — U34

**Fonte:** `            });`

**O que faz:** Completa a expressão `});` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0792 — U34

**Fonte:** `          if (attempt < 3) await sleep(250 * attempt);`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (attempt < 3) await sleep(250 * attempt);`, protegendo staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0793 — U34

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U34, delimitando staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0794 — U34

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U34 — staging e commit transacional; não executa instrução em runtime.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0795 — U34

**Fonte:** `        if (!committed?.ok || committed.committed !== true) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!committed?.ok || committed.committed !== true) {`, protegendo staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0796 — U34

**Fonte:** `          const error = new Error(\`Resultado persistido, mas o commit do job falhou: ${committed?.reason || 'commit_failed'}\`);`

**O que faz:** Declara a constante `error` e inicia sua expressão em U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0797 — U34

**Fonte:** `          error.code = 'RESULT_COMMIT_FAILED';`

**O que faz:** Atualiza a referência/estado indicado por `error.code = 'RESULT_COMMIT_FAILED';` dentro de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0798 — U34

**Fonte:** `          throw error;`

**O que faz:** Interrompe o fluxo lançando `error;` quando a invariante da unidade falha.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0799 — U34

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U34, delimitando staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0800 — U34

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U34 — staging e commit transacional; não executa instrução em runtime.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0801 — U34

**Fonte:** `        sendLog('success', 'GEMINI_RESULT_COMMITTED',`

**O que faz:** Inicia log estruturado da transição/resultado corrente de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0802 — U34

**Fonte:** `          'Background confirmou a finalização somente depois da persistência.', {`

**O que faz:** Completa a expressão `'Background confirmou a finalização somente depois da persistência.', {` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0803 — U34

**Fonte:** `            executionMode,`

**O que faz:** Completa a expressão `executionMode,` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0804 — U34

**Fonte:** `            jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0805 — U34

**Fonte:** `            batchIdPrefix: String(job.batchId || '').slice(0, 8),`

**O que faz:** Define a propriedade `batchIdPrefix` do objeto/configuração construído em staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0806 — U34

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U34 — staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0807 — U34

**Fonte:** `        return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0808 — U34

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U34, delimitando staging e commit transacional.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0809 — U34

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U34 — staging e commit transacional; não executa instrução em runtime.

**Como faz:** exige persistência do resultado, então envia commit até três vezes sem reenviar a imagem e usa códigos de erro distintos.

**Por que foi implementado dessa forma:** o leitor deve possuir os bytes antes de o background finalizar o job; commit é a etapa idempotente repetível.

**Por que uma implementação ingênua seria pior:** finalizar antes de persistir perderia imagem; reenviar bytes em cada retry poderia duplicar escrita e custo.

### Linha 0810 — U35

**Fonte:** `      startScrollAssist();`

**O que faz:** Executa a chamada `startScrollAssist();` como passo concreto de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0811 — U35

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U35 — obtenção e assinatura do input; não executa instrução em runtime.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0812 — U35

**Fonte:** `      try {`

**O que faz:** Inicia bloco protegido porque esta operação de obtenção e assinatura do input pode falhar por DOM/API externa.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0813 — U35

**Fonte:** `        reportProgress('📡 OBTENDO IMAGEM...', job.mangaTabId);`

**O que faz:** Publica progresso visível associado à etapa obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0814 — U35

**Fonte:** `        debugConsole(`

**O que faz:** Inicia diagnóstico de console para a etapa obtenção e assinatura do input, separado do log persistente.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0815 — U35

**Fonte:** `          'log',`

**O que faz:** Completa a expressão `'log',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0816 — U35

**Fonte:** `          '[MangaTranslator Gemini] Obtendo imagem da aba do mangá...',`

**O que faz:** Completa a expressão `'[MangaTranslator Gemini] Obtendo imagem da aba do mangá...',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0817 — U35

**Fonte:** `          { index: job.index }`

**O que faz:** Completa a expressão `{ index: job.index }` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0818 — U35

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U35, delimitando obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0819 — U35

**Fonte:** `        sendLog('info', 'GEMINI_STEP_1', 'Obtendo imagem', { index: job.index });`

**O que faz:** Inicia log estruturado da transição/resultado corrente de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0820 — U35

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U35 — obtenção e assinatura do input; não executa instrução em runtime.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0821 — U35

**Fonte:** `        const imageResponse = await requestImageData(job);`

**O que faz:** Declara a constante `imageResponse` e inicia sua expressão em U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0822 — U35

**Fonte:** `        assertStage(`

**O que faz:** Executa a chamada `assertStage(` como passo concreto de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0823 — U35

**Fonte:** `          imageResponse && imageResponse.srcData,`

**O que faz:** Completa a expressão `imageResponse && imageResponse.srcData,` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0824 — U35

**Fonte:** `          'Sem resposta da aba do mangá.',`

**O que faz:** Completa a expressão `'Sem resposta da aba do mangá.',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0825 — U35

**Fonte:** `          1,`

**O que faz:** Completa a expressão `1,` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0826 — U35

**Fonte:** `          'Resposta inicial carregada com sucesso.'`

**O que faz:** Completa a expressão `'Resposta inicial carregada com sucesso.'` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0827 — U35

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U35, delimitando obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0828 — U35

**Fonte:** `        assertStage(`

**O que faz:** Executa a chamada `assertStage(` como passo concreto de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0829 — U35

**Fonte:** `          String(imageResponse.srcData).startsWith('data:image/'),`

**O que faz:** Executa a chamada `String(imageResponse.srcData).startsWith('data:image/'),` como passo concreto de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0830 — U35

**Fonte:** `          'Os dados não são imagem válida.',`

**O que faz:** Completa a expressão `'Os dados não são imagem válida.',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0831 — U35

**Fonte:** `          1,`

**O que faz:** Completa a expressão `1,` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0832 — U35

**Fonte:** `          'Base64 validada.'`

**O que faz:** Completa a expressão `'Base64 validada.'` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0833 — U35

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U35, delimitando obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0834 — U35

**Fonte:** `        job.srcData = imageResponse.srcData;`

**O que faz:** Atualiza a referência/estado indicado por `job.srcData = imageResponse.srcData;` dentro de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0835 — U35

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de obtenção e assinatura do input pode falhar por DOM/API externa.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0836 — U35

**Fonte:** `          inputImageHash = await imageQuarantine.computeExactHash(job.srcData);`

**O que faz:** Atualiza a referência/estado indicado por `inputImageHash = await imageQuarantine.computeExactHash(job.srcData);` dentro de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0837 — U35

**Fonte:** `          sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0838 — U35

**Fonte:** `            'info',`

**O que faz:** Completa a expressão `'info',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0839 — U35

**Fonte:** `            'GEMINI_INPUT_QUARANTINE_READY',`

**O que faz:** Completa a expressão `'GEMINI_INPUT_QUARANTINE_READY',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0840 — U35

**Fonte:** `            'Assinatura exata da imagem de entrada calculada',`

**O que faz:** Completa a expressão `'Assinatura exata da imagem de entrada calculada',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0841 — U35

**Fonte:** `            { algorithm: 'SHA-256' }`

**O que faz:** Completa a expressão `{ algorithm: 'SHA-256' }` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0842 — U35

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U35, delimitando obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0843 — U35

**Fonte:** `        } catch (hashError) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0844 — U35

**Fonte:** `          sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0845 — U35

**Fonte:** `            'warn',`

**O que faz:** Completa a expressão `'warn',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0846 — U35

**Fonte:** `            'GEMINI_QUARANTINE_HASH_UNAVAILABLE',`

**O que faz:** Completa a expressão `'GEMINI_QUARANTINE_HASH_UNAVAILABLE',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0847 — U35

**Fonte:** `            'Não foi possível calcular a assinatura inicial; o filtro estrutural permanece ativo',`

**O que faz:** Completa a expressão `'Não foi possível calcular a assinatura inicial; o filtro estrutural permanece ativo',` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0848 — U35

**Fonte:** `            { messageLength: String(hashError?.message || '').length }`

**O que faz:** Completa a expressão `{ messageLength: String(hashError?.message || '').length }` dentro de U35 — obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0849 — U35

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U35, delimitando obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0850 — U35

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U35, delimitando obtenção e assinatura do input.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0851 — U35

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U35 — obtenção e assinatura do input; não executa instrução em runtime.

**Como faz:** inicia scroll, pede imagem, valida data URL, guarda `srcData` e tenta hash exato com fallback estrutural.

**Por que foi implementado dessa forma:** o input original é referência de ownership para bloquear resultado idêntico.

**Por que uma implementação ingênua seria pior:** aceitar payload não-imagem ou abandonar toda quarentena quando hash falha comprometeria correção.

### Linha 0852 — U36

**Fonte:** `        reportProgress('⏳ AGUARDANDO INTERFACE...', job.mangaTabId);`

**O que faz:** Publica progresso visível associado à etapa espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0853 — U36

**Fonte:** `        debugConsole('log', '[MangaTranslator Gemini] Aguardando interface do Gemini...');`

**O que faz:** Inicia diagnóstico de console para a etapa espera e gate do editor, separado do log persistente.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0854 — U36

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U36 — espera e gate do editor; não executa instrução em runtime.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0855 — U36

**Fonte:** `        const editor = await waitForElement(`

**O que faz:** Declara a constante `editor` e inicia sua expressão em U36 — espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0856 — U36

**Fonte:** `          'rich-textarea, .ql-editor, [contenteditable="true"]',`

**O que faz:** Completa a expressão `'rich-textarea, .ql-editor, [contenteditable="true"]',` dentro de U36 — espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0857 — U36

**Fonte:** `          20_000`

**O que faz:** Completa a expressão `20_000` dentro de U36 — espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0858 — U36

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U36, delimitando espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0859 — U36

**Fonte:** `        assertStage(editor !== null, 'Editor não carregou.', 2, 'Editor alvo detectado');`

**O que faz:** Executa a chamada `assertStage(editor !== null, 'Editor não carregou.', 2, 'Editor alvo detectado');` como passo concreto de espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0860 — U36

**Fonte:** `        assertStage(`

**O que faz:** Executa a chamada `assertStage(` como passo concreto de espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0861 — U36

**Fonte:** `          editor.disabled !== true && editor.getAttribute?.('aria-disabled') !== 'true',`

**O que faz:** Completa a expressão `editor.disabled !== true && editor.getAttribute?.('aria-disabled') !== 'true',` dentro de U36 — espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0862 — U36

**Fonte:** `          'Editor do Gemini está desabilitado.',`

**O que faz:** Completa a expressão `'Editor do Gemini está desabilitado.',` dentro de U36 — espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0863 — U36

**Fonte:** `          2,`

**O que faz:** Completa a expressão `2,` dentro de U36 — espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0864 — U36

**Fonte:** `          'Editor habilitado'`

**O que faz:** Completa a expressão `'Editor habilitado'` dentro de U36 — espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0865 — U36

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U36, delimitando espera e gate do editor.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0866 — U36

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U36 — espera e gate do editor; não executa instrução em runtime.

**Como faz:** aguarda editor por 20 s e exige que esteja habilitado.

**Por que foi implementado dessa forma:** anexo e prompt só podem operar sobre UI pronta.

**Por que uma implementação ingênua seria pior:** interagir otimisticamente com nó ausente/desabilitado causa falha silenciosa ou envio incompleto.

### Linha 0867 — U37

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de foco, modo de execução e anti-throttle estável pode falhar por DOM/API externa.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0868 — U37

**Fonte:** `          editor.focus?.({ preventScroll: true });`

**O que faz:** Executa a chamada `editor.focus?.({ preventScroll: true });` como passo concreto de foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0869 — U37

**Fonte:** `          const FocusEventImpl = scope.FocusEvent || scope.Event;`

**O que faz:** Declara a constante `FocusEventImpl` e inicia sua expressão em U37 — foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0870 — U37

**Fonte:** `          editor.dispatchEvent(new FocusEventImpl('focus', {`

**O que faz:** Executa a chamada `editor.dispatchEvent(new FocusEventImpl('focus', {` como passo concreto de foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0871 — U37

**Fonte:** `            bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0872 — U37

**Fonte:** `            composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0873 — U37

**Fonte:** `          }));`

**O que faz:** Completa a expressão `}));` dentro de U37 — foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0874 — U37

**Fonte:** `          editor.dispatchEvent(new FocusEventImpl('focusin', {`

**O que faz:** Executa a chamada `editor.dispatchEvent(new FocusEventImpl('focusin', {` como passo concreto de foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0875 — U37

**Fonte:** `            bubbles: true,`

**O que faz:** Define a propriedade `bubbles` do objeto/configuração construído em foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0876 — U37

**Fonte:** `            composed: true,`

**O que faz:** Define a propriedade `composed` do objeto/configuração construído em foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0877 — U37

**Fonte:** `          }));`

**O que faz:** Completa a expressão `}));` dentro de U37 — foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0878 — U37

**Fonte:** `          pageWindow.dispatchEvent(new scope.Event('focus'));`

**O que faz:** Inicia despacho de evento para a janela da página como parte de foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0879 — U37

**Fonte:** `        } catch (_e) {}`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0880 — U37

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U37 — foco, modo de execução e anti-throttle estável; não executa instrução em runtime.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0881 — U37

**Fonte:** `        if (!executionMode) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!executionMode) {`, protegendo foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0882 — U37

**Fonte:** `          const data = await storageGet(['geminiExecutionMode']);`

**O que faz:** Declara a constante `data` e inicia sua expressão em U37 — foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0883 — U37

**Fonte:** `          executionMode = data.geminiExecutionMode || 'temp_chat';`

**O que faz:** Atualiza a referência/estado indicado por `executionMode = data.geminiExecutionMode || 'temp_chat';` dentro de foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0884 — U37

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U37, delimitando foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0885 — U37

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U37 — foco, modo de execução e anti-throttle estável; não executa instrução em runtime.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0886 — U37

**Fonte:** `        const steadyAntiThrottleMode = getAntiThrottleModeForExecutionMode(executionMode);`

**O que faz:** Declara a constante `steadyAntiThrottleMode` e inicia sua expressão em U37 — foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0887 — U37

**Fonte:** `        setAntiThrottleMode(steadyAntiThrottleMode);`

**O que faz:** Executa a chamada `setAntiThrottleMode(steadyAntiThrottleMode);` como passo concreto de foco, modo de execução e anti-throttle estável.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0888 — U37

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U37 — foco, modo de execução e anti-throttle estável; não executa instrução em runtime.

**Como faz:** emite foco best-effort, lê modo do job/storage e aplica mitigação adequada.

**Por que foi implementado dessa forma:** foco local melhora compatibilidade sem ativar fisicamente tab/window; modo pode vir da configuração persistida.

**Por que uma implementação ingênua seria pior:** forçar ativação física quebraria operação em background e experiência do usuário.

### Linha 0889 — U38

**Fonte:** `        let tempChatResult = { success: false };`

**O que faz:** Declara o estado mutável `tempChatResult` com o valor inicial mostrado, no contexto de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0890 — U38

**Fonte:** `        if (executionMode === 'temp_chat') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (executionMode === 'temp_chat') {`, protegendo ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0891 — U38

**Fonte:** `          reportProgress('🔒 ATIVANDO CONVERSA TEMPORÁRIA...', job.mangaTabId);`

**O que faz:** Publica progresso visível associado à etapa ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0892 — U38

**Fonte:** `          debugConsole('log', '[MangaTranslator Gemini] Ativando conversa temporária...');`

**O que faz:** Inicia diagnóstico de console para a etapa ativação de conversa temporária, separado do log persistente.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0893 — U38

**Fonte:** `          sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0894 — U38

**Fonte:** `            'info',`

**O que faz:** Completa a expressão `'info',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0895 — U38

**Fonte:** `            'GEMINI_STEP_TEMP_CHAT',`

**O que faz:** Completa a expressão `'GEMINI_STEP_TEMP_CHAT',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0896 — U38

**Fonte:** `            'Ativando conversa temporária no Gemini',`

**O que faz:** Completa a expressão `'Ativando conversa temporária no Gemini',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0897 — U38

**Fonte:** `            {}`

**O que faz:** Completa a expressão `{}` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0898 — U38

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0899 — U38

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U38 — ativação de conversa temporária; não executa instrução em runtime.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0900 — U38

**Fonte:** `          try {`

**O que faz:** Inicia bloco protegido porque esta operação de ativação de conversa temporária pode falhar por DOM/API externa.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0901 — U38

**Fonte:** `            const tempStatus = await temporaryChatApi.ensureActive({`

**O que faz:** Declara a constante `tempStatus` e inicia sua expressão em U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0902 — U38

**Fonte:** `              root,`

**O que faz:** Completa a expressão `root,` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0903 — U38

**Fonte:** `              timeoutMs: 12_000,`

**O que faz:** Define a propriedade `timeoutMs` do objeto/configuração construído em ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0904 — U38

**Fonte:** `              sleep,`

**O que faz:** Completa a expressão `sleep,` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0905 — U38

**Fonte:** `            });`

**O que faz:** Completa a expressão `});` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0906 — U38

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U38 — ativação de conversa temporária; não executa instrução em runtime.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0907 — U38

**Fonte:** `            tempChatResult = {`

**O que faz:** Atualiza a referência/estado indicado por `tempChatResult = {` dentro de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0908 — U38

**Fonte:** `              success:`

**O que faz:** Define a propriedade `success` do objeto/configuração construído em ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0909 — U38

**Fonte:** `                tempStatus.status === 'already_active' ||`

**O que faz:** Atualiza a referência/estado indicado por `tempStatus.status === 'already_active' ||` dentro de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0910 — U38

**Fonte:** `                tempStatus.status === 'activated_verified',`

**O que faz:** Atualiza a referência/estado indicado por `tempStatus.status === 'activated_verified',` dentro de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0911 — U38

**Fonte:** `              alreadyActive: tempStatus.status === 'already_active',`

**O que faz:** Define a propriedade `alreadyActive` do objeto/configuração construído em ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0912 — U38

**Fonte:** `              activated: tempStatus.status === 'activated_verified',`

**O que faz:** Define a propriedade `activated` do objeto/configuração construído em ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0913 — U38

**Fonte:** `              notFound: tempStatus.status === 'unavailable',`

**O que faz:** Define a propriedade `notFound` do objeto/configuração construído em ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0914 — U38

**Fonte:** `              verificationFailed: tempStatus.status === 'verification_failed',`

**O que faz:** Define a propriedade `verificationFailed` do objeto/configuração construído em ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0915 — U38

**Fonte:** `              status: tempStatus.status,`

**O que faz:** Define a propriedade `status` do objeto/configuração construído em ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0916 — U38

**Fonte:** `            };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0917 — U38

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U38 — ativação de conversa temporária; não executa instrução em runtime.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0918 — U38

**Fonte:** `            sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0919 — U38

**Fonte:** `              'info',`

**O que faz:** Completa a expressão `'info',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0920 — U38

**Fonte:** `              'GEMINI_TEMP_CHAT_STATUS',`

**O que faz:** Completa a expressão `'GEMINI_TEMP_CHAT_STATUS',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0921 — U38

**Fonte:** `              'Status da conversa temporária',`

**O que faz:** Completa a expressão `'Status da conversa temporária',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0922 — U38

**Fonte:** `              { status: tempStatus.status }`

**O que faz:** Completa a expressão `{ status: tempStatus.status }` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0923 — U38

**Fonte:** `            );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0924 — U38

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U38 — ativação de conversa temporária; não executa instrução em runtime.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0925 — U38

**Fonte:** `            if (`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (`, protegendo ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0926 — U38

**Fonte:** `              tempStatus.status === 'activated_verified' ||`

**O que faz:** Atualiza a referência/estado indicado por `tempStatus.status === 'activated_verified' ||` dentro de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0927 — U38

**Fonte:** `              tempStatus.status === 'already_active'`

**O que faz:** Atualiza a referência/estado indicado por `tempStatus.status === 'already_active'` dentro de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0928 — U38

**Fonte:** `            ) {`

**O que faz:** Completa a expressão `) {` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0929 — U38

**Fonte:** `              await sleep(1500);`

**O que faz:** Suspende esta função até concluir `sleep(1500);`, preservando a ordem assíncrona de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0930 — U38

**Fonte:** `            } else if (tempStatus.status === 'verification_failed') {`

**O que faz:** Seleciona o ramo alternativo condicionado por `} else if (tempStatus.status === 'verification_failed') {` dentro de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0931 — U38

**Fonte:** `              sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0932 — U38

**Fonte:** `                'warn',`

**O que faz:** Completa a expressão `'warn',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0933 — U38

**Fonte:** `                'GEMINI_TEMP_CHAT_VERIFY_FAILED',`

**O que faz:** Completa a expressão `'GEMINI_TEMP_CHAT_VERIFY_FAILED',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0934 — U38

**Fonte:** `                'Clique não confirmou ativação da conversa temporária',`

**O que faz:** Completa a expressão `'Clique não confirmou ativação da conversa temporária',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0935 — U38

**Fonte:** `                {}`

**O que faz:** Completa a expressão `{}` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0936 — U38

**Fonte:** `              );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0937 — U38

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0938 — U38

**Fonte:** `          } catch (error) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0939 — U38

**Fonte:** `            debugConsole(`

**O que faz:** Inicia diagnóstico de console para a etapa ativação de conversa temporária, separado do log persistente.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0940 — U38

**Fonte:** `              'warn',`

**O que faz:** Completa a expressão `'warn',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0941 — U38

**Fonte:** `              '[MangaTranslator Gemini] Aviso ao ativar conversa temporária:',`

**O que faz:** Completa a expressão `'[MangaTranslator Gemini] Aviso ao ativar conversa temporária:',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0942 — U38

**Fonte:** `              error && error.message`

**O que faz:** Completa a expressão `error && error.message` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0943 — U38

**Fonte:** `            );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0944 — U38

**Fonte:** `            sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0945 — U38

**Fonte:** `              'warn',`

**O que faz:** Completa a expressão `'warn',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0946 — U38

**Fonte:** `              'GEMINI_TEMP_CHAT_ERR',`

**O que faz:** Completa a expressão `'GEMINI_TEMP_CHAT_ERR',` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0947 — U38

**Fonte:** `              \`Aviso ao ativar conversa temporária: ${error.message}\`,`

**O que faz:** Completa a expressão ``Aviso ao ativar conversa temporária: ${error.message}`,` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0948 — U38

**Fonte:** `              {}`

**O que faz:** Completa a expressão `{}` dentro de U38 — ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0949 — U38

**Fonte:** `            );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0950 — U38

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0951 — U38

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U38, delimitando ativação de conversa temporária.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0952 — U38

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U38 — ativação de conversa temporária; não executa instrução em runtime.

**Como faz:** em `temp_chat` chama `ensureActive`, traduz status em flags, espera após sucesso e converte falhas em warnings.

**Por que foi implementado dessa forma:** temp chat é preferência de isolamento, não precondição que deva impedir toda tradução.

**Por que uma implementação ingênua seria pior:** abortar por qualquer falha de toggle reduziria disponibilidade; assumir sucesso sem verificar afetaria cleanup.

### Linha 0953 — U39

**Fonte:** `        // O aparecimento do wrapper não comprova que o editor esteja hidratado.`

**O que faz:** Documenta a intenção local: “O aparecimento do wrapper não comprova que o editor esteja hidratado.”.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0954 — U39

**Fonte:** `        // A seleção é renovada entre métodos; nunca reutiliza nó desconectado.`

**O que faz:** Documenta a intenção local: “A seleção é renovada entre métodos; nunca reutiliza nó desconectado.”.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0955 — U39

**Fonte:** `        let stableComposer = await waitForStableComposer();`

**O que faz:** Declara o estado mutável `stableComposer` com o valor inicial mostrado, no contexto de renovação do composer antes do anexo.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0956 — U39

**Fonte:** `        const liveEditor = stableComposer.composer;`

**O que faz:** Declara a constante `liveEditor` e inicia sua expressão em U39 — renovação do composer antes do anexo.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0957 — U39

**Fonte:** `        const liveEditable = stableComposer.editor;`

**O que faz:** Declara a constante `liveEditable` e inicia sua expressão em U39 — renovação do composer antes do anexo.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0958 — U39

**Fonte:** `        reportProgress('📎 ANEXANDO IMAGEM...', job.mangaTabId);`

**O que faz:** Publica progresso visível associado à etapa renovação do composer antes do anexo.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0959 — U39

**Fonte:** `        const file = dataURLtoFile(job.srcData, 'manga_page.png');`

**O que faz:** Declara a constante `file` e inicia sua expressão em U39 — renovação do composer antes do anexo.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0960 — U39

**Fonte:** `        assertStage(file.size > 0, 'Imagem gerada vazia.', 3, 'PNG verificado no buffer');`

**O que faz:** Executa a chamada `assertStage(file.size > 0, 'Imagem gerada vazia.', 3, 'PNG verificado no buffer');` como passo concreto de renovação do composer antes do anexo.

**Como faz:** revalida estabilidade após possível mudança de UI, cria File e exige tamanho positivo.

**Por que foi implementado dessa forma:** ativar temp chat pode re-hidratar o composer e invalidar referências anteriores.

**Por que uma implementação ingênua seria pior:** reutilizar editor antigo abre race de nó desconectado e upload perdido.

### Linha 0961 — U40

**Fonte:** `        let attachmentResult;`

**O que faz:** Reserva o estado mutável `attachmentResult` para ser definido pelas etapas posteriores de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0962 — U40

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de handshake de attachment pode falhar por DOM/API externa.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0963 — U40

**Fonte:** `          // Variante 01 mantém a aba/janela no contexto original.`

**O que faz:** Documenta a intenção local: “Variante 01 mantém a aba/janela no contexto original.”.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0964 — U40

**Fonte:** `          sendLog('info', 'GEMINI_ATTACHMENT_CONTEXT', 'Contexto antes do upload', {`

**O que faz:** Inicia log estruturado da transição/resultado corrente de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0965 — U40

**Fonte:** `            variant: 'MT-UNICO-01', executionMode, ...attachmentSnapshot(),`

**O que faz:** Define a propriedade `variant` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0966 — U40

**Fonte:** `            jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0967 — U40

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U40 — handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0968 — U40

**Fonte:** `          sendLog('info', 'ATTACHMENT_STARTED', 'Handshake de anexo iniciado', {`

**O que faz:** Inicia log estruturado da transição/resultado corrente de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0969 — U40

**Fonte:** `            variant: 'MT-UNICO-01', executionMode,`

**O que faz:** Define a propriedade `variant` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0970 — U40

**Fonte:** `            jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0971 — U40

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U40 — handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0972 — U40

**Fonte:** `          attachmentResult = await attachmentApi.attachFile({`

**O que faz:** Atualiza a referência/estado indicado por `attachmentResult = await attachmentApi.attachFile({` dentro de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0973 — U40

**Fonte:** `            file, editor: stableComposer.editor, editorRoot: stableComposer.composer, root,`

**O que faz:** Completa a expressão `file, editor: stableComposer.editor, editorRoot: stableComposer.composer, root,` dentro de U40 — handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0974 — U40

**Fonte:** `            getEditor: () => selectLiveComposer()?.editor || null,`

**O que faz:** Define a propriedade `getEditor` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0975 — U40

**Fonte:** `            getEditorRoot: () => selectLiveComposer()?.composer || null,`

**O que faz:** Define a propriedade `getEditorRoot` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0976 — U40

**Fonte:** `            timeoutMs: 20_000, retryAfterMs: 3500, maxDispatches: 3, sleep,`

**O que faz:** Define a propriedade `timeoutMs` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0977 — U40

**Fonte:** `            // Eventos de upload continuam no content script.`

**O que faz:** Documenta a intenção local: “Eventos de upload continuam no content script.”.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0978 — U40

**Fonte:** `            onAttempt: detail => sendLog('info', 'GEMINI_ATTACHMENT_METHOD', 'Método de upload observado', {`

**O que faz:** Define a propriedade `onAttempt` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0979 — U40

**Fonte:** `              variant: 'MT-UNICO-01', executionMode, ...detail, ...attachmentSnapshot(),`

**O que faz:** Define a propriedade `variant` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0980 — U40

**Fonte:** `              jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0981 — U40

**Fonte:** `            }),`

**O que faz:** Completa a expressão `}),` dentro de U40 — handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0982 — U40

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U40 — handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0983 — U40

**Fonte:** `        } finally {`

**O que faz:** Inicia cleanup obrigatório que deve executar independentemente do resultado em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0984 — U40

**Fonte:** `          // Nenhum contexto físico foi alterado nesta variante.`

**O que faz:** Documenta a intenção local: “Nenhum contexto físico foi alterado nesta variante.”.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0985 — U40

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U40, delimitando handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0986 — U40

**Fonte:** `        const uploadMeta = {`

**O que faz:** Declara a constante `uploadMeta` e inicia sua expressão em U40 — handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0987 — U40

**Fonte:** `          variant: 'MT-UNICO-01', executionMode,`

**O que faz:** Define a propriedade `variant` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0988 — U40

**Fonte:** `          methodsAttempted: attachmentResult.methodsAttempted,`

**O que faz:** Define a propriedade `methodsAttempted` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0989 — U40

**Fonte:** `          signalObserved: attachmentResult.signalObserved,`

**O que faz:** Define a propriedade `signalObserved` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0990 — U40

**Fonte:** `          evidenceType: attachmentResult.evidence?.type || null,`

**O que faz:** Define a propriedade `evidenceType` do objeto/configuração construído em handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0991 — U40

**Fonte:** `          ...attachmentSnapshot(),`

**O que faz:** Executa a chamada `...attachmentSnapshot(),` como passo concreto de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0992 — U40

**Fonte:** `        };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U40, delimitando handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0993 — U40

**Fonte:** `        if (!attachmentResult.confirmed) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!attachmentResult.confirmed) {`, protegendo handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0994 — U40

**Fonte:** `          sendLog('error', 'GEMINI_ATTACHMENT_NOT_CONFIRMED', 'Anexo não confirmou em 20s; prompt não enviado', uploadMeta);`

**O que faz:** Inicia log estruturado da transição/resultado corrente de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0995 — U40

**Fonte:** `          sendLog('error', 'ATTACHMENT_REJECTED', 'Handshake de anexo rejeitado', uploadMeta);`

**O que faz:** Inicia log estruturado da transição/resultado corrente de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0996 — U40

**Fonte:** `          sendLog('error', 'SUBMIT_BLOCKED_ATTACHMENT', 'Envio bloqueado: anexo não confirmado', uploadMeta);`

**O que faz:** Inicia log estruturado da transição/resultado corrente de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0997 — U40

**Fonte:** `          const attachmentError = new Error('Anexo não confirmado em 20s; prompt não enviado.');`

**O que faz:** Declara a constante `attachmentError` e inicia sua expressão em U40 — handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0998 — U40

**Fonte:** `          attachmentError.code = 'GEMINI_ATTACHMENT_NOT_CONFIRMED';`

**O que faz:** Atualiza a referência/estado indicado por `attachmentError.code = 'GEMINI_ATTACHMENT_NOT_CONFIRMED';` dentro de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 0999 — U40

**Fonte:** `          throw attachmentError;`

**O que faz:** Interrompe o fluxo lançando `attachmentError;` quando a invariante da unidade falha.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 1000 — U40

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U40, delimitando handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 1001 — U40

**Fonte:** `        sendLog('success', 'GEMINI_STEP_3_OK', 'Anexo confirmado antes do prompt', uploadMeta);`

**O que faz:** Inicia log estruturado da transição/resultado corrente de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 1002 — U40

**Fonte:** `        sendLog('success', 'ATTACHMENT_CONFIRMED', 'Handshake de anexo confirmado', uploadMeta);`

**O que faz:** Inicia log estruturado da transição/resultado corrente de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 1003 — U40

**Fonte:** `        await sleep(1000);`

**O que faz:** Suspende esta função até concluir `sleep(1000);`, preservando a ordem assíncrona de handshake de attachment.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 1004 — U40

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U40 — handshake de attachment; não executa instrução em runtime.

**Como faz:** chama `attachFile` com alvos renováveis/timeout/retries, registra telemetria e bloqueia prompt quando não há confirmação.

**Por que foi implementado dessa forma:** o envio de texto deve acontecer somente depois de evidência observável do anexo.

**Por que uma implementação ingênua seria pior:** tratar dispatch como upload confirmado gera respostas sem a página anexada.

### Linha 1005 — U41

**Fonte:** `        reportProgress('📤 ENVIANDO PROMPT...', job.mangaTabId);`

**O que faz:** Publica progresso visível associado à etapa seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1006 — U41

**Fonte:** `        debugConsole('log', '[MangaTranslator Gemini] Injetando prompt e enviando...');`

**O que faz:** Inicia diagnóstico de console para a etapa seleção do prompt e fallback, separado do log persistente.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1007 — U41

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U41 — seleção do prompt e fallback; não executa instrução em runtime.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1008 — U41

**Fonte:** `        const fallbackPrompt =`

**O que faz:** Declara a constante `fallbackPrompt` e inicia sua expressão em U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1009 — U41

**Fonte:** `          'Crie uma imagem traduzindo todas as falas desta imagem para o Português. Mantenha o sentido original e apenas altere ou modifique o texto na imagem.';`

**O que faz:** Completa a expressão `'Crie uma imagem traduzindo todas as falas desta imagem para o Português. Mantenha o sentido original e apenas alt…` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1010 — U41

**Fonte:** `        const actualPrompt =`

**O que faz:** Declara a constante `actualPrompt` e inicia sua expressão em U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1011 — U41

**Fonte:** `          job.prompt && String(job.prompt).trim().length > 0`

**O que faz:** Completa a expressão `job.prompt && String(job.prompt).trim().length > 0` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1012 — U41

**Fonte:** `            ? job.prompt`

**O que faz:** Completa a expressão `? job.prompt` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1013 — U41

**Fonte:** `            : fallbackPrompt;`

**O que faz:** Completa a expressão `: fallbackPrompt;` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1014 — U41

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U41 — seleção do prompt e fallback; não executa instrução em runtime.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1015 — U41

**Fonte:** `        if (actualPrompt === fallbackPrompt && !job.prompt?.trim?.()) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (actualPrompt === fallbackPrompt && !job.prompt?.trim?.()) {`, protegendo seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1016 — U41

**Fonte:** `          sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1017 — U41

**Fonte:** `            'error',`

**O que faz:** Completa a expressão `'error',` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1018 — U41

**Fonte:** `            'PROMPT_FALLBACK',`

**O que faz:** Completa a expressão `'PROMPT_FALLBACK',` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1019 — U41

**Fonte:** `            'Prompt falhou ou está vazio. Usando emergência!',`

**O que faz:** Completa a expressão `'Prompt falhou ou está vazio. Usando emergência!',` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1020 — U41

**Fonte:** `            { fallbackLength: fallbackPrompt.length }`

**O que faz:** Completa a expressão `{ fallbackLength: fallbackPrompt.length }` dentro de U41 — seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1021 — U41

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U41, delimitando seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1022 — U41

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U41, delimitando seleção do prompt e fallback.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1023 — U41

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U41 — seleção do prompt e fallback; não executa instrução em runtime.

**Como faz:** usa prompt não vazio do job ou fallback português e loga somente o tamanho do fallback.

**Por que foi implementado dessa forma:** nenhum job deve enviar texto vazio e logs não devem carregar conteúdo desnecessário.

**Por que uma implementação ingênua seria pior:** enviar vazio desperdiçaria geração; logar prompt completo ampliaria exposição.

### Linha 1024 — U42

**Fonte:** `        const activeEditor =`

**O que faz:** Declara a constante `activeEditor` e inicia sua expressão em U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1025 — U42

**Fonte:** `          queryFirstDeep('rich-textarea, .ql-editor, [contenteditable="true"]') ||`

**O que faz:** Executa a chamada `queryFirstDeep('rich-textarea, .ql-editor, [contenteditable="true"]') ||` como passo concreto de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1026 — U42

**Fonte:** `          liveEditor;`

**O que faz:** Completa a expressão `liveEditor;` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1027 — U42

**Fonte:** `        const activeEditable =`

**O que faz:** Declara a constante `activeEditable` e inicia sua expressão em U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1028 — U42

**Fonte:** `          queryFirstDeep(`

**O que faz:** Executa a chamada `queryFirstDeep(` como passo concreto de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1029 — U42

**Fonte:** `            'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'`

**O que faz:** Completa a expressão `'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1030 — U42

**Fonte:** `          ) ||`

**O que faz:** Completa a expressão `) ||` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1031 — U42

**Fonte:** `          domApi.getEditableElement(activeEditor) ||`

**O que faz:** Executa a chamada `domApi.getEditableElement(activeEditor) ||` como passo concreto de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1032 — U42

**Fonte:** `          liveEditable;`

**O que faz:** Completa a expressão `liveEditable;` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1033 — U42

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U42 — re-resolução e injeção do prompt; não executa instrução em runtime.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1034 — U42

**Fonte:** `        const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;`

**O que faz:** Declara a constante `CustomEventImpl` e inicia sua expressão em U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1035 — U42

**Fonte:** `        pageWindow.dispatchEvent(new CustomEventImpl(`

**O que faz:** Inicia despacho de evento para a janela da página como parte de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1036 — U42

**Fonte:** `          'MANGA_TRANSLATOR_SET_PROMPT',`

**O que faz:** Completa a expressão `'MANGA_TRANSLATOR_SET_PROMPT',` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1037 — U42

**Fonte:** `          { detail: { prompt: actualPrompt } }`

**O que faz:** Completa a expressão `{ detail: { prompt: actualPrompt } }` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1038 — U42

**Fonte:** `        ));`

**O que faz:** Completa a expressão `));` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1039 — U42

**Fonte:** `        await sleep(200);`

**O que faz:** Suspende esta função até concluir `sleep(200);`, preservando a ordem assíncrona de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1040 — U42

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U42 — re-resolução e injeção do prompt; não executa instrução em runtime.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1041 — U42

**Fonte:** `        setPromptInEditor(activeEditable, activeEditor, actualPrompt);`

**O que faz:** Executa a chamada `setPromptInEditor(activeEditable, activeEditor, actualPrompt);` como passo concreto de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1042 — U42

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U42 — re-resolução e injeção do prompt; não executa instrução em runtime.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1043 — U42

**Fonte:** `        const promptLength = String(activeEditable.textContent || '').trim().length;`

**O que faz:** Declara a constante `promptLength` e inicia sua expressão em U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1044 — U42

**Fonte:** `        assertStage(`

**O que faz:** Executa a chamada `assertStage(` como passo concreto de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1045 — U42

**Fonte:** `          promptLength >= 5,`

**O que faz:** Completa a expressão `promptLength >= 5,` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1046 — U42

**Fonte:** `          \`O prompt não foi inserido. Comprimento: ${promptLength}\`,`

**O que faz:** Completa a expressão ``O prompt não foi inserido. Comprimento: ${promptLength}`,` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1047 — U42

**Fonte:** `          4,`

**O que faz:** Completa a expressão `4,` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1048 — U42

**Fonte:** `          'Prompt injetado com sucesso.'`

**O que faz:** Completa a expressão `'Prompt injetado com sucesso.'` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1049 — U42

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U42, delimitando re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1050 — U42

**Fonte:** `        sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1051 — U42

**Fonte:** `          'success',`

**O que faz:** Completa a expressão `'success',` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1052 — U42

**Fonte:** `          'PROMPT_INJECTED',`

**O que faz:** Completa a expressão `'PROMPT_INJECTED',` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1053 — U42

**Fonte:** `          'Prompt confirmado no DOM',`

**O que faz:** Completa a expressão `'Prompt confirmado no DOM',` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1054 — U42

**Fonte:** `          { promptLen: promptLength }`

**O que faz:** Completa a expressão `{ promptLen: promptLength }` dentro de U42 — re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1055 — U42

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U42, delimitando re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1056 — U42

**Fonte:** `        await sleep(1000);`

**O que faz:** Suspende esta função até concluir `sleep(1000);`, preservando a ordem assíncrona de re-resolução e injeção do prompt.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1057 — U42

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U42 — re-resolução e injeção do prompt; não executa instrução em runtime.

**Como faz:** resolve editor atual, sinaliza MAIN-world, chama injector, mede texto final e exige mínimo antes de prosseguir.

**Por que foi implementado dessa forma:** a UI pode substituir o editor entre attachment e submit e o DOM precisa refletir o prompt.

**Por que uma implementação ingênua seria pior:** confiar no retorno de uma mutação sem conferir DOM permitiria submit vazio.

### Linha 1058 — U43

**Fonte:** `        const ignoreImages = new Set(`

**O que faz:** Declara a constante `ignoreImages` e inicia sua expressão em U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1059 — U43

**Fonte:** `          queryAllDeep('img')`

**O que faz:** Executa a chamada `queryAllDeep('img')` como passo concreto de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1060 — U43

**Fonte:** `            .map(image => getImageSource(image))`

**O que faz:** Executa a chamada `.map(image => getImageSource(image))` como passo concreto de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1061 — U43

**Fonte:** `            .filter(Boolean)`

**O que faz:** Executa a chamada `.filter(Boolean)` como passo concreto de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1062 — U43

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1063 — U43

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U43 — observer antes do submit e refresh do watchdog; não executa instrução em runtime.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1064 — U43

**Fonte:** `        activeObserver = observerApi.createGeminiObserver({`

**O que faz:** Atualiza a referência/estado indicado por `activeObserver = observerApi.createGeminiObserver({` dentro de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1065 — U43

**Fonte:** `          jobId: job.jobId,`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1066 — U43

**Fonte:** `          root,`

**O que faz:** Completa a expressão `root,` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1067 — U43

**Fonte:** `          editor: activeEditable,`

**O que faz:** Define a propriedade `editor` do objeto/configuração construído em observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1068 — U43

**Fonte:** `          getEditor: () =>`

**O que faz:** Define a propriedade `getEditor` do objeto/configuração construído em observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1069 — U43

**Fonte:** `            queryFirstDeep(`

**O que faz:** Executa a chamada `queryFirstDeep(` como passo concreto de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1070 — U43

**Fonte:** `              'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'`

**O que faz:** Completa a expressão `'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1071 — U43

**Fonte:** `            ) || activeEditable,`

**O que faz:** Completa a expressão `) || activeEditable,` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1072 — U43

**Fonte:** `          ignoreImages,`

**O que faz:** Completa a expressão `ignoreImages,` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1073 — U43

**Fonte:** `          imageQuarantine,`

**O que faz:** Completa a expressão `imageQuarantine,` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1074 — U43

**Fonte:** `          onStateChange: (type, detail) => {`

**O que faz:** Define a propriedade `onStateChange` do objeto/configuração construído em observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1075 — U43

**Fonte:** `            if (type === 'result_candidate_rejected' || type === 'result_candidate_accepted') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (type === 'result_candidate_rejected' || type === 'result_candidate_accepted') {`, protegendo observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1076 — U43

**Fonte:** `              const assistStatus = root.getElementById('mt-gemini-assist-status');`

**O que faz:** Declara a constante `assistStatus` e inicia sua expressão em U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1077 — U43

**Fonte:** `              if (assistStatus) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (assistStatus) {`, protegendo observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1078 — U43

**Fonte:** `                assistStatus.textContent = type === 'result_candidate_accepted'`

**O que faz:** Atualiza a referência/estado indicado por `assistStatus.textContent = type === 'result_candidate_accepted'` dentro de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1079 — U43

**Fonte:** `                  ? 'Imagem validada automaticamente. Extraindo resultado...'`

**O que faz:** Completa a expressão `? 'Imagem validada automaticamente. Extraindo resultado...'` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1080 — U43

**Fonte:** `                  : 'Imagem encontrada no DOM, mas rejeitada pela validação automática. Aguardando resultado válido...';`

**O que faz:** Completa a expressão `: 'Imagem encontrada no DOM, mas rejeitada pela validação automática. Aguardando resultado válido...';` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1081 — U43

**Fonte:** `              }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1082 — U43

**Fonte:** `              sendLog('info', type === 'result_candidate_rejected' ? 'GEMINI_RESULT_REJECTED' : 'GEMINI_RESULT_ACCEPTED',`

**O que faz:** Inicia log estruturado da transição/resultado corrente de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1083 — U43

**Fonte:** `                type === 'result_candidate_rejected' ? 'Candidato descartado pelo contexto da imagem' : 'Resposta do modelo validada', {`

**O que faz:** Atualiza a referência/estado indicado por `type === 'result_candidate_rejected' ? 'Candidato descartado pelo contexto da imagem' : 'Resposta do modelo v…` dentro de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1084 — U43

**Fonte:** `                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Completa a expressão `executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1085 — U43

**Fonte:** `                  reason: detail?.reason, sourceType: detail?.sourceType,`

**O que faz:** Define a propriedade `reason` do objeto/configuração construído em observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1086 — U43

**Fonte:** `                  ownerTag: detail?.ownerTag || null,`

**O que faz:** Define a propriedade `ownerTag` do objeto/configuração construído em observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1087 — U43

**Fonte:** `                });`

**O que faz:** Completa a expressão `});` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1088 — U43

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1089 — U43

**Fonte:** `            if (type === 'generation_started') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (type === 'generation_started') {`, protegendo observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1090 — U43

**Fonte:** `              sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1091 — U43

**Fonte:** `                'info',`

**O que faz:** Completa a expressão `'info',` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1092 — U43

**Fonte:** `                'GEMINI_GENERATION_ACTIVE',`

**O que faz:** Completa a expressão `'GEMINI_GENERATION_ACTIVE',` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1093 — U43

**Fonte:** `                'Geração observada na UI',`

**O que faz:** Completa a expressão `'Geração observada na UI',` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1094 — U43

**Fonte:** `                { executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8), reason: detail && detail.reason }`

**O que faz:** Completa a expressão `{ executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8), reason: detail && detail.reason }` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1095 — U43

**Fonte:** `              );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1096 — U43

**Fonte:** `              if (!watchdogRefreshRequested) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!watchdogRefreshRequested) {`, protegendo observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1097 — U43

**Fonte:** `                watchdogRefreshRequested = true;`

**O que faz:** Atualiza a referência/estado indicado por `watchdogRefreshRequested = true;` dentro de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1098 — U43

**Fonte:** `                const refreshMetadata = {`

**O que faz:** Declara a constante `refreshMetadata` e inicia sua expressão em U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1099 — U43

**Fonte:** `                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Completa a expressão `executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1100 — U43

**Fonte:** `                };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1101 — U43

**Fonte:** `                const reportRefresh = (response, error) => {`

**O que faz:** Declara a constante `reportRefresh` e inicia sua expressão em U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1102 — U43

**Fonte:** `                  const ok = !error && response?.ok === true && response.refreshed === true;`

**O que faz:** Declara a constante `ok` e inicia sua expressão em U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1103 — U43

**Fonte:** `                  sendLog(ok ? 'success' : 'warn',`

**O que faz:** Inicia log estruturado da transição/resultado corrente de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1104 — U43

**Fonte:** `                    ok ? 'GEMINI_WATCHDOG_REFRESH_CONFIRMED' : 'GEMINI_WATCHDOG_REFRESH_FAILED',`

**O que faz:** Completa a expressão `ok ? 'GEMINI_WATCHDOG_REFRESH_CONFIRMED' : 'GEMINI_WATCHDOG_REFRESH_FAILED',` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1105 — U43

**Fonte:** `                    ok ? 'Watchdog reiniciado após o início da geração' : 'Não foi possível reiniciar o watchdog',`

**O que faz:** Completa a expressão `ok ? 'Watchdog reiniciado após o início da geração' : 'Não foi possível reiniciar o watchdog',` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1106 — U43

**Fonte:** `                    refreshMetadata);`

**O que faz:** Completa a expressão `refreshMetadata);` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1107 — U43

**Fonte:** `                };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1108 — U43

**Fonte:** `                sendLog('info', 'GEMINI_WATCHDOG_REFRESH_REQUESTED',`

**O que faz:** Inicia log estruturado da transição/resultado corrente de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1109 — U43

**Fonte:** `                  'Solicitando novo prazo de 5 min a partir do início da geração', refreshMetadata);`

**O que faz:** Completa a expressão `'Solicitando novo prazo de 5 min a partir do início da geração', refreshMetadata);` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1110 — U43

**Fonte:** `                try {`

**O que faz:** Inicia bloco protegido porque esta operação de observer antes do submit e refresh do watchdog pode falhar por DOM/API externa.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1111 — U43

**Fonte:** `                  runtime.sendMessage({`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1112 — U43

**Fonte:** `                    action: 'REFRESH_JOB_WATCHDOG', jobId: job.jobId,`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1113 — U43

**Fonte:** `                  }, response => reportRefresh(response, runtime.lastError));`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1114 — U43

**Fonte:** `                } catch (error) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1115 — U43

**Fonte:** `                  reportRefresh(null, error);`

**O que faz:** Executa a chamada `reportRefresh(null, error);` como passo concreto de observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1116 — U43

**Fonte:** `                }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1117 — U43

**Fonte:** `              }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1118 — U43

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1119 — U43

**Fonte:** `          },`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U43, delimitando observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1120 — U43

**Fonte:** `        }).start();`

**O que faz:** Completa a expressão `}).start();` dentro de U43 — observer antes do submit e refresh do watchdog.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1121 — U43

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U43 — observer antes do submit e refresh do watchdog; não executa instrução em runtime.

**Como faz:** captura imagens preexistentes, inicia observer, loga candidatos e renova watchdog uma única vez quando geração realmente começa.

**Por que foi implementado dessa forma:** observer pré-submit elimina race de resposta rápida; refresh único ancora timeout no início real da geração.

**Por que uma implementação ingênua seria pior:** instalar observer depois pode perder resultado; heartbeat contínuo mascararia jobs presos.

### Linha 1122 — U44

**Fonte:** `        pageWindow.__mangaTranslatorActiveGeminiObserver = activeObserver;`

**O que faz:** Atualiza a referência/estado indicado por `pageWindow.__mangaTranslatorActiveGeminiObserver = activeObserver;` dentro de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1123 — U44

**Fonte:** `        sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1124 — U44

**Fonte:** `          'info',`

**O que faz:** Completa a expressão `'info',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1125 — U44

**Fonte:** `          'GEMINI_OBSERVER_READY',`

**O que faz:** Completa a expressão `'GEMINI_OBSERVER_READY',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1126 — U44

**Fonte:** `          'Observer instalado antes do submit',`

**O que faz:** Completa a expressão `'Observer instalado antes do submit',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1127 — U44

**Fonte:** `          { jobIdPrefix: String(job.jobId || '').slice(0, 8) }`

**O que faz:** Completa a expressão `{ jobIdPrefix: String(job.jobId || '').slice(0, 8) }` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1128 — U44

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1129 — U44

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U44 — submit confirmado e retry local; não executa instrução em runtime.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1130 — U44

**Fonte:** `        let submission;`

**O que faz:** Reserva o estado mutável `submission` para ser definido pelas etapas posteriores de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1131 — U44

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de submit confirmado e retry local pode falhar por DOM/API externa.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1132 — U44

**Fonte:** `          submission = await editorApi.submitWithConfirmation({`

**O que faz:** Atualiza a referência/estado indicado por `submission = await editorApi.submitWithConfirmation({` dentro de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1133 — U44

**Fonte:** `            observer: activeObserver,`

**O que faz:** Define a propriedade `observer` do objeto/configuração construído em submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1134 — U44

**Fonte:** `            getEditor: () =>`

**O que faz:** Define a propriedade `getEditor` do objeto/configuração construído em submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1135 — U44

**Fonte:** `              queryFirstDeep(`

**O que faz:** Executa a chamada `queryFirstDeep(` como passo concreto de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1136 — U44

**Fonte:** `                'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'`

**O que faz:** Completa a expressão `'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1137 — U44

**Fonte:** `              ) || activeEditable,`

**O que faz:** Completa a expressão `) || activeEditable,` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1138 — U44

**Fonte:** `            getSendButton: () => domApi.findSendButton(root.body),`

**O que faz:** Define a propriedade `getSendButton` do objeto/configuração construído em submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1139 — U44

**Fonte:** `            maxAttempts: 2,`

**O que faz:** Define a propriedade `maxAttempts` do objeto/configuração construído em submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1140 — U44

**Fonte:** `            confirmationTimeoutMs: 5000,`

**O que faz:** Define a propriedade `confirmationTimeoutMs` do objeto/configuração construído em submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1141 — U44

**Fonte:** `            sleep,`

**O que faz:** Completa a expressão `sleep,` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1142 — U44

**Fonte:** `            onAttempt: attempt => {`

**O que faz:** Define a propriedade `onAttempt` do objeto/configuração construído em submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1143 — U44

**Fonte:** `              sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1144 — U44

**Fonte:** `                'info',`

**O que faz:** Completa a expressão `'info',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1145 — U44

**Fonte:** `                'GEMINI_SUBMIT_ATTEMPT',`

**O que faz:** Completa a expressão `'GEMINI_SUBMIT_ATTEMPT',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1146 — U44

**Fonte:** `                'Tentativa de submit iniciada',`

**O que faz:** Completa a expressão `'Tentativa de submit iniciada',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1147 — U44

**Fonte:** `                { attempt }`

**O que faz:** Completa a expressão `{ attempt }` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1148 — U44

**Fonte:** `              );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1149 — U44

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U44 — submit confirmado e retry local; não executa instrução em runtime.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1150 — U44

**Fonte:** `              if (attempt === 2) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (attempt === 2) {`, protegendo submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1151 — U44

**Fonte:** `                // Retry local; não ativa aba/janela nem dispara DO_SEND_NOW.`

**O que faz:** Documenta a intenção local: “Retry local; não ativa aba/janela nem dispara DO_SEND_NOW.”.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1152 — U44

**Fonte:** `                setAntiThrottleMode('legacy');`

**O que faz:** Executa a chamada `setAntiThrottleMode('legacy');` como passo concreto de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1153 — U44

**Fonte:** `                sendLog('warn', 'GEMINI_SEND_RETRY_BACKGROUND', 'Nova tentativa de envio em segundo plano', {`

**O que faz:** Inicia log estruturado da transição/resultado corrente de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1154 — U44

**Fonte:** `                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Completa a expressão `executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1155 — U44

**Fonte:** `                });`

**O que faz:** Completa a expressão `});` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1156 — U44

**Fonte:** `              }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1157 — U44

**Fonte:** `            },`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1158 — U44

**Fonte:** `            mainWorldFallback: async () => {`

**O que faz:** Define a propriedade `mainWorldFallback` do objeto/configuração construído em submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1159 — U44

**Fonte:** `              pageWindow.dispatchEvent(new CustomEventImpl(`

**O que faz:** Inicia despacho de evento para a janela da página como parte de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1160 — U44

**Fonte:** `                'MANGA_TRANSLATOR_TRIGGER_SEND'`

**O que faz:** Completa a expressão `'MANGA_TRANSLATOR_TRIGGER_SEND'` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1161 — U44

**Fonte:** `              ));`

**O que faz:** Completa a expressão `));` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1162 — U44

**Fonte:** `              sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1163 — U44

**Fonte:** `                'warn',`

**O que faz:** Completa a expressão `'warn',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1164 — U44

**Fonte:** `                'GEMINI_SEND_FALLBACK',`

**O que faz:** Completa a expressão `'GEMINI_SEND_FALLBACK',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1165 — U44

**Fonte:** `                'Fallback MAIN-world tentado; aguardando confirmação observável',`

**O que faz:** Completa a expressão `'Fallback MAIN-world tentado; aguardando confirmação observável',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1166 — U44

**Fonte:** `                {}`

**O que faz:** Completa a expressão `{}` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1167 — U44

**Fonte:** `              );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1168 — U44

**Fonte:** `              return true;`

**O que faz:** Retorna `true;` como resultado desta etapa de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1169 — U44

**Fonte:** `            },`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1170 — U44

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1171 — U44

**Fonte:** `        } catch (submitError) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1172 — U44

**Fonte:** `          if (submitError?.code === 'GEMINI_SUBMISSION_NOT_CONFIRMED') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (submitError?.code === 'GEMINI_SUBMISSION_NOT_CONFIRMED') {`, protegendo submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1173 — U44

**Fonte:** `            sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1174 — U44

**Fonte:** `              'error',`

**O que faz:** Completa a expressão `'error',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1175 — U44

**Fonte:** `              'GEMINI_SUBMISSION_NOT_CONFIRMED',`

**O que faz:** Completa a expressão `'GEMINI_SUBMISSION_NOT_CONFIRMED',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1176 — U44

**Fonte:** `              'Nenhuma transição da UI confirmou o envio após duas tentativas',`

**O que faz:** Completa a expressão `'Nenhuma transição da UI confirmou o envio após duas tentativas',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1177 — U44

**Fonte:** `              {}`

**O que faz:** Completa a expressão `{}` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1178 — U44

**Fonte:** `            );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1179 — U44

**Fonte:** `            const error = new Error('GEMINI_SUBMISSION_NOT_CONFIRMED');`

**O que faz:** Declara a constante `error` e inicia sua expressão em U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1180 — U44

**Fonte:** `            error.code = 'GEMINI_SUBMISSION_NOT_CONFIRMED';`

**O que faz:** Atualiza a referência/estado indicado por `error.code = 'GEMINI_SUBMISSION_NOT_CONFIRMED';` dentro de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1181 — U44

**Fonte:** `            throw error;`

**O que faz:** Interrompe o fluxo lançando `error;` quando a invariante da unidade falha.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1182 — U44

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1183 — U44

**Fonte:** `          throw submitError;`

**O que faz:** Interrompe o fluxo lançando `submitError;` quando a invariante da unidade falha.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1184 — U44

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1185 — U44

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U44 — submit confirmado e retry local; não executa instrução em runtime.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1186 — U44

**Fonte:** `        setAntiThrottleMode(steadyAntiThrottleMode);`

**O que faz:** Executa a chamada `setAntiThrottleMode(steadyAntiThrottleMode);` como passo concreto de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1187 — U44

**Fonte:** `        sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1188 — U44

**Fonte:** `          'success',`

**O que faz:** Completa a expressão `'success',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1189 — U44

**Fonte:** `          'GEMINI_SEND_SUCCESS',`

**O que faz:** Completa a expressão `'GEMINI_SEND_SUCCESS',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1190 — U44

**Fonte:** `          'Envio confirmado por transição observável da UI',`

**O que faz:** Completa a expressão `'Envio confirmado por transição observável da UI',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1191 — U44

**Fonte:** `          { attempt: submission.attempt, reason: submission.reason }`

**O que faz:** Completa a expressão `{ attempt: submission.attempt, reason: submission.reason }` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1192 — U44

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1193 — U44

**Fonte:** `        debugConsole(`

**O que faz:** Inicia diagnóstico de console para a etapa submit confirmado e retry local, separado do log persistente.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1194 — U44

**Fonte:** `          'log',`

**O que faz:** Completa a expressão `'log',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1195 — U44

**Fonte:** `          '[MangaTranslator Gemini] Envio confirmado pelo Observer V2.',`

**O que faz:** Completa a expressão `'[MangaTranslator Gemini] Envio confirmado pelo Observer V2.',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1196 — U44

**Fonte:** `          { attempt: submission.attempt, reason: submission.reason }`

**O que faz:** Completa a expressão `{ attempt: submission.attempt, reason: submission.reason }` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1197 — U44

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1198 — U44

**Fonte:** `        assertStage(`

**O que faz:** Executa a chamada `assertStage(` como passo concreto de submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1199 — U44

**Fonte:** `          submission && submission.confirmed,`

**O que faz:** Completa a expressão `submission && submission.confirmed,` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1200 — U44

**Fonte:** `          'Envio não foi confirmado pela interface.',`

**O que faz:** Completa a expressão `'Envio não foi confirmado pela interface.',` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1201 — U44

**Fonte:** `          4,`

**O que faz:** Completa a expressão `4,` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1202 — U44

**Fonte:** `          'Submit confirmado pela UI'`

**O que faz:** Completa a expressão `'Submit confirmado pela UI'` dentro de U44 — submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1203 — U44

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U44, delimitando submit confirmado e retry local.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1204 — U44

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U44 — submit confirmado e retry local; não executa instrução em runtime.

**Como faz:** publica observer ativo, tenta submit duas vezes, usa legacy só no retry e fallback MAIN-world, exigindo confirmação observável.

**Por que foi implementado dessa forma:** clique/keypress não é evidência de envio e o retry não deve roubar foco físico.

**Por que uma implementação ingênua seria pior:** considerar click como sucesso entraria em espera de 4 min mesmo quando nada foi enviado.

### Linha 1205 — U45

**Fonte:** `        reportProgress('🧠 GEMINI PROCESSANDO...', job.mangaTabId);`

**O que faz:** Publica progresso visível associado à etapa espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1206 — U45

**Fonte:** `        createGeminiManualPanel(job, () => ignoreImages);`

**O que faz:** Executa a chamada `createGeminiManualPanel(job, () => ignoreImages);` como passo concreto de espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1207 — U45

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U45 — espera de geração e ticker; não executa instrução em runtime.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1208 — U45

**Fonte:** `        const shouldDeleteConversation =`

**O que faz:** Declara a constante `shouldDeleteConversation` e inicia sua expressão em U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1209 — U45

**Fonte:** `          executionMode === 'minimized_window' ||`

**O que faz:** Atualiza a referência/estado indicado por `executionMode === 'minimized_window' ||` dentro de espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1210 — U45

**Fonte:** `          executionMode === 'background_delete' ||`

**O que faz:** Atualiza a referência/estado indicado por `executionMode === 'background_delete' ||` dentro de espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1211 — U45

**Fonte:** `          (`

**O que faz:** Completa a expressão `(` dentro de U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1212 — U45

**Fonte:** `            executionMode === 'temp_chat' &&`

**O que faz:** Atualiza a referência/estado indicado por `executionMode === 'temp_chat' &&` dentro de espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1213 — U45

**Fonte:** `            tempChatResult.notFound &&`

**O que faz:** Completa a expressão `tempChatResult.notFound &&` dentro de U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1214 — U45

**Fonte:** `            !tempChatResult.alreadyActive`

**O que faz:** Completa a expressão `!tempChatResult.alreadyActive` dentro de U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1215 — U45

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U45, delimitando espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1216 — U45

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U45 — espera de geração e ticker; não executa instrução em runtime.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1217 — U45

**Fonte:** `        const configuredTimeout = Number(scope.__MT_GEMINI_GENERATION_TIMEOUT_MS__);`

**O que faz:** Declara a constante `configuredTimeout` e inicia sua expressão em U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1218 — U45

**Fonte:** `        const waitTimeoutMs =`

**O que faz:** Declara a constante `waitTimeoutMs` e inicia sua expressão em U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1219 — U45

**Fonte:** `          Number.isFinite(configuredTimeout) && configuredTimeout > 0`

**O que faz:** Executa a chamada `Number.isFinite(configuredTimeout) && configuredTimeout > 0` como passo concreto de espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1220 — U45

**Fonte:** `            ? configuredTimeout`

**O que faz:** Completa a expressão `? configuredTimeout` dentro de U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1221 — U45

**Fonte:** `            : 4 * 60 * 1000;`

**O que faz:** Completa a expressão `: 4 * 60 * 1000;` dentro de U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1222 — U45

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U45 — espera de geração e ticker; não executa instrução em runtime.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1223 — U45

**Fonte:** `        const waitStartedAt = Date.now();`

**O que faz:** Declara a constante `waitStartedAt` e inicia sua expressão em U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1224 — U45

**Fonte:** `        const progressTimer = setIntervalFn(() => {`

**O que faz:** Declara a constante `progressTimer` e inicia sua expressão em U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1225 — U45

**Fonte:** `          const elapsedSeconds = Math.floor((Date.now() - waitStartedAt) / 1000);`

**O que faz:** Declara a constante `elapsedSeconds` e inicia sua expressão em U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1226 — U45

**Fonte:** `          reportProgress(`

**O que faz:** Publica progresso visível associado à etapa espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1227 — U45

**Fonte:** `            \`🧠 GEMINI PROCESSANDO (${elapsedSeconds}s)...\`,`

**O que faz:** Completa a expressão ``🧠 GEMINI PROCESSANDO (${elapsedSeconds}s)...`,` dentro de U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1228 — U45

**Fonte:** `            job.mangaTabId`

**O que faz:** Completa a expressão `job.mangaTabId` dentro de U45 — espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1229 — U45

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U45, delimitando espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1230 — U45

**Fonte:** `        }, 5000);`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U45, delimitando espera de geração e ticker.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1231 — U45

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U45 — espera de geração e ticker; não executa instrução em runtime.

**Como faz:** mostra HUD/progresso, decide política de deleção, escolhe timeout configurável e atualiza elapsed a cada 5 s.

**Por que foi implementado dessa forma:** operações longas precisam de limite e feedback sem interferir na conclusão.

**Por que uma implementação ingênua seria pior:** espera infinita prenderia job; timeout sem observabilidade pareceria travamento.

### Linha 1232 — U46

**Fonte:** `        let resultUrl = null;`

**O que faz:** Declara o estado mutável `resultUrl` com o valor inicial mostrado, no contexto de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1233 — U46

**Fonte:** `        let resultImageElement = null;`

**O que faz:** Declara o estado mutável `resultImageElement` com o valor inicial mostrado, no contexto de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1234 — U46

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U46 — tratamento de resultado/erro do observer; não executa instrução em runtime.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1235 — U46

**Fonte:** `        try {`

**O que faz:** Inicia bloco protegido porque esta operação de tratamento de resultado/erro do observer pode falhar por DOM/API externa.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1236 — U46

**Fonte:** `          const observedResult = await activeObserver.waitForResult(waitTimeoutMs);`

**O que faz:** Declara a constante `observedResult` e inicia sua expressão em U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1237 — U46

**Fonte:** `          resultUrl = observedResult && observedResult.url;`

**O que faz:** Atualiza a referência/estado indicado por `resultUrl = observedResult && observedResult.url;` dentro de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1238 — U46

**Fonte:** `          resultImageElement = observedResult && observedResult.image;`

**O que faz:** Atualiza a referência/estado indicado por `resultImageElement = observedResult && observedResult.image;` dentro de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1239 — U46

**Fonte:** `        } catch (waitError) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1240 — U46

**Fonte:** `          if (waitError?.code === 'GEMINI_UI_ERROR') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (waitError?.code === 'GEMINI_UI_ERROR') {`, protegendo tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1241 — U46

**Fonte:** `            sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1242 — U46

**Fonte:** `              'error',`

**O que faz:** Completa a expressão `'error',` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1243 — U46

**Fonte:** `              'GEMINI_ERROR',`

**O que faz:** Completa a expressão `'GEMINI_ERROR',` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1244 — U46

**Fonte:** `              'Erro visível da UI detectado pelo Observer V2',`

**O que faz:** Completa a expressão `'Erro visível da UI detectado pelo Observer V2',` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1245 — U46

**Fonte:** `              { messageLength: String(waitError.message || '').length }`

**O que faz:** Completa a expressão `{ messageLength: String(waitError.message || '').length }` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1246 — U46

**Fonte:** `            );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U46, delimitando tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1247 — U46

**Fonte:** `            await deliverWithSecureDeletion({`

**O que faz:** Suspende esta função até concluir `deliverWithSecureDeletion({`, preservando a ordem assíncrona de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1248 — U46

**Fonte:** `              action: 'GEMINI_ERROR',`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1249 — U46

**Fonte:** `              mangaTabId: job.mangaTabId,`

**O que faz:** Define a propriedade `mangaTabId` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1250 — U46

**Fonte:** `              index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1251 — U46

**Fonte:** `              error:`

**O que faz:** Define a propriedade `error` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1252 — U46

**Fonte:** `                \`Retornou erro interface: ${String(waitError.message || 'Erro da interface do Gemini')}\`,`

**O que faz:** Completa a expressão ``Retornou erro interface: ${String(waitError.message || 'Erro da interface do Gemini')}`,` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1253 — U46

**Fonte:** `              jobId: job.jobId,`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1254 — U46

**Fonte:** `              batchId: job.batchId,`

**O que faz:** Define a propriedade `batchId` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1255 — U46

**Fonte:** `            }, shouldDeleteConversation);`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U46, delimitando tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1256 — U46

**Fonte:** `            return { status: 'ui_error' };`

**O que faz:** Retorna `{ status: 'ui_error' };` como resultado desta etapa de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1257 — U46

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U46, delimitando tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1258 — U46

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U46 — tratamento de resultado/erro do observer; não executa instrução em runtime.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1259 — U46

**Fonte:** `          if (waitError?.code === 'GEMINI_RESULT_TIMEOUT') {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (waitError?.code === 'GEMINI_RESULT_TIMEOUT') {`, protegendo tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1260 — U46

**Fonte:** `            sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1261 — U46

**Fonte:** `              'error',`

**O que faz:** Completa a expressão `'error',` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1262 — U46

**Fonte:** `              'GEMINI_TIMEOUT',`

**O que faz:** Completa a expressão `'GEMINI_TIMEOUT',` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1263 — U46

**Fonte:** `              'Timeout de geração aguardando Observer V2',`

**O que faz:** Completa a expressão `'Timeout de geração aguardando Observer V2',` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1264 — U46

**Fonte:** `              {}`

**O que faz:** Completa a expressão `{}` dentro de U46 — tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1265 — U46

**Fonte:** `            );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U46, delimitando tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1266 — U46

**Fonte:** `            await deliverWithSecureDeletion({`

**O que faz:** Suspende esta função até concluir `deliverWithSecureDeletion({`, preservando a ordem assíncrona de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1267 — U46

**Fonte:** `              action: 'GEMINI_ERROR',`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1268 — U46

**Fonte:** `              mangaTabId: job.mangaTabId,`

**O que faz:** Define a propriedade `mangaTabId` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1269 — U46

**Fonte:** `              index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1270 — U46

**Fonte:** `              error: 'Tempo limite (4 min)',`

**O que faz:** Define a propriedade `error` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1271 — U46

**Fonte:** `              jobId: job.jobId,`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1272 — U46

**Fonte:** `              batchId: job.batchId,`

**O que faz:** Define a propriedade `batchId` do objeto/configuração construído em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1273 — U46

**Fonte:** `            }, shouldDeleteConversation);`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U46, delimitando tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1274 — U46

**Fonte:** `            return { status: 'result_timeout' };`

**O que faz:** Retorna `{ status: 'result_timeout' };` como resultado desta etapa de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1275 — U46

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U46, delimitando tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1276 — U46

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U46 — tratamento de resultado/erro do observer; não executa instrução em runtime.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1277 — U46

**Fonte:** `          throw waitError;`

**O que faz:** Interrompe o fluxo lançando `waitError;` quando a invariante da unidade falha.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1278 — U46

**Fonte:** `        } finally {`

**O que faz:** Inicia cleanup obrigatório que deve executar independentemente do resultado em tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1279 — U46

**Fonte:** `          clearIntervalFn(progressTimer);`

**O que faz:** Executa a chamada `clearIntervalFn(progressTimer);` como passo concreto de tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1280 — U46

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U46, delimitando tratamento de resultado/erro do observer.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1281 — U46

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U46 — tratamento de resultado/erro do observer; não executa instrução em runtime.

**Como faz:** espera resultado, traduz UI error e timeout em entregas controladas e sempre limpa o timer.

**Por que foi implementado dessa forma:** erros conhecidos têm semântica de job e devem respeitar deleção segura.

**Por que uma implementação ingênua seria pior:** deixar a rejeição escapar sem classificação perderia status e poderia vazar ticker.

### Linha 1282 — U47

**Fonte:** `        assertStage(`

**O que faz:** Executa a chamada `assertStage(` como passo concreto de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1283 — U47

**Fonte:** `          resultUrl &&`

**O que faz:** Completa a expressão `resultUrl &&` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1284 — U47

**Fonte:** `            (`

**O que faz:** Completa a expressão `(` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1285 — U47

**Fonte:** `              resultUrl.startsWith('http') ||`

**O que faz:** Executa a chamada `resultUrl.startsWith('http') ||` como passo concreto de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1286 — U47

**Fonte:** `              resultUrl.startsWith('blob') ||`

**O que faz:** Executa a chamada `resultUrl.startsWith('blob') ||` como passo concreto de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1287 — U47

**Fonte:** `              resultUrl.startsWith('data:image/')`

**O que faz:** Executa a chamada `resultUrl.startsWith('data:image/')` como passo concreto de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1288 — U47

**Fonte:** `            ),`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U47, delimitando validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1289 — U47

**Fonte:** `          'URL Imagem inválida',`

**O que faz:** Completa a expressão `'URL Imagem inválida',` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1290 — U47

**Fonte:** `          5,`

**O que faz:** Completa a expressão `5,` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1291 — U47

**Fonte:** `          'Mídia extraída blob'`

**O que faz:** Completa a expressão `'Mídia extraída blob'` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1292 — U47

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U47, delimitando validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1293 — U47

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U47 — validação da URL e elevação de resolução; não executa instrução em runtime.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1294 — U47

**Fonte:** `        sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1295 — U47

**Fonte:** `          'success',`

**O que faz:** Completa a expressão `'success',` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1296 — U47

**Fonte:** `          'GEMINI_IMG_FOUND',`

**O que faz:** Completa a expressão `'GEMINI_IMG_FOUND',` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1297 — U47

**Fonte:** `          'Imagem gerada!',`

**O que faz:** Completa a expressão `'Imagem gerada!',` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1298 — U47

**Fonte:** `          getUrlLogMetadata(resultUrl)`

**O que faz:** Executa a chamada `getUrlLogMetadata(resultUrl)` como passo concreto de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1299 — U47

**Fonte:** `        );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U47, delimitando validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1300 — U47

**Fonte:** `        reportProgress('📥 EXTRAINDO IMAGEM...', job.mangaTabId);`

**O que faz:** Publica progresso visível associado à etapa validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1301 — U47

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U47 — validação da URL e elevação de resolução; não executa instrução em runtime.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1302 — U47

**Fonte:** `        if (`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (`, protegendo validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1303 — U47

**Fonte:** `          resultUrl.includes('googleusercontent.com') &&`

**O que faz:** Executa a chamada `resultUrl.includes('googleusercontent.com') &&` como passo concreto de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1304 — U47

**Fonte:** `          /=s\\d+/.test(resultUrl)`

**O que faz:** Completa a expressão `/=s\d+/.test(resultUrl)` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1305 — U47

**Fonte:** `        ) {`

**O que faz:** Completa a expressão `) {` dentro de U47 — validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1306 — U47

**Fonte:** `          resultUrl = resultUrl.replace(/=s\\d+[^?#]*/, '=s0');`

**O que faz:** Atualiza a referência/estado indicado por `resultUrl = resultUrl.replace(/=s\d+[^?#]*/, '=s0');` dentro de validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1307 — U47

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U47, delimitando validação da URL e elevação de resolução.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1308 — U47

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U47 — validação da URL e elevação de resolução; não executa instrução em runtime.

**Como faz:** aceita somente http/blob/data-image, registra metadados e troca `=sN` por `=s0` em Googleusercontent.

**Por que foi implementado dessa forma:** extrator deve receber mídia plausível e a maior resolução disponível.

**Por que uma implementação ingênua seria pior:** aceitar protocolo arbitrário amplia superfície; manter thumbnail pode degradar tradução final.

### Linha 1309 — U48

**Fonte:** `        const extraction = await resultExtractor.extractOrAuxiliaryFallback({`

**O que faz:** Declara a constante `extraction` e inicia sua expressão em U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1310 — U48

**Fonte:** `          resultImageElement,`

**O que faz:** Completa a expressão `resultImageElement,` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1311 — U48

**Fonte:** `          resultUrl,`

**O que faz:** Completa a expressão `resultUrl,` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1312 — U48

**Fonte:** `          executionMode,`

**O que faz:** Completa a expressão `executionMode,` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1313 — U48

**Fonte:** `          maxAttempts: 4,`

**O que faz:** Define a propriedade `maxAttempts` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1314 — U48

**Fonte:** `          retryDelayMs: 1000,`

**O que faz:** Define a propriedade `retryDelayMs` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1315 — U48

**Fonte:** `          logContext: {`

**O que faz:** Define a propriedade `logContext` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1316 — U48

**Fonte:** `            jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1317 — U48

**Fonte:** `            batchIdPrefix: String(job.batchId || '').slice(0, 8),`

**O que faz:** Define a propriedade `batchIdPrefix` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1318 — U48

**Fonte:** `            index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1319 — U48

**Fonte:** `          },`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U48, delimitando extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1320 — U48

**Fonte:** `          onAuxiliaryFallback: async ({ url }) => {`

**O que faz:** Define a propriedade `onAuxiliaryFallback` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1321 — U48

**Fonte:** `            const registered = await sendRuntimeMessageAsync({`

**O que faz:** Declara a constante `registered` e inicia sua expressão em U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1322 — U48

**Fonte:** `              action: 'GEMINI_RESULT_URL',`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1323 — U48

**Fonte:** `              mangaTabId: job.mangaTabId,`

**O que faz:** Define a propriedade `mangaTabId` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1324 — U48

**Fonte:** `              index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1325 — U48

**Fonte:** `              url,`

**O que faz:** Completa a expressão `url,` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1326 — U48

**Fonte:** `              jobId: job.jobId,`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1327 — U48

**Fonte:** `              batchId: job.batchId,`

**O que faz:** Define a propriedade `batchId` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1328 — U48

**Fonte:** `            });`

**O que faz:** Completa a expressão `});` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1329 — U48

**Fonte:** `            if (!registered?.ok || registered.extractionRegistered !== true) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!registered?.ok || registered.extractionRegistered !== true) {`, protegendo extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1330 — U48

**Fonte:** `              const error = new Error(\`Fallback auxiliar não foi registrado: ${registered?.reason || 'registration_failed'}\`);`

**O que faz:** Declara a constante `error` e inicia sua expressão em U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1331 — U48

**Fonte:** `              error.code = 'AUXILIARY_REGISTRATION_FAILED';`

**O que faz:** Atualiza a referência/estado indicado por `error.code = 'AUXILIARY_REGISTRATION_FAILED';` dentro de extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1332 — U48

**Fonte:** `              throw error;`

**O que faz:** Interrompe o fluxo lançando `error;` quando a invariante da unidade falha.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1333 — U48

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U48, delimitando extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1334 — U48

**Fonte:** `            sendLog('info', 'GEMINI_AUXILIARY_REGISTERED',`

**O que faz:** Inicia log estruturado da transição/resultado corrente de extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1335 — U48

**Fonte:** `              'Aba auxiliar assumiu a extração; o job Gemini permanecerá vivo até a persistência.', {`

**O que faz:** Completa a expressão `'Aba auxiliar assumiu a extração; o job Gemini permanecerá vivo até a persistência.', {` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1336 — U48

**Fonte:** `                jobIdPrefix: String(job.jobId || '').slice(0, 8),`

**O que faz:** Define a propriedade `jobIdPrefix` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1337 — U48

**Fonte:** `                batchIdPrefix: String(job.batchId || '').slice(0, 8),`

**O que faz:** Define a propriedade `batchIdPrefix` do objeto/configuração construído em extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1338 — U48

**Fonte:** `              });`

**O que faz:** Completa a expressão `});` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1339 — U48

**Fonte:** `            return registered;`

**O que faz:** Retorna `registered;` como resultado desta etapa de extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1340 — U48

**Fonte:** `          },`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U48, delimitando extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1341 — U48

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U48 — extração e transferência para fallback auxiliar.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1342 — U48

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U48 — extração e transferência para fallback auxiliar; não executa instrução em runtime.

**Como faz:** chama extractor e, quando necessário, registra `GEMINI_RESULT_URL` exigindo ACK `extractionRegistered`.

**Por que foi implementado dessa forma:** ownership só pode migrar para aba auxiliar depois de confirmação do background.

**Por que uma implementação ingênua seria pior:** finalizar sem ACK pode deixar resultado sem nenhum responsável.

### Linha 1343 — U49

**Fonte:** `        if (extraction.kind === 'extracted' && extraction.dataUrl) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (extraction.kind === 'extracted' && extraction.dataUrl) {`, protegendo quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1344 — U49

**Fonte:** `          try {`

**O que faz:** Inicia bloco protegido porque esta operação de quarentena final e staging do resultado direto pode falhar por DOM/API externa.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1345 — U49

**Fonte:** `            const quarantineResult = await imageQuarantine.assessExtractedResult({`

**O que faz:** Declara a constante `quarantineResult` e inicia sua expressão em U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1346 — U49

**Fonte:** `              element: resultImageElement,`

**O que faz:** Define a propriedade `element` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1347 — U49

**Fonte:** `              candidateDataUrl: extraction.dataUrl,`

**O que faz:** Define a propriedade `candidateDataUrl` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1348 — U49

**Fonte:** `              inputDataUrl: job.srcData,`

**O que faz:** Define a propriedade `inputDataUrl` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1349 — U49

**Fonte:** `              inputHash: inputImageHash,`

**O que faz:** Define a propriedade `inputHash` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1350 — U49

**Fonte:** `            });`

**O que faz:** Completa a expressão `});` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1351 — U49

**Fonte:** `            if (quarantineResult.quarantined) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (quarantineResult.quarantined) {`, protegendo quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1352 — U49

**Fonte:** `              sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1353 — U49

**Fonte:** `                'error',`

**O que faz:** Completa a expressão `'error',` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1354 — U49

**Fonte:** `                'GEMINI_RESULT_MATCHES_INPUT',`

**O que faz:** Completa a expressão `'GEMINI_RESULT_MATCHES_INPUT',` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1355 — U49

**Fonte:** `                'Resultado bloqueado pela quarentena de imagem',`

**O que faz:** Completa a expressão `'Resultado bloqueado pela quarentena de imagem',` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1356 — U49

**Fonte:** `                { reason: quarantineResult.reason, exactMatch: quarantineResult.exactMatch === true }`

**O que faz:** Completa a expressão `{ reason: quarantineResult.reason, exactMatch: quarantineResult.exactMatch === true }` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1357 — U49

**Fonte:** `              );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U49, delimitando quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1358 — U49

**Fonte:** `              const quarantineError = new Error('O resultado do Gemini é idêntico à imagem de entrada.');`

**O que faz:** Declara a constante `quarantineError` e inicia sua expressão em U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1359 — U49

**Fonte:** `              quarantineError.code = 'GEMINI_RESULT_MATCHES_INPUT';`

**O que faz:** Atualiza a referência/estado indicado por `quarantineError.code = 'GEMINI_RESULT_MATCHES_INPUT';` dentro de quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1360 — U49

**Fonte:** `              quarantineError.alreadyLogged = true;`

**O que faz:** Atualiza a referência/estado indicado por `quarantineError.alreadyLogged = true;` dentro de quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1361 — U49

**Fonte:** `              throw quarantineError;`

**O que faz:** Interrompe o fluxo lançando `quarantineError;` quando a invariante da unidade falha.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1362 — U49

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U49, delimitando quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1363 — U49

**Fonte:** `          } catch (quarantineError) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1364 — U49

**Fonte:** `            if (quarantineError?.code === 'GEMINI_RESULT_MATCHES_INPUT') throw quarantineError;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (quarantineError?.code === 'GEMINI_RESULT_MATCHES_INPUT') throw quarantineError;`, protegendo quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1365 — U49

**Fonte:** `            sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1366 — U49

**Fonte:** `              'warn',`

**O que faz:** Completa a expressão `'warn',` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1367 — U49

**Fonte:** `              'GEMINI_QUARANTINE_HASH_UNAVAILABLE',`

**O que faz:** Completa a expressão `'GEMINI_QUARANTINE_HASH_UNAVAILABLE',` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1368 — U49

**Fonte:** `              'A comparação exata do resultado falhou; o fluxo continuará com os filtros estruturais',`

**O que faz:** Completa a expressão `'A comparação exata do resultado falhou; o fluxo continuará com os filtros estruturais',` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1369 — U49

**Fonte:** `              { messageLength: String(quarantineError?.message || '').length }`

**O que faz:** Completa a expressão `{ messageLength: String(quarantineError?.message || '').length }` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1370 — U49

**Fonte:** `            );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U49, delimitando quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1371 — U49

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U49, delimitando quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1372 — U49

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U49 — quarentena final e staging do resultado direto; não executa instrução em runtime.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1373 — U49

**Fonte:** `          await stageAndCommitResult({`

**O que faz:** Suspende esta função até concluir `stageAndCommitResult({`, preservando a ordem assíncrona de quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1374 — U49

**Fonte:** `            action: 'GEMINI_IMAGE_EXTRACTED',`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1375 — U49

**Fonte:** `            mangaTabId: job.mangaTabId,`

**O que faz:** Define a propriedade `mangaTabId` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1376 — U49

**Fonte:** `            index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1377 — U49

**Fonte:** `            src: extraction.dataUrl,`

**O que faz:** Define a propriedade `src` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1378 — U49

**Fonte:** `            jobId: job.jobId,`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1379 — U49

**Fonte:** `            batchId: job.batchId,`

**O que faz:** Define a propriedade `batchId` do objeto/configuração construído em quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1380 — U49

**Fonte:** `          });`

**O que faz:** Completa a expressão `});` dentro de U49 — quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1381 — U49

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U49, delimitando quarentena final e staging do resultado direto.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1382 — U49

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U49 — quarentena final e staging do resultado direto; não executa instrução em runtime.

**Como faz:** compara resultado contra input, bloqueia match exato, tolera falha não conclusiva de hash e então envia staging.

**Por que foi implementado dessa forma:** a última barreira deve impedir devolver a própria página original como tradução.

**Por que uma implementação ingênua seria pior:** pular comparação permitiria falso positivo; falhar fechado em qualquer erro de hash derrubaria resultados válidos.

### Linha 1383 — U50

**Fonte:** `        return {`

**O que faz:** Retorna `{` como resultado desta etapa de status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1384 — U50

**Fonte:** `          status: extraction.kind === 'extracted'`

**O que faz:** Define a propriedade `status` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1385 — U50

**Fonte:** `            ? 'delivered_extracted'`

**O que faz:** Completa a expressão `? 'delivered_extracted'` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1386 — U50

**Fonte:** `            : 'delivered_auxiliary',`

**O que faz:** Completa a expressão `: 'delivered_auxiliary',` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1387 — U50

**Fonte:** `        };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U50, delimitando status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1388 — U50

**Fonte:** `      } catch (error) {`

**O que faz:** Captura a falha do bloco anterior e aplica a política de erro definida por status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1389 — U50

**Fonte:** `        if (!error?.alreadyLogged) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (!error?.alreadyLogged) {`, protegendo status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1390 — U50

**Fonte:** `          sendLog(`

**O que faz:** Inicia log estruturado da transição/resultado corrente de status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1391 — U50

**Fonte:** `            'error',`

**O que faz:** Completa a expressão `'error',` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1392 — U50

**Fonte:** `            error?.code || 'GEMINI_ERROR',`

**O que faz:** Completa a expressão `error?.code || 'GEMINI_ERROR',` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1393 — U50

**Fonte:** `            'Job Gemini encerrado com erro',`

**O que faz:** Completa a expressão `'Job Gemini encerrado com erro',` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1394 — U50

**Fonte:** `            {`

**O que faz:** Completa a expressão `{` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1395 — U50

**Fonte:** `              executionMode,`

**O que faz:** Completa a expressão `executionMode,` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1396 — U50

**Fonte:** `              index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1397 — U50

**Fonte:** `              messageLength: String(error?.message || '').length,`

**O que faz:** Define a propriedade `messageLength` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1398 — U50

**Fonte:** `            }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U50, delimitando status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1399 — U50

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U50, delimitando status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1400 — U50

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U50, delimitando status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1401 — U50

**Fonte:** `        runtime.sendMessage({`

**O que faz:** Envia mensagem pela fronteira Chrome runtime conforme o protocolo de status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1402 — U50

**Fonte:** `          action: 'GEMINI_ERROR',`

**O que faz:** Define a propriedade `action` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1403 — U50

**Fonte:** `          mangaTabId: job.mangaTabId,`

**O que faz:** Define a propriedade `mangaTabId` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1404 — U50

**Fonte:** `          index: job.index,`

**O que faz:** Define a propriedade `index` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1405 — U50

**Fonte:** `          error: error.message,`

**O que faz:** Define a propriedade `error` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1406 — U50

**Fonte:** `          jobId: job.jobId,`

**O que faz:** Define a propriedade `jobId` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1407 — U50

**Fonte:** `          batchId: job.batchId,`

**O que faz:** Define a propriedade `batchId` do objeto/configuração construído em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1408 — U50

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U50 — status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1409 — U50

**Fonte:** `        return { status: 'error', error };`

**O que faz:** Retorna `{ status: 'error', error };` como resultado desta etapa de status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1410 — U50

**Fonte:** `      } finally {`

**O que faz:** Inicia cleanup obrigatório que deve executar independentemente do resultado em status final e catch geral.

**Como faz:** retorna status direto/auxiliar; em exceção loga uma vez, envia `GEMINI_ERROR` com identidade e retorna objeto de erro.

**Por que foi implementado dessa forma:** bootstrap precisa receber resultado controlado e background precisa associar falha ao job correto.

**Por que uma implementação ingênua seria pior:** rejeição não tratada ou mensagem sem IDs deixaria lifecycle inconsistente.

### Linha 1411 — U51

**Fonte:** `        setAntiThrottleMode('minimal');`

**O que faz:** Executa a chamada `setAntiThrottleMode('minimal');` como passo concreto de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1412 — U51

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U51 — cleanup global do run; não executa instrução em runtime.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1413 — U51

**Fonte:** `        if (activeObserver) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (activeObserver) {`, protegendo cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1414 — U51

**Fonte:** `          try { activeObserver.stop(); } catch (_e) {}`

**O que faz:** Inicia bloco protegido porque esta operação de cleanup global do run pode falhar por DOM/API externa.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1415 — U51

**Fonte:** `          activeObserver = null;`

**O que faz:** Atualiza a referência/estado indicado por `activeObserver = null;` dentro de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1416 — U51

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U51, delimitando cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1417 — U51

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U51 — cleanup global do run; não executa instrução em runtime.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1418 — U51

**Fonte:** `        if (pageWindow.__mangaTranslatorActiveGeminiObserver) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (pageWindow.__mangaTranslatorActiveGeminiObserver) {`, protegendo cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1419 — U51

**Fonte:** `          delete pageWindow.__mangaTranslatorActiveGeminiObserver;`

**O que faz:** Completa a expressão `delete pageWindow.__mangaTranslatorActiveGeminiObserver;` dentro de U51 — cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1420 — U51

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U51, delimitando cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1421 — U51

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U51 — cleanup global do run; não executa instrução em runtime.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1422 — U51

**Fonte:** `        stopScrollAssist();`

**O que faz:** Executa a chamada `stopScrollAssist();` como passo concreto de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1423 — U51

**Fonte:** `        closeKeepAlive();`

**O que faz:** Executa a chamada `closeKeepAlive();` como passo concreto de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1424 — U51

**Fonte:** `        removeGeminiManualPanel();`

**O que faz:** Executa a chamada `removeGeminiManualPanel();` como passo concreto de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1425 — U51

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U51 — cleanup global do run; não executa instrução em runtime.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1426 — U51

**Fonte:** `        if (pageWindow.__mangaTranslatorManualPickHandler) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (pageWindow.__mangaTranslatorManualPickHandler) {`, protegendo cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1427 — U51

**Fonte:** `          root.removeEventListener(`

**O que faz:** Executa a chamada `root.removeEventListener(` como passo concreto de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1428 — U51

**Fonte:** `            'click',`

**O que faz:** Completa a expressão `'click',` dentro de U51 — cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1429 — U51

**Fonte:** `            pageWindow.__mangaTranslatorManualPickHandler,`

**O que faz:** Completa a expressão `pageWindow.__mangaTranslatorManualPickHandler,` dentro de U51 — cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1430 — U51

**Fonte:** `            true`

**O que faz:** Completa a expressão `true` dentro de U51 — cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1431 — U51

**Fonte:** `          );`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U51, delimitando cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1432 — U51

**Fonte:** `          delete pageWindow.__mangaTranslatorManualPickHandler;`

**O que faz:** Completa a expressão `delete pageWindow.__mangaTranslatorManualPickHandler;` dentro de U51 — cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1433 — U51

**Fonte:** `        }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U51, delimitando cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1434 — U51

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U51 — cleanup global do run; não executa instrução em runtime.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1435 — U51

**Fonte:** `        queryAllDeep('img').forEach(image => {`

**O que faz:** Executa a chamada `queryAllDeep('img').forEach(image => {` como passo concreto de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1436 — U51

**Fonte:** `          if (image.style.outline?.includes('#FF4444')) {`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (image.style.outline?.includes('#FF4444')) {`, protegendo cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1437 — U51

**Fonte:** `            image.style.outline = '';`

**O que faz:** Atualiza a referência/estado indicado por `image.style.outline = '';` dentro de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1438 — U51

**Fonte:** `            image.style.outlineOffset = '';`

**O que faz:** Atualiza a referência/estado indicado por `image.style.outlineOffset = '';` dentro de cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1439 — U51

**Fonte:** `          }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U51, delimitando cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1440 — U51

**Fonte:** `        });`

**O que faz:** Completa a expressão `});` dentro de U51 — cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1441 — U51

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U51, delimitando cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1442 — U51

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U51, delimitando cleanup global do run.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1443 — U51

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U51 — cleanup global do run; não executa instrução em runtime.

**Como faz:** restaura anti-throttle, para observer, remove referência global, timer/keepalive/HUD/listener/outlines.

**Por que foi implementado dessa forma:** a página pode permanecer viva depois do job e não deve carregar resíduos para a próxima execução.

**Por que uma implementação ingênua seria pior:** observer/timer/listener órfão causaria duplicidade, vazamento e ações sobre job seguinte.

### Linha 1444 — U52

**Fonte:** `    function getActiveObserver() {`

**O que faz:** Declara a função `getActiveObserver` pertencente a U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1445 — U52

**Fonte:** `      return activeObserver;`

**O que faz:** Retorna `activeObserver;` como resultado desta etapa de API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1446 — U52

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U52, delimitando API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1447 — U52

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U52 — API pública da instância; não executa instrução em runtime.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1448 — U52

**Fonte:** `    return {`

**O que faz:** Retorna `{` como resultado desta etapa de API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1449 — U52

**Fonte:** `      run,`

**O que faz:** Completa a expressão `run,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1450 — U52

**Fonte:** `      dataURLtoFile,`

**O que faz:** Completa a expressão `dataURLtoFile,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1451 — U52

**Fonte:** `      waitForElement,`

**O que faz:** Completa a expressão `waitForElement,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1452 — U52

**Fonte:** `      tryClickModelImageCards,`

**O que faz:** Completa a expressão `tryClickModelImageCards,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1453 — U52

**Fonte:** `      isLikelyGeneratedImage,`

**O que faz:** Completa a expressão `isLikelyGeneratedImage,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1454 — U52

**Fonte:** `      isManualSelectableImage,`

**O que faz:** Completa a expressão `isManualSelectableImage,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1455 — U52

**Fonte:** `      findGeneratedResultImages,`

**O que faz:** Completa a expressão `findGeneratedResultImages,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1456 — U52

**Fonte:** `      setManualGeminiResultUrl,`

**O que faz:** Completa a expressão `setManualGeminiResultUrl,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1457 — U52

**Fonte:** `      removeGeminiManualPanel,`

**O que faz:** Completa a expressão `removeGeminiManualPanel,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1458 — U52

**Fonte:** `      createGeminiManualPanel,`

**O que faz:** Completa a expressão `createGeminiManualPanel,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1459 — U52

**Fonte:** `      setPromptInEditor,`

**O que faz:** Completa a expressão `setPromptInEditor,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1460 — U52

**Fonte:** `      shouldKeepConversationForDebug,`

**O que faz:** Completa a expressão `shouldKeepConversationForDebug,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1461 — U52

**Fonte:** `      requestImageData,`

**O que faz:** Completa a expressão `requestImageData,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1462 — U52

**Fonte:** `      getAntiThrottleModeForExecutionMode,`

**O que faz:** Completa a expressão `getAntiThrottleModeForExecutionMode,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1463 — U52

**Fonte:** `      setAntiThrottleMode,`

**O que faz:** Completa a expressão `setAntiThrottleMode,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1464 — U52

**Fonte:** `      getActiveObserver,`

**O que faz:** Completa a expressão `getActiveObserver,` dentro de U52 — API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1465 — U52

**Fonte:** `    };`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U52, delimitando API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1466 — U52

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática aberta nas linhas anteriores de U52, delimitando API pública da instância.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1467 — U52

**Fonte:** ␠ [linha vazia]

**O que faz:** Separa visualmente construções dentro de U52 — API pública da instância; não executa instrução em runtime.

**Como faz:** retorna run e helpers necessários a composition root, testes e compatibilidade.

**Por que foi implementado dessa forma:** uma única implementação compartilhada reduz drift entre funções internas e reexports.

**Por que uma implementação ingênua seria pior:** copiar helpers para content_gemini criaria versões concorrentes do mesmo comportamento.

### Linha 1468 — U53

**Fonte:** `  const api = { createGeminiJobRunner };`

**O que faz:** Declara a constante `api` e inicia sua expressão em U53 — export global e CommonJS.

**Como faz:** publica a factory no scope do content script e o mesmo objeto em module.exports.

**Por que foi implementado dessa forma:** Manifest e Jest precisam carregar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** exports divergentes poderiam fazer testes passarem sobre código diferente do browser.

### Linha 1469 — U53

**Fonte:** `  scope.MangaTranslatorGeminiJobRunner = api;`

**O que faz:** Publica no escopo global a referência indicada por `scope.MangaTranslatorGeminiJobRunner = api;`.

**Como faz:** publica a factory no scope do content script e o mesmo objeto em module.exports.

**Por que foi implementado dessa forma:** Manifest e Jest precisam carregar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** exports divergentes poderiam fazer testes passarem sobre código diferente do browser.

### Linha 1470 — U53

**Fonte:** `  if (typeof module !== 'undefined' && module.exports) module.exports = api;`

**O que faz:** Abre um guard/ramo condicional cuja condição começa por `if (typeof module !== 'undefined' && module.exports) module.exports = api;`, protegendo export global e CommonJS.

**Como faz:** publica a factory no scope do content script e o mesmo objeto em module.exports.

**Por que foi implementado dessa forma:** Manifest e Jest precisam carregar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** exports divergentes poderiam fazer testes passarem sobre código diferente do browser.

### Linha 1471 — U53

**Fonte:** `})(typeof self !== 'undefined' ? self : globalThis);`

**O que faz:** Fecha e invoca a IIFE escolhendo o escopo global compatível com browser/teste.

**Como faz:** publica a factory no scope do content script e o mesmo objeto em module.exports.

**Por que foi implementado dessa forma:** Manifest e Jest precisam carregar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** exports divergentes poderiam fazer testes passarem sobre código diferente do browser.

### Linha 1472 — U54

**Fonte:** ␠ [linha vazia]

**O que faz:** Registra a posição vazia produzida pelo newline terminal do blob.

**Como faz:** representa a posição vazia criada pelo terminador `\n` do blob.

**Por que foi implementado dessa forma:** a auditoria física usa `split('\n')` e exige uma posição documental por entrada.

**Por que uma implementação ingênua seria pior:** ignorar newline final quebraria a igualdade 1472/1472 usada pelo gate.

## Cobertura documental linha a linha/bloco

As faixas abaixo são contíguas, cobrem **0001–1472 sem lacunas** e tratam blocos estruturalmente inseparáveis em conjunto.

### Linhas 0001–0007

**O que faz.** Ativa strict mode e documenta a fronteira arquitetural: este módulo executa um job Gemini já reivindicado, enquanto claim/bootstrap/keepalive/handlers ficam em `content_gemini.js`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A separação evita duplicar ownership do job dentro do runner. Um runner que também fizesse claim criaria duas fontes de verdade para identidade e ciclo de vida. Os comentários são parte do contrato arquitetural e batem com `content_gemini.js`, que chama `jobRunner.run(job)` após o claim.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — o carregamento real ocorre nas suítes de content-gemini, mas comentários/strict mode não têm assertion semântica própria.

### Linhas 0008–0013

**O que faz.** IIFE recebe o `scope` global e resolve `MangaTranslatorGeminiImageQuarantine`; em CommonJS tenta `require('./image-quarantine.js')` como fallback.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O padrão permite o mesmo arquivo como content script clássico e módulo CommonJS de teste. O `catch` vazio impede que a ausência do fallback derrube imediatamente o carregamento; a validação de dependências posterior falha de modo explícito se a quarentena continuar ausente.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` carrega o módulo real; não há assertion específica para o `catch` do require.

### Linhas 0014–0038

**O que faz.** Define `createGeminiJobRunner` com injeção explícita de DOM, window, runtime, storage e todos os módulos colaboradores; também injeta relógios/IO para testabilidade.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A DI permite simular Chrome/DOM sem reimplementar o runner e torna efeitos laterais observáveis. Defaults apontam para os globais reais no browser. Uma implementação presa diretamente aos globais tornaria isolamento, testes de erro e controle de timers muito mais frágeis.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-00 cria o runner real com combinações de dependências e as demais suítes injetam mocks reais nos pontos de fronteira.

### Linhas 0039–0050

**O que faz.** Rejeita três classes de dependências ausentes e inicializa `activeObserver` como estado por instância.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Falhar cedo evita um job parcialmente iniciado com cleanup incompleto. `activeObserver` centraliza o observer corrente para integração com seleção manual e cleanup. A arquitetura pressupõe uma execução ativa por instância; concorrência paralela no mesmo runner não é protegida localmente.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-00 cobre os três grupos de validação.

### Linhas 0051–0056

**O que faz.** Mapeia `minimized_window` e `background_delete` para anti-throttle `balanced`; demais modos usam `minimal`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Modos em segundo plano precisam de mitigação maior sem cair sempre no modo legado mais invasivo. Um único modo agressivo aumentaria interferência na página; um modo sempre mínimo aumentaria risco de throttling.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-06.

### Linhas 0057–0074

**O que faz.** Normaliza `minimal|balanced|legacy`, publica `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` via `CustomEvent` e degrada graciosamente sem dispatcher.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O evento cruza a fronteira para a lógica MAIN-world sem acoplar o runner a uma implementação específica. Valores desconhecidos são reduzidos a `minimal`, impedindo estados arbitrários.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-07 e RUN-07A verificam normalização, eventos e ausência de dispatcher.

### Linhas 0075–0084

**O que faz.** Adapta `chrome.storage.local.get` callback para Promise e devolve `{}` em exceção síncrona.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Isso simplifica fluxos assíncronos como debug mode e execution mode. O fallback impede quebra por mock/API indisponível, mas não observa explicitamente `runtime.lastError` do storage.

**Evidência de teste.** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — há uso indireto; falta teste do caminho de exceção e de `lastError`.

### Linhas 0085–0100

**O que faz.** Localiza o composer editável vivo atravessando DOM profundo, filtra elementos invisíveis/desabilitados e exclui contenteditables dentro de mensagens já renderizadas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O filtro evita confundir resposta/consulta histórica com o campo de entrada. Em seguida sobe ancestrais até wrappers conhecidos e recusa editor/composer desabilitado.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — os fluxos RPA exercitam seleção; não há teste unitário isolado de todas as exclusões.

### Linhas 0101–0119

**O que faz.** Espera estabilidade do par editor/composer por pelo menos 750 ms e nunca aceita antes de 1,5 s; consulta a cada 250 ms e falha com `GEMINI_COMPOSER_NOT_READY`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A hidratação do Gemini pode substituir nós após o wrapper aparecer. Renovar referências evita enviar para nó stale. Aceitar o primeiro contenteditable seria suscetível a race de hidratação.

**Evidência de teste.** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a busca estável participa do RPA, mas o timeout/código `GEMINI_COMPOSER_NOT_READY` não aparece em teste.

### Linhas 0120–0131

**O que faz.** Captura telemetria de contexto do anexo: conectividade, tag do composer, quantidade de inputs e evidências de preview.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Esses metadados ajudam a diagnosticar métodos de upload sem registrar conteúdo sensível da imagem. Uma telemetria baseada apenas em 'sucesso/falha' perderia a etapa em que a UI divergiu.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — logs são produzidos nos testes de attachment gate; os campos do snapshot não têm assertions individuais.

### Linhas 0132–0154

**O que faz.** Valida data URL, extrai MIME, decodifica Base64, converte bytes para `Uint8Array` e cria `File`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A conversão é necessária para alimentar input/drop/paste reais. Validação explícita evita criar `File` sem MIME ou depender de APIs ausentes.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-01 e RUN-01B cobrem sucesso, formato inválido e APIs ausentes.

### Linhas 0155–0173

**O que faz.** Implementa `queryAllDeep`: prefere `domApi.findAllDeep`, filtra apenas elementos que suportam `matches`, tolera seletor inválido e cai para `querySelectorAll`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Shadow DOM aberto exige busca além do DOM plano. O fallback mantém compatibilidade onde helper profundo não encontra nada. Capturas evitam que um seletor transitório derrube o job.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — múltiplos fluxos reais dependem dele; exceções e fallback não recebem assertions dedicadas.

### Linhas 0174–0178

**O que faz.** `queryFirstDeep` reutiliza `queryAllDeep` e retorna primeiro match ou `null`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Centraliza a política de busca profunda para editor, botões e imagens, evitando divergência de seletor.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 0179–0190

**O que faz.** Coleta `shadowRoot` abertos de elementos encontrados por `findAllDeep`, removendo falsy e tolerando erro.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É usado para registrar o mesmo `MutationObserver` em raízes profundas já existentes. Sem isso, inserções dentro de shadow roots poderiam nunca acordar `waitForElement`.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no efeito — RUN-04B insere editor dentro de Shadow DOM e espera resolução; o `catch` isolado não é provado.

### Linhas 0191–0245

**O que faz.** `waitForElement` resolve imediatamente se já existe; senão cria `MutationObserver`, observa root e shadow roots, acompanha novos roots, usa timeout e garante `finish` idempotente com cancelamento/desconexão.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A idempotência evita resolução dupla e observer vazando após sucesso/timeout. Observar novas shadow roots trata DOM dinâmico do Gemini.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-04 e RUN-04B; ⚠️ o caso 'MutationObserver ausente' não tem assertion específica.

### Linhas 0246–0257

**O que faz.** Delegadores para `domApi.getImageSource`, `isIgnoredGeminiImageSource` e `isModelResponseImage`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Mantêm as regras de DOM num módulo especializado e tornam o runner focado em orquestração.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 0258–0282

**O que faz.** Tenta clicar, em ordem, cartões/botões/imagens de resposta do modelo; sobe para elemento clicável e continua se um clique lança.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É um fallback resiliente a variações de markup. Parar após o primeiro seletor encontrado mas não clicável seria frágil.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-COV-01 e RUN-COV-02.

### Linhas 0283–0319

**O que faz.** Classifica imagem como provável resultado: bloqueia input estrutural, sources ignoradas/preexistentes; aceita autoria explícita, padrões conhecidos de URL/blob e, como fallback, dimensões mínimas/área.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A quarentena vem antes das heurísticas positivas para impedir devolver o próprio anexo. O limiar aceita proporções extremas desde que haja área e lado mínimo.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-09 bloqueia preview; plan-rpa cobre preexistente/avatar/pequena e aceita 60x1024; E2E ownership valida clone/órfã/resultado.

### Linhas 0320–0328

**O que faz.** Critério manual é mais permissivo que o automático, mas ainda recusa input estrutural, source ignorada e imagem sem dimensões mínimas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A intervenção humana precisa poder escolher um resultado que heurísticas automáticas rejeitariam, sem permitir selecionar o próprio anexo.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-09 e caso do painel manual em `plan-rpa-edge-cases.test.js`.

### Linhas 0329–0345

**O que faz.** Enumera todas as IMG profundas, força lazy images para eager, promove `data-src` e filtra por `isLikelyGeneratedImage`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Isso reduz falso 'nenhum resultado' quando Gemini posterga carregamento. Alterar `loading/src` é side effect deliberado de observabilidade.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — painel 'Usar última' e fluxos RPA exercitam; não há assertion sobre `loading=eager`.

### Linhas 0346–0366

**O que faz.** Registra URL manual no window, entrega ao observer ativo, atualiza HUD e emite log sanitizado via `getUrlLogMetadata`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O observer continua sendo a autoridade do resultado; a seleção manual não contorna a pipeline final. Metadados evitam logar URL assinada inteira.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-05; `rpa-flow` também verifica redaction de URL em logs de resultado.

### Linhas 0367–0386

**O que faz.** Remove painel, listener de captura e outlines/data attributes de imagens marcadas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Cleanup explícito evita listeners duplicados e UI residual entre jobs.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — cleanup ocorre no `finally`; não há assertion completa de todos os resíduos.

### Linhas 0387–0509

**O que faz.** Cria HUD manual, registra qualquer uso como erro grave de automação, oferece 'Usar última' e modo de seleção por clique com `composedPath`, marca candidatas e remove listener/outlines após escolha.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O HUD é fallback operacional, não caminho silencioso: a telemetria denuncia necessidade de intervenção. `textContent` é usado para dados dinâmicos; o HTML inserido é estático.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-07B verifica logs de intervenção; `plan-rpa-edge-cases` verifica seleção manual e entrega do resultado.

### Linhas 0510–0596

**O que faz.** Injeta prompt no editor: foca nós, tenta API Quill, substitui filhos DOM, dispara `beforeinput/input/change`, espelha `value` quando aplicável e retorna se texto final tem tamanho mínimo.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Combina caminhos porque o Gemini muda entre wrappers/contenteditable/Quill. A verificação posterior no `run` é a barreira real. Implementação ingênua com apenas `textContent=` poderia não atualizar o estado interno do framework.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — muitos fluxos confirmam `PROMPT_INJECTED`/submit, mas `setPromptInEditor` não possui teste unitário direto; a ordem 'mutação antes de beforeinput' é compatibilidade frágil.

### Linhas 0597–0608

**O que faz.** Preserva conversa somente para erro em `background_delete` quando `debugMode` está true.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Restringe exceção de privacidade ao caso de diagnóstico; sucesso ou outros modos não herdam a preservação.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — `safe-background-delete.test.js` chama a função exportada com debug true/false.

### Linhas 0609–0621

**O que faz.** Wrapper resiliente de `runtime.sendMessage` que retorna resposta ou `null` em `lastError`/exceção.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É usado na aquisição de imagem, onde ausência temporária de resposta pode ser tentada novamente.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE; faltam assertions isoladas para exceção e `lastError`.

### Linhas 0622–0634

**O que faz.** Solicita `REQUEST_IMAGE_DATA` até 5 vezes, aguardando 1 s entre falhas; retorna assim que houver `srcData` ou `null` após esgotar tentativas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Retry trata timing entre aba Gemini e content script do mangá sem duplicar o job. O payload só é validado como imagem depois, por `assertStage`.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — falhas de payload são cobertas; não há teste específico contando cinco tentativas sem resposta.

### Linhas 0635–0655

**O que faz.** `assertStage` transforma invariantes de etapas em logs `TEST_FAIL_STEP_n` + exceção ou `TEST_PASS_STEP_n`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Padroniza diagnósticos de pipeline e impede continuar após precondição quebrada.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — RPA cobre falhas e sucessos de etapas, mas não cada log de cada step.

### Linhas 0656–0671

**O que faz.** Entrada `run`: exige job, reseta anti-throttle para minimal, obtém geminiTabId, tenta recuperação de deleção pendente antes de abrir keepalive e encerra cedo se recovery foi tratado.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Recuperação vem antes de nova automação para não sobrepor entrega antiga com job novo. Evita keepalive desnecessário nesse caminho.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-02 verifica retorno e zero open/close keepalive.

### Linhas 0672–0679

**O que faz.** Abre keepalive e registra job confirmado com jobId truncado, índice e tabId.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Mantém o content script vivo durante operação longa e evita expor ID completo no log.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE parcialmente — RUN-03 verifica open/close; conteúdo exato do debug log não é assertado.

### Linhas 0680–0705

**O que faz.** Cria scroll assist a cada 2 s para manter UI recente/imagens em viewport e `stopScrollAssist` idempotente.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A UI do Gemini pode lazy-renderizar conteúdo fora de viewport. Cleanup explícito evita timer órfão.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no cleanup — REG-12/CG-19/CG-40 verifica `clearInterval`; detalhes de scroll não têm assertion.

### Linhas 0706–0741

**O que faz.** `deliverWithSecureDeletion` diferencia modos: em temp_chat pode apagar fire-and-forget e entregar; em background/minimized pode preservar erro em debug ou exigir `deleteOrScheduleRecovery` antes da entrega final.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O contrato evita finalizar job destrutivo antes de exclusão segura nos modos que prometem limpeza. Em temp_chat, deleção eventual não bloqueia a entrega.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — safe-delete/deletion e fluxos de erro cobrem partes; falta teste unitário deste helper para todas as combinações.

### Linhas 0742–0758

**O que faz.** Segundo wrapper de runtime preserva razão de falha em objeto `{ok:false, reason}` em vez de `null`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Staging/commit precisam distinguir resposta vazia, lastError e exceção para logs/retries. Um booleano perderia diagnóstico.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 0759–0809

**O que faz.** `stageAndCommitResult` exige ACK de staging/persistência, depois envia `GEMINI_RESULT_COMMIT` até 3 vezes sem reenviar imagem; falha com códigos distintos e loga staging/commit.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Esse é o principal invariante anti-perda: bytes persistem antes de finalizar job. Retry somente do commit reduz duplicação de payload e exige idempotência do background.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-12 prova ordem e ausência de deleção antes do commit; RUN-13 bloqueia commit quando staging falha; RUN-14 prova 3 commits e apenas 1 staging. ⚠️ `RESULT_COMMIT_FAILED` após as 3 falhas não tem assertion específica.

### Linhas 0810–0851

**O que faz.** Inicia scroll assist; solicita imagem, valida presença e prefixo `data:image/`, salva em `job.srcData`, tenta SHA-256 exato via quarentena e degrada para filtro estrutural se hash falhar.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A imagem original passa a ser referência de ownership/quarentena. Hash exato fortalece a defesa, mas falha de hashing não bloqueia todo o job.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE/INDIRETAMENTE — CG-16 e CG-17 cobrem falta/payload inválido; RUN-10/11 cobrem comparação final; caminho de falha inicial do hash só é logado, sem teste dedicado.

### Linhas 0852–0866

**O que faz.** Espera editor por até 20 s e rejeita editor ausente/desabilitado.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Impede anexar/enviar para UI ainda indisponível. Um clique/envio otimista poderia atingir elemento stale/oculto.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — REG-12/CG-19/CG-40 cobre editor desabilitado e cleanup; waitForElement tem RUN-04/04B.

### Linhas 0867–0888

**O que faz.** Tenta focar editor/janela com eventos compatíveis; carrega `geminiExecutionMode` do storage quando job não traz; escolhe anti-throttle estável.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Foco é tentativa local sem ativar fisicamente tab/window; o modo de execução permanece configurável e a DI tolera diferenças de Event.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — modos são exercitados em unit/E2E; sequência exata de focus não é assertada.

### Linhas 0889–0952

**O que faz.** Para `temp_chat`, chama `temporaryChatApi.ensureActive`, traduz estados em flags, loga status, espera 1,5 s após ativação/already-active e transforma falha de verificação/exceção em warning em vez de abortar.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Conversa temporária é preferência operacional, não precondição absoluta: se indisponível, o fluxo ainda pode produzir resultado e depois decidir deleção.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — suítes de temporary-chat testam o módulo colaborador e RPA usa o fluxo; mapeamento completo local não tem teste isolado.

### Linhas 0953–0960

**O que faz.** Renova editor/composer estáveis depois da possível mudança de UI, cria `File` da imagem e bloqueia arquivo vazio.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Evita reutilizar nó capturado antes da ativação de temp chat. O comentário explicita o motivo de race/hidratação.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE; timeout de estabilidade é lacuna específica.

### Linhas 0961–1004

**O que faz.** Executa `attachmentApi.attachFile` com alvos renováveis, timeout 20 s, retry 3,5 s, máximo 3 dispatches; gera telemetria e bloqueia completamente prompt/submit se `confirmed` for falso.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O anexo precisa de evidência observável antes de enviar texto, impedindo prompt sem imagem. Não altera contexto físico da janela nessa variante.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — CG-21 e E2E `REG attachment gate` verificam STARTED→REJECTED→SUBMIT_BLOCKED e ausência de prompt/submit; caso de sucesso verifica ATTACHMENT_CONFIRMED.

### Linhas 1005–1023

**O que faz.** Escolhe prompt do job ou fallback em português; fallback vazio gera log de erro sem expor o texto completo.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Garante que o fluxo não envie mensagem vazia e evita dados sensíveis no log.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — CG-25 verifica fallback e que o log expõe só `fallbackLength`.

### Linhas 1024–1057

**O que faz.** Re-resolve editor/editable vivo, emite `MANGA_TRANSLATOR_SET_PROMPT`, injeta prompt, valida comprimento >=5 e loga somente `promptLen`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Re-resolução reduz stale nodes; evento MAIN-world permite sincronização com integração externa. A assertion local impede seguir ao submit se a UI não refletiu texto.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no efeito — RPA confirma prompt/submit e redaction; ⚠️ retorno booleano de `setPromptInEditor` é ignorado e não testado isoladamente.

### Linhas 1058–1121

**O que faz.** Congela `ignoreImages` antes do submit, cria observer real antes de enviar, atualiza HUD/logs de candidato e no primeiro `generation_started` solicita uma única renovação de watchdog.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Instalar observer antes do submit fecha a janela de corrida para respostas muito rápidas. `watchdogRefreshRequested` impede heartbeat infinito e renova o prazo a partir do começo real da geração.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-08 verifica uma única renovação e ACK; E2E resposta rápida prova que resultado imediato não se perde; ownership E2E cobre aceitação/rejeição.

### Linhas 1122–1204

**O que faz.** Publica observer global da instância, chama `editorApi.submitWithConfirmation` com até 2 tentativas, troca para anti-throttle legacy só no retry, oferece fallback MAIN-world e converte ausência de confirmação em erro específico; restaura modo estável após sucesso.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Confirmação observável evita considerar clique/keypress como envio. Retry local não ativa tab nem usa antigo `DO_SEND_NOW`.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — `rpa-flow` CG-30/39 verifica fallback MAIN-world; E2E `submit ignorado` exige `GEMINI_SUBMISSION_NOT_CONFIRMED` em tempo curto; editor-submit testa colaborador.

### Linhas 1205–1231

**O que faz.** Mostra progresso, cria HUD manual, calcula quando conversa deve ser removida, escolhe timeout configurável (default 4 min) e inicia ticker de progresso de 5 s.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Timeout injetável acelera testes; ticker melhora observabilidade sem alterar lógica de conclusão.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no timeout — CG-36 injeta 80 ms e obtém `result_timeout`; ⚠️ contador/ticker em si não tem assertion.

### Linhas 1232–1281

**O que faz.** Espera resultado no observer; traduz `GEMINI_UI_ERROR` e `GEMINI_RESULT_TIMEOUT` em entrega de erro com eventual deleção segura e sempre limpa o progress timer.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Erros conhecidos viram estados controlados; erros desconhecidos sobem ao catch geral. `finally` do timer evita vazamento mesmo em rejeição.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — CG-27/35 e CG-36. Achado: a mensagem enviada no timeout diz literalmente `Tempo limite (4 min)` mesmo quando timeout configurado é diferente.

### Linhas 1282–1308

**O que faz.** Valida esquema do resultUrl (`http|blob|data:image`), loga metadados sanitizados e eleva URLs Google `=sN` para `=s0`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Bloqueia protocolos inesperados e solicita resolução original da CDN antes da extração.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — `resolution-elevation.test.js` valida `=s1024/=s512 → =s0` e uso no fluxo; RPA cobre URLs HTTP/blob.

### Linhas 1309–1342

**O que faz.** Delegação ao `resultExtractor.extractOrAuxiliaryFallback`; no fallback registra `GEMINI_RESULT_URL` e exige ACK `extractionRegistered` antes de considerar a aba auxiliar responsável.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O job Gemini permanece vivo até o background assumir explicitamente a extração; sem ACK, finalizar causaria perda de ownership.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no sucesso — CG-30/39 verifica `GEMINI_RESULT_URL`; ⚠️ `AUXILIARY_REGISTRATION_FAILED` não possui teste específico.

### Linhas 1343–1382

**O que faz.** Para resultado extraído em data URL, executa quarentena final comparando elemento/bytes/hash do input; bloqueia match exato, tolera falha de hashing não conclusiva e só então faz staging+commit.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É a última barreira contra substituir página pelo próprio input. Erro conclusivo é marcado `alreadyLogged` para evitar log duplicado.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-10 bloqueia match byte-a-byte e impede `GEMINI_IMAGE_EXTRACTED`; RUN-11 permite bytes diferentes; RUN-12–14 cobrem persistência/commit.

### Linhas 1383–1410

**O que faz.** Retorna status conforme extração direta/auxiliar; catch geral registra erro uma vez, envia `GEMINI_ERROR` com identidade completa do job/batch e retorna `{status:'error', error}`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Converter exceções em resultado controlado deixa o bootstrap decidir continuidade sem rejeição não tratada, enquanto background recebe falha associada ao job correto.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-03 e RUN-10/13 verificam status/código e mensagem `GEMINI_ERROR`; várias integrações exercitam.

### Linhas 1411–1443

**O que faz.** `finally` restaura anti-throttle mínimo, para observer, remove referência global, scroll/ticker externo, keepalive, HUD, listener manual e outlines restantes.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Cleanup é obrigatório porque content scripts e a página podem sobreviver a falhas. Sem ele haveria observer/timer/listener vazando para o próximo job.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE parcialmente — RUN-03 verifica closeKeepAlive; REG-12 verifica clearInterval. ⚠️ não há uma assertion única cobrindo todos os resíduos do finally.

### Linhas 1444–1467

**O que faz.** Expõe API do runner: `run` e helpers testáveis/compatíveis.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A superfície permite `content_gemini.js` reexportar helpers usados por suítes e compatibilidade sem duplicar implementação.

**Evidência de teste.** ✅/🟨 MISTO — vários helpers são chamados diretamente nos testes; outros apenas indiretamente.

### Linhas 1468–1471

**O que faz.** Publica `{createGeminiJobRunner}` em `scope.MangaTranslatorGeminiJobRunner` e em `module.exports` quando CommonJS.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Esse dual export é o elo entre a ordem de content scripts no Manifest e testes Node/Jest.

**Evidência de teste.** 🟦 GATE ESTÁTICO ESPECÍFICO + ✅ carga direta — Manifest lista `job-runner.js` antes de `content_gemini.js`; `job-runner.test.js` exige o módulo real.

### Linhas 1472

**O que faz.** Representa o newline final do arquivo.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Preservar newline final evita divergência byte-a-byte e mantém convenções POSIX/editoriais.

**Evidência de teste.** 🟦 GATE ESTÁTICO ESPECÍFICO — verificado pela leitura do blob; não é comportamento runtime.

## Invariantes

- O runner só recebe job já reivindicado; não deve implementar claim paralelo.
- Uma instância não deve executar dois jobs simultaneamente enquanto compartilhar `activeObserver`.
- Nunca enviar prompt antes de `attachmentResult.confirmed === true`.
- Instalar o observer antes do submit para não perder resultado de resposta rápida.
- Nunca considerar clique/keypress como prova de submit; exigir confirmação observável.
- Imagem estruturalmente pertencente ao input nunca pode virar resultado automático nem manual.
- Resultado direto deve ser persistido (`staged/persisted`) antes de `GEMINI_RESULT_COMMIT`.
- Retry de commit não deve reenviar a imagem já persistida.
- Fallback auxiliar só transfere ownership após `extractionRegistered === true`.
- IDs `jobId`, `batchId`, `mangaTabId` e `index` devem acompanhar todas as mensagens que finalizam/erram o job.
- Logs não devem expor prompt completo, URL assinada completa ou bytes da imagem.
- Timers, observer, keepalive, HUD e listeners manuais devem ser removidos no término, inclusive por erro.
- Anti-throttle deve terminar em `minimal` no `finally`.
- Falha de hash de quarentena não pode desativar o filtro estrutural; match exato conclusivo deve bloquear entrega.
- Em modos destrutivos, entrega de erro deve respeitar a política de exclusão/recovery e exceção explícita de debug.

## Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `waitForStableComposer` — falta teste que mantenha composer instável até expirar e afirme `GEMINI_COMPOSER_NOT_READY`; uma regressão poderia voltar a aceitar nó stale.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `storageGet` — falta teste de exceção/`runtime.lastError`; hoje erro do storage é silenciosamente convertido em defaults.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `requestImageData` — falta assertion específica de exatamente 5 tentativas e intervalos quando nenhuma resposta contém `srcData`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `setPromptInEditor` — não há teste unitário da matriz Quill / replaceChildren / fallback manual / value; hoje a cobertura forte é pelo efeito integrado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `RESULT_COMMIT_FAILED` — RUN-14 cobre sucesso na terceira tentativa, mas não o caso de três falhas e o código final.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `AUXILIARY_REGISTRATION_FAILED` — o sucesso do fallback por URL é provado, mas ACK inválido/ausente não tem teste dedicado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `attachmentSnapshot` — logs do gate são cobertos, mas contagens `fileInputs/imageInputs/previewCount` não são verificadas diretamente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `queryAllDeep`/`collectOpenShadowRoots` — os caminhos normais de Shadow DOM são provados; os catches de seletor inválido/erro do helper não.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `finally` — há provas parciais de keepalive e interval, porém não uma prova única de observer global, HUD, listener manual e outlines após toda classe de falha.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** Timeout configurável — `run` envia texto de erro `Tempo limite (4 min)` mesmo quando `__MT_GEMINI_GENERATION_TIMEOUT_MS__` altera o prazo; falta teste que exija mensagem coerente com o valor real.

## Análise crítica

| Severidade | Achado | Consequência |
|---|---|---|
| Médio | Mensagem de timeout potencialmente enganosa | Linhas 1217–1221 permitem timeout customizado, mas 1270 fixa `Tempo limite (4 min)`. Em teste/diagnóstico ou configuração futura, o texto pode não representar o prazo real. |
| Médio | Estado `activeObserver` pressupõe execução serial | A variável é por instância, não por job. Se `run` for chamado em paralelo na mesma instância, observer/cleanup de um job pode interferir no outro. A arquitetura de claim hoje evita isso; o runner não impõe a invariante. |
| Baixo/Médio | `setPromptInEditor` depende de detalhes de framework | A função tenta Quill e também muta DOM/dispara eventos; o `beforeinput` é disparado depois da mutação. Mudanças no Gemini podem exigir ajuste e faltam testes unitários por estratégia. |
| Baixo | Tratamento de storage pouco observável | `storageGet` converte exceção em `{}` e não registra `runtime.lastError`, podendo mascarar falha de storage como configuração ausente. |
| Baixo | Condição redundante na heurística de imagem | Após `if (width <= 0 || height <= 0) return false`, a condição `image.complete === false && height <= 0` não consegue ser verdadeira no fluxo restante. Não causa bug funcional, mas é dívida/ruído. |

Nenhum desses achados foi corrigido nesta tarefa porque o escopo é documentação. O ponto mais importante para manutenção é preservar a ordem **attachment confirmado → observer instalado → submit confirmado → resultado validado → staging persistido → commit**.

## Autoauditoria mecânica

Validação adicional executada sobre a Bíblia materializada antes da aprovação global:

- **SHA declarado:** `1b16fd656e82e64ef2d26977e061f87e469aa3ff`, igual ao blob atual de `extension/content/gemini/job-runner.js`.
- **Fonte integral:** extraída do bloco `Fonte integral auditada` e comparada com o fonte; conteúdo idêntico.
- **Posições da fonte:** **1472**.
- **Headings `Linha N`:** **1472**, sequência estrita de 1 a 1472, sem lacunas nem sobreposição.
- **Campos `Fonte`:** **1472/1472** conferidos contra a posição correspondente do arquivo real.
- **Campos obrigatórios por posição:** `Fonte`, `O que faz`, `Como faz`, `Por que foi implementado dessa forma` e `Por que uma implementação ingênua seria pior` presentes em todos os 1472 blocos.
- **Boilerplate proibido pelo gate:** nenhum dos padrões explicitamente rejeitados por `verify-repository-structure.js` foi encontrado fora do bloco de fonte integral.
- **Testes:** a classificação decorre da leitura dos arquivos e assertions citados; esta tarefa documental não afirma que as suítes foram executadas nesta sessão.

## Checklist de conclusão desta Bíblia

- [x] Identidade, SHA, tipo, linhas e agente registrados.
- [x] Papel arquitetural e consumidor direto documentados.
- [x] Dependências, mensagens, dados e side effects documentados.
- [x] Arquitetura MV3/lifecycle discutida.
- [x] Segurança, privacidade e ownership discutidos.
- [x] Evidências automatizadas classificadas sem confundir ocorrência com assertion.
- [x] Lacunas específicas registradas.
- [x] Invariantes registradas.
- [x] Cobertura 0001–1472 sem faixas omitidas.
- [x] Fonte integral abaixo, sem `...`, sem trecho omitido.

## Fonte integral auditada

```javascript
'use strict';
// gemini/job-runner.js — orquestração de um job Gemini já reivindicado.
//
// Este módulo recebe dependências explicitamente. Ele não faz claim e não abre
// automação por conta própria: content_gemini.js continua responsável por
// bootstrap/claim/keepalive/message handlers.

(function(scope) {
  let imageQuarantineApi = scope.MangaTranslatorGeminiImageQuarantine || null;
  if (!imageQuarantineApi && typeof require === 'function') {
    try { imageQuarantineApi = require('./image-quarantine.js'); } catch (_e) {}
  }

  function createGeminiJobRunner({
    root = scope.document || null,
    pageWindow = scope.window || null,
    runtime = scope.chrome?.runtime || null,
    storage = scope.chrome?.storage?.local || null,
    domApi = scope.MangaTranslatorGeminiDom,
    imageQuarantine = imageQuarantineApi?.createImageQuarantine?.({ dom: domApi }),
    observerApi = scope.MangaTranslatorGeminiObserver,
    editorApi = scope.MangaTranslatorGeminiEditor,
    attachmentApi = scope.MangaTranslatorGeminiAttachment,
    temporaryChatApi = scope.MangaTranslatorGeminiTemporaryChat,
    resultExtractor = null,
    deletionController = null,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    sendLog = function() {},
    getUrlLogMetadata = () => ({}),
    debugConsole = function() {},
    reportProgress = function() {},
    openKeepAlive = function() {},
    closeKeepAlive = function() {},
    FileImpl = scope.File,
    DataUrlAtob = scope.atob ? scope.atob.bind(scope) : null,
    setIntervalFn = scope.setInterval ? scope.setInterval.bind(scope) : setInterval,
    clearIntervalFn = scope.clearInterval ? scope.clearInterval.bind(scope) : clearInterval,
  } = {}) {
    if (!root || !pageWindow || !runtime || !storage) {
      throw new Error('JobRunner requer document/window/runtime/storage');
    }
    if (!domApi || !imageQuarantine || !observerApi || !editorApi || !attachmentApi || !temporaryChatApi) {
      throw new Error('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');
    }
    if (!resultExtractor || !deletionController) {
      throw new Error('JobRunner requer resultExtractor e deletionController');
    }

    let activeObserver = null;

    function getAntiThrottleModeForExecutionMode(executionMode) {
      return executionMode === 'minimized_window' || executionMode === 'background_delete'
        ? 'balanced'
        : 'minimal';
    }

    function setAntiThrottleMode(mode) {
      const normalized = ['minimal', 'balanced', 'legacy'].includes(mode)
        ? mode
        : 'minimal';
      const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;
      if (typeof CustomEventImpl !== 'function' || typeof pageWindow.dispatchEvent !== 'function') {
        return normalized;
      }

      try {
        pageWindow.dispatchEvent(new CustomEventImpl(
          'MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE',
          { detail: { mode: normalized } }
        ));
      } catch (_e) {}
      return normalized;
    }

    function storageGet(keys) {
      return new Promise(resolve => {
        try {
          storage.get(keys, data => resolve(data || {}));
        } catch (_e) {
          resolve({});
        }
      });
    }

    function selectLiveComposer() {
      const all = domApi.findAllDeep(root.body || root.documentElement || root, element =>
        element.matches?.('[contenteditable="true"]') && element.isConnected !== false &&
        domApi.isElementVisible(element) && element.getAttribute('aria-disabled') !== 'true' &&
        !element.closest?.('[data-message-author], [data-turn-role], model-response, .user-query-container')
      );
      const editable = all.find(element => element.closest?.('rich-textarea, .input-area, .chat-input-container, input-area')) || all[0];
      if (!editable) return null;
      let composer = editable;
      for (let current = editable; current; current = current.parentElement || current.getRootNode?.().host) {
        if (current.matches?.('rich-textarea, .input-area, .chat-input-container, input-area')) { composer = current; break; }
      }
      if ([editable, composer].some(element => element.disabled === true || element.getAttribute?.('aria-disabled') === 'true')) return null;
      return { editor: editable, composer };
    }

    async function waitForStableComposer(timeoutMs = 12_000) {
      const started = Date.now();
      let previousEditor = null, previousComposer = null, stableSince = 0;
      while (Date.now() - started < timeoutMs) {
        const current = selectLiveComposer();
        if (current && current.editor === previousEditor && current.composer === previousComposer) {
          if (Date.now() - stableSince >= 750 && Date.now() - started >= 1500) return current;
        } else {
          previousEditor = current?.editor || null;
          previousComposer = current?.composer || null;
          stableSince = Date.now();
        }
        await sleep(250);
      }
      const error = new Error('Editor editável do Gemini não estabilizou em 12s; envio bloqueado.');
      error.code = 'GEMINI_COMPOSER_NOT_READY';
      throw error;
    }

    function attachmentSnapshot() {
      const current = selectLiveComposer();
      const searchRoot = root.body || root.documentElement || root;
      return {
        editorConnected: current?.editor.isConnected === true,
        composerTag: current?.composer.tagName?.toLowerCase() || null,
        fileInputs: domApi.findAllDeep(searchRoot, element => element.matches?.('input[type="file"]')).length,
        imageInputs: attachmentApi.findFileInputsDeep(searchRoot).length,
        previewCount: attachmentApi.listAttachmentEvidence(root).length,
      };
    }

    function dataURLtoFile(dataurl, filename) {
      const raw = String(dataurl || '');
      const commaIndex = raw.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('dataURL malformada: sem vírgula separadora');
      }

      const header = raw.slice(0, commaIndex);
      const mimeMatch = header.match(/:(.*?);/);
      if (!mimeMatch || !mimeMatch[1]) {
        throw new Error('dataURL malformada: MIME não encontrado');
      }
      if (typeof DataUrlAtob !== 'function' || typeof FileImpl !== 'function') {
        throw new Error('APIs de arquivo indisponíveis');
      }

      const binary = DataUrlAtob(raw.slice(commaIndex + 1));
      let length = binary.length;
      const bytes = new Uint8Array(length);
      while (length--) bytes[length] = binary.charCodeAt(length);
      return new FileImpl([bytes], filename, { type: mimeMatch[1] });
    }

    function queryAllDeep(selector, base = root) {
      if (!base || !selector) return [];
      const searchRoot = base.body || base.documentElement || base;

      if (typeof domApi.findAllDeep === 'function') {
        try {
          const matches = domApi.findAllDeep(searchRoot, element => {
            if (!element || element.nodeType !== 1 || typeof element.matches !== 'function') {
              return false;
            }
            try { return element.matches(selector); } catch (_e) { return false; }
          });
          if (matches.length) return matches;
        } catch (_e) {}
      }

      try { return Array.from(base.querySelectorAll?.(selector) || []); } catch (_e) { return []; }
    }

    function queryFirstDeep(selector, base = root) {
      const matches = queryAllDeep(selector, base);
      return matches.length ? matches[0] : null;
    }

    function collectOpenShadowRoots(base = root) {
      if (!base || typeof domApi.findAllDeep !== 'function') return [];
      const searchRoot = base.body || base.documentElement || base;
      try {
        return domApi.findAllDeep(searchRoot, element => Boolean(element?.shadowRoot))
          .map(element => element.shadowRoot)
          .filter(Boolean);
      } catch (_e) {
        return [];
      }
    }

    function waitForElement(selector, timeout = 20_000) {
      const existing = queryFirstDeep(selector);
      if (existing) return Promise.resolve(existing);

      const MutationObserverImpl = scope.MutationObserver || pageWindow.MutationObserver;
      if (typeof MutationObserverImpl !== 'function') {
        return Promise.resolve(null);
      }

      return new Promise(resolve => {
        let timer = null;
        let observer = null;
        let settled = false;
        const observedRoots = new WeakSet();

        const finish = element => {
          if (settled) return;
          settled = true;
          if (timer !== null) {
            try { scope.clearTimeout(timer); } catch (_e) {}
          }
          if (observer) {
            try { observer.disconnect(); } catch (_e) {}
          }
          resolve(element || null);
        };

        const observeTarget = target => {
          if (!observer || !target || observedRoots.has(target)) return;
          try {
            observer.observe(target, { childList: true, subtree: true });
            observedRoots.add(target);
          } catch (_e) {}
        };

        const observeDeepRoots = () => {
          observeTarget(root.body || root.documentElement || root);
          for (const shadowRoot of collectOpenShadowRoots()) observeTarget(shadowRoot);
        };

        timer = scope.setTimeout(
          () => finish(queryFirstDeep(selector)),
          timeout
        );

        observer = new MutationObserverImpl(() => {
          observeDeepRoots();
          const element = queryFirstDeep(selector);
          if (element) finish(element);
        });

        observeDeepRoots();
      });
    }

    function getImageSource(image) {
      return domApi.getImageSource(image);
    }

    function isIgnoredGeminiImageSource(src) {
      return domApi.isIgnoredGeminiImageSource(src);
    }

    function isModelResponseImage(image) {
      return domApi.isModelResponseImage(image);
    }

    function tryClickModelImageCards() {
      const selectors = [
        'model-response button[aria-label*="imagem" i]',
        'model-response button[aria-label*="image" i]',
        'model-response .image-card',
        'model-response [data-test-id*="image"]',
        'model-response [data-test-id*="generated-image"]',
        'model-response img',
        '[data-message-author="model"] button[aria-label*="imagem" i]',
        '[data-message-author="model"] [data-test-id*="image"]',
        '[data-message-author="model"] img',
      ];

      for (const selector of selectors) {
        const element = queryFirstDeep(selector);
        if (!element) continue;
        const target = element.closest?.('button, [role="button"]') || element;
        try {
          target.click();
          return true;
        } catch (_e) {}
      }
      return false;
    }

    function isLikelyGeneratedImage(image, ignoreImages = new Set()) {
      if (imageQuarantine.isStructurallyInput(image)) return false;
      const src = getImageSource(image);
      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;

      if (isModelResponseImage(image)) return true;

      if (
        src.includes('gemini-result-image') ||
        src.includes('googleusercontent.com/gg-dl/') ||
        src.startsWith('blob:https://gemini.google.com/') ||
        src.startsWith('blob:http://127.0.0.1/')
      ) {
        return true;
      }

      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;

      if (
        src.includes('googleusercontent.com') &&
        !isIgnoredGeminiImageSource(src) &&
        width <= 0 &&
        height <= 0
      ) {
        return true;
      }

      if (width <= 0 || height <= 0) return false;
      if (image.complete === false && height <= 0) return false;

      const maxSide = Math.max(width, height);
      const minSide = Math.min(width, height);
      const area = width * height;
      return maxSide >= 256 && minSide >= 40 && area >= 12_000;
    }

    function isManualSelectableImage(image, ignoreImages = new Set()) {
      if (imageQuarantine.isStructurallyInput(image)) return false;
      const src = getImageSource(image);
      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      return width > 0 && height > 0 && Math.max(width, height) >= 40;
    }

    function findGeneratedResultImages(ignoreImages = new Set()) {
      const images = domApi.findAllDeep(
        root.body || root.documentElement,
        element => String(element.tagName || '').toUpperCase() === 'IMG'
      );

      images.forEach(image => {
        if (image.getAttribute?.('loading') === 'lazy') {
          image.removeAttribute('loading');
          image.setAttribute('loading', 'eager');
        }
        if (image.dataset?.src) image.src = image.dataset.src;
      });

      return images.filter(image => isLikelyGeneratedImage(image, ignoreImages));
    }

    function setManualGeminiResultUrl(url, source = 'manual') {
      pageWindow.__mangaTranslatorManualGeminiResultUrl = url;

      const observer = activeObserver || pageWindow.__mangaTranslatorActiveGeminiObserver;
      if (observer && typeof observer.acceptResult === 'function') {
        observer.acceptResult(null, url);
      }

      const status = root.getElementById('mt-gemini-assist-status');
      if (status) {
        status.textContent = 'Imagem marcada. A extensão vai usar esse resultado.';
      }

      sendLog(
        'info',
        'GEMINI_MANUAL_RESULT',
        'Imagem marcada manualmente no Gemini',
        { source, ...getUrlLogMetadata(url) }
      );
    }

    function removeGeminiManualPanel() {
      const existing = root.getElementById('mt-gemini-assist');
      if (existing) existing.remove();

      if (pageWindow.__mangaTranslatorManualPickHandler) {
        root.removeEventListener(
          'click',
          pageWindow.__mangaTranslatorManualPickHandler,
          true
        );
        pageWindow.__mangaTranslatorManualPickHandler = null;
      }

      queryAllDeep('[data-mt-gemini-pickable="true"]').forEach(image => {
        image.style.outline = '';
        image.style.outlineOffset = '';
        image.removeAttribute('data-mt-gemini-pickable');
      });
    }

    function createGeminiManualPanel(job, getIgnoreImages) {
      removeGeminiManualPanel();
      pageWindow.__mangaTranslatorManualGeminiResultUrl = '';

      const logManualIntervention = source => {
        sendLog(
          'error',
          'GEMINI_MANUAL_INTERVENTION_REQUIRED',
          'ERRO GRAVE: a detecção automática falhou e o usuário precisou interagir manualmente com o resultado do Gemini.',
          {
            source,
            index: job?.index,
            executionMode: job?.executionMode,
            jobIdPrefix: String(job?.jobId || '').slice(0, 8),
          }
        );
      };

      const panel = root.createElement('div');
      panel.id = 'mt-gemini-assist';
      panel.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'width:260px',
        'background:#111',
        'color:#fff',
        'border:1px solid #333',
        'border-radius:8px',
        'box-shadow:0 10px 28px rgba(0,0,0,0.45)',
        'font-family:Arial,sans-serif',
        'font-size:12px',
        'padding:12px',
        'line-height:1.35',
      ].join(';');

      panel.innerHTML = [
        '<div style="font-weight:700;margin-bottom:4px;">Manga Translator</div>',
        '<div id="mt-gemini-assist-description" style="color:#aaa;margin-bottom:8px;"></div>',
        '<div style="display:flex;gap:6px;margin-bottom:8px;">',
        '<button id="mt-gemini-use-last" style="flex:1;background:#FF4444;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Usar última</button>',
        '<button id="mt-gemini-pick" style="flex:1;background:#2b5f9c;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Selecionar</button>',
        '</div>',
        '<div id="mt-gemini-assist-status" style="color:#888;">Aguardando imagem gerada.</div>',
      ].join('');

      const imageNumber = Number.isFinite(Number(job.index))
        ? Number(job.index) + 1
        : 1;
      panel.querySelector('#mt-gemini-assist-description').textContent =
        `Imagem ${imageNumber}: marque o resultado correto se a detecção automática não pegar.`;

      panel.addEventListener('click', event => event.stopPropagation());
      root.documentElement.appendChild(panel);

      panel.querySelector('#mt-gemini-use-last').addEventListener('click', () => {
        logManualIntervention('last-button');
        const images = findGeneratedResultImages(getIgnoreImages());
        const candidate = images[images.length - 1];
        if (candidate) {
          setManualGeminiResultUrl(getImageSource(candidate), 'last-button');
        } else {
          panel.querySelector('#mt-gemini-assist-status').textContent =
            'Ainda não encontrei uma imagem candidata.';
        }
      });

      panel.querySelector('#mt-gemini-pick').addEventListener('click', () => {
        logManualIntervention('pick-button');
        const status = panel.querySelector('#mt-gemini-assist-status');
        status.textContent = 'Clique diretamente na imagem correta gerada pelo Gemini.';

        queryAllDeep('img').forEach(image => {
          if (!isManualSelectableImage(image, getIgnoreImages())) return;
          image.dataset.mtGeminiPickable = 'true';
          image.style.outline = '3px solid #FF4444';
          image.style.outlineOffset = '2px';
        });

        if (pageWindow.__mangaTranslatorManualPickHandler) {
          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
        }

        pageWindow.__mangaTranslatorManualPickHandler = event => {
          const composedImage = event.composedPath?.().find(node =>
            String(node?.tagName || '').toUpperCase() === 'IMG'
          );
          const image = composedImage || event.target?.closest?.('img');
          if (!image || !isManualSelectableImage(image, getIgnoreImages())) return;

          event.preventDefault();
          event.stopPropagation();
          setManualGeminiResultUrl(getImageSource(image), 'image-click');

          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
          pageWindow.__mangaTranslatorManualPickHandler = null;

          root.querySelectorAll('[data-mt-gemini-pickable="true"]').forEach(candidate => {
            candidate.style.outline = '';
            candidate.style.outlineOffset = '';
            candidate.removeAttribute('data-mt-gemini-pickable');
          });
        };

        root.addEventListener(
          'click',
          pageWindow.__mangaTranslatorManualPickHandler,
          true
        );
      });

      return panel;
    }

    function setPromptInEditor(currentEditable, currentEditor, actualPrompt) {
      if (!currentEditable) return false;

      const prompt = String(actualPrompt || '');
      const existing = String(currentEditable.textContent || '').trim();
      if (existing === prompt.trim()) return true;

      try { currentEditable.focus?.(); } catch (_e) {}
      if (currentEditor && currentEditor !== currentEditable) {
        try { currentEditor.focus?.(); } catch (_e) {}
      }

      const FocusEventImpl = scope.FocusEvent || scope.Event;
      try {
        currentEditable.dispatchEvent(new FocusEventImpl('focus', {
          bubbles: true,
          composed: true,
        }));
        currentEditable.dispatchEvent(new FocusEventImpl('focusin', {
          bubbles: true,
          composed: true,
        }));
      } catch (_e) {}

      const quill = currentEditable.__quill ||
        currentEditor?.__quill ||
        (pageWindow.Quill &&
          typeof pageWindow.Quill.find === 'function' &&
          (pageWindow.Quill.find(currentEditable) || pageWindow.Quill.find(currentEditor)));

      if (quill) {
        try {
          if (typeof quill.setText === 'function') quill.setText(prompt, 'user');
          if (typeof quill.update === 'function') quill.update('user');
        } catch (_e) {}
      }

      const paragraph = root.createElement('p');
      paragraph.textContent = prompt;
      if (typeof currentEditable.replaceChildren === 'function') {
        currentEditable.replaceChildren(paragraph);
      } else {
        while (currentEditable.firstChild) {
          currentEditable.removeChild(currentEditable.firstChild);
        }
        currentEditable.appendChild(paragraph);
      }

      const InputEventImpl = scope.InputEvent || scope.Event;
      try {
        currentEditable.dispatchEvent(new InputEventImpl('beforeinput', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: 'insertText',
          data: prompt,
        }));
        currentEditable.dispatchEvent(new InputEventImpl('input', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: 'insertText',
          data: prompt,
        }));
        currentEditable.dispatchEvent(new scope.Event('input', {
          bubbles: true,
          composed: true,
        }));
        currentEditable.dispatchEvent(new scope.Event('change', {
          bubbles: true,
          composed: true,
        }));
      } catch (_e) {}

      if (currentEditor && 'value' in currentEditor) {
        try { currentEditor.value = prompt; } catch (_e) {}
        try {
          currentEditor.dispatchEvent(new scope.Event('input', {
            bubbles: true,
            composed: true,
          }));
        } catch (_e) {}
      }

      return String(currentEditable.textContent || '').trim().length >= 5;
    }

    async function shouldKeepConversationForDebug(delivery, executionMode) {
      if (
        executionMode !== 'background_delete' ||
        !delivery ||
        delivery.action !== 'GEMINI_ERROR'
      ) {
        return false;
      }
      const data = await storageGet(['debugMode']);
      return data.debugMode === true;
    }

    function sendRuntimeMessage(message) {
      return new Promise(resolve => {
        try {
          runtime.sendMessage(message, response => {
            if (runtime.lastError) resolve(null);
            else resolve(response || null);
          });
        } catch (_e) {
          resolve(null);
        }
      });
    }

    async function requestImageData(job) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await sendRuntimeMessage({
          action: 'REQUEST_IMAGE_DATA',
          mangaTabId: job.mangaTabId,
          index: job.index,
        });
        if (response?.srcData) return response;
        await sleep(1000);
      }
      return null;
    }

    function assertStage(condition, errorMessage, step, successMessage = '') {
      if (!condition) {
        const fullError = `[ERRO CRÍTICO - ETAPA ${step}] ${errorMessage}`;
        debugConsole('error', fullError);
        sendLog(
          'error',
          `TEST_FAIL_STEP_${step}`,
          errorMessage,
          { path: pageWindow.location.pathname }
        );
        throw new Error(fullError);
      }

      sendLog(
        'success',
        `TEST_PASS_STEP_${step}`,
        successMessage || `Etapa ${step} com sucesso`,
        { path: pageWindow.location.pathname }
      );
    }

    async function run(job) {
      if (!job) throw new Error('Job Gemini é obrigatório');

      setAntiThrottleMode('minimal');
      const myTabId = job.geminiTabId;
      let watchdogRefreshRequested = false;
      const recoveryResult = await deletionController.recoverPending({
        tabId: myTabId,
        sendDelivery: async delivery => {
          runtime.sendMessage(delivery);
        },
      });
      if (recoveryResult.handled) {
        return { status: 'recovery_handled', deleted: recoveryResult.deleted };
      }

      openKeepAlive();

      debugConsole('log', '[MangaTranslator Gemini] Job confirmado por claim:', {
        jobId: String(job.jobId || '').slice(0, 8),
        index: job.index,
        geminiTabId: myTabId,
      });

      let scrollInterval = null;
      let executionMode = job.executionMode || null;
      let inputImageHash = null;

      const startScrollAssist = () => {
        scrollInterval = setIntervalFn(() => {
          try {
            pageWindow.scrollTo(0, root.body.scrollHeight);
            const images = root.querySelectorAll('img');
            if (images.length > 0) {
              images[images.length - 1].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }
          } catch (_e) {}
        }, 2000);
      };

      const stopScrollAssist = () => {
        if (scrollInterval !== null) {
          try { clearIntervalFn(scrollInterval); } catch (_e) {}
          scrollInterval = null;
        }
      };

      async function deliverWithSecureDeletion(delivery, shouldDeleteConversation) {
        if (executionMode !== 'background_delete' && executionMode !== 'minimized_window') {
          if (shouldDeleteConversation) {
            deletionController.deleteCurrentConversation().catch(() => {});
          }
          runtime.sendMessage(delivery);
          return true;
        }

        if (await shouldKeepConversationForDebug(delivery, executionMode)) {
          sendLog(
            'info',
            'DEBUG_KEEP_CONVERSATION',
            'Modo debug: conversa preservada após erro de extração.',
            {}
          );
          runtime.sendMessage(delivery);
          return true;
        }

        stopScrollAssist();
        sendLog('info', 'GEMINI_DELETE_BEFORE_DELIVERY', 'Aguardando exclusão antes de finalizar o job', {
          executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
        });
        const deletion = await deletionController.deleteOrScheduleRecovery({
          tabId: myTabId,
          delivery,
        });

        if (deletion.deleted) {
          runtime.sendMessage(delivery);
          return true;
        }
        return false;
      }

      function sendRuntimeMessageAsync(message) {
        return new Promise(resolve => {
          try {
            runtime.sendMessage(message, response => {
              const lastError = runtime.lastError;
              if (lastError) {
                resolve({ ok: false, reason: lastError.message || 'runtime_error' });
                return;
              }
              resolve(response || { ok: false, reason: 'empty_response' });
            });
          } catch (error) {
            resolve({ ok: false, reason: error?.message || 'send_exception' });
          }
        });
      }

      async function stageAndCommitResult(delivery) {
        const staged = await sendRuntimeMessageAsync(delivery);
        if (!staged?.ok || staged.staged !== true || staged.persisted === false) {
          const error = new Error(`Resultado não foi persistido no leitor: ${staged?.reason || 'stage_failed'}`);
          error.code = 'RESULT_STAGE_FAILED';
          throw error;
        }

        sendLog('success', 'GEMINI_RESULT_STAGED',
          'Resultado persistido no leitor antes da exclusão/finalização do Gemini.', {
            executionMode,
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
            batchIdPrefix: String(job.batchId || '').slice(0, 8),
          });

        const commitMessage = {
          action: 'GEMINI_RESULT_COMMIT',
          mangaTabId: job.mangaTabId,
          index: job.index,
          jobId: job.jobId,
          batchId: job.batchId,
        };

        let committed = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          committed = await sendRuntimeMessageAsync(commitMessage);
          if (committed?.ok && committed.committed === true) break;
          sendLog('warn', 'GEMINI_RESULT_COMMIT_RETRY',
            'Commit pós-persistência não confirmou; repetindo sem reenviar a imagem.', {
              attempt,
              reason: committed?.reason || committed?.error?.code || 'no_ack',
              jobIdPrefix: String(job.jobId || '').slice(0, 8),
            });
          if (attempt < 3) await sleep(250 * attempt);
        }

        if (!committed?.ok || committed.committed !== true) {
          const error = new Error(`Resultado persistido, mas o commit do job falhou: ${committed?.reason || 'commit_failed'}`);
          error.code = 'RESULT_COMMIT_FAILED';
          throw error;
        }

        sendLog('success', 'GEMINI_RESULT_COMMITTED',
          'Background confirmou a finalização somente depois da persistência.', {
            executionMode,
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
            batchIdPrefix: String(job.batchId || '').slice(0, 8),
          });
        return true;
      }

      startScrollAssist();

      try {
        reportProgress('📡 OBTENDO IMAGEM...', job.mangaTabId);
        debugConsole(
          'log',
          '[MangaTranslator Gemini] Obtendo imagem da aba do mangá...',
          { index: job.index }
        );
        sendLog('info', 'GEMINI_STEP_1', 'Obtendo imagem', { index: job.index });

        const imageResponse = await requestImageData(job);
        assertStage(
          imageResponse && imageResponse.srcData,
          'Sem resposta da aba do mangá.',
          1,
          'Resposta inicial carregada com sucesso.'
        );
        assertStage(
          String(imageResponse.srcData).startsWith('data:image/'),
          'Os dados não são imagem válida.',
          1,
          'Base64 validada.'
        );
        job.srcData = imageResponse.srcData;
        try {
          inputImageHash = await imageQuarantine.computeExactHash(job.srcData);
          sendLog(
            'info',
            'GEMINI_INPUT_QUARANTINE_READY',
            'Assinatura exata da imagem de entrada calculada',
            { algorithm: 'SHA-256' }
          );
        } catch (hashError) {
          sendLog(
            'warn',
            'GEMINI_QUARANTINE_HASH_UNAVAILABLE',
            'Não foi possível calcular a assinatura inicial; o filtro estrutural permanece ativo',
            { messageLength: String(hashError?.message || '').length }
          );
        }

        reportProgress('⏳ AGUARDANDO INTERFACE...', job.mangaTabId);
        debugConsole('log', '[MangaTranslator Gemini] Aguardando interface do Gemini...');

        const editor = await waitForElement(
          'rich-textarea, .ql-editor, [contenteditable="true"]',
          20_000
        );
        assertStage(editor !== null, 'Editor não carregou.', 2, 'Editor alvo detectado');
        assertStage(
          editor.disabled !== true && editor.getAttribute?.('aria-disabled') !== 'true',
          'Editor do Gemini está desabilitado.',
          2,
          'Editor habilitado'
        );

        try {
          editor.focus?.({ preventScroll: true });
          const FocusEventImpl = scope.FocusEvent || scope.Event;
          editor.dispatchEvent(new FocusEventImpl('focus', {
            bubbles: true,
            composed: true,
          }));
          editor.dispatchEvent(new FocusEventImpl('focusin', {
            bubbles: true,
            composed: true,
          }));
          pageWindow.dispatchEvent(new scope.Event('focus'));
        } catch (_e) {}

        if (!executionMode) {
          const data = await storageGet(['geminiExecutionMode']);
          executionMode = data.geminiExecutionMode || 'temp_chat';
        }

        const steadyAntiThrottleMode = getAntiThrottleModeForExecutionMode(executionMode);
        setAntiThrottleMode(steadyAntiThrottleMode);

        let tempChatResult = { success: false };
        if (executionMode === 'temp_chat') {
          reportProgress('🔒 ATIVANDO CONVERSA TEMPORÁRIA...', job.mangaTabId);
          debugConsole('log', '[MangaTranslator Gemini] Ativando conversa temporária...');
          sendLog(
            'info',
            'GEMINI_STEP_TEMP_CHAT',
            'Ativando conversa temporária no Gemini',
            {}
          );

          try {
            const tempStatus = await temporaryChatApi.ensureActive({
              root,
              timeoutMs: 12_000,
              sleep,
            });

            tempChatResult = {
              success:
                tempStatus.status === 'already_active' ||
                tempStatus.status === 'activated_verified',
              alreadyActive: tempStatus.status === 'already_active',
              activated: tempStatus.status === 'activated_verified',
              notFound: tempStatus.status === 'unavailable',
              verificationFailed: tempStatus.status === 'verification_failed',
              status: tempStatus.status,
            };

            sendLog(
              'info',
              'GEMINI_TEMP_CHAT_STATUS',
              'Status da conversa temporária',
              { status: tempStatus.status }
            );

            if (
              tempStatus.status === 'activated_verified' ||
              tempStatus.status === 'already_active'
            ) {
              await sleep(1500);
            } else if (tempStatus.status === 'verification_failed') {
              sendLog(
                'warn',
                'GEMINI_TEMP_CHAT_VERIFY_FAILED',
                'Clique não confirmou ativação da conversa temporária',
                {}
              );
            }
          } catch (error) {
            debugConsole(
              'warn',
              '[MangaTranslator Gemini] Aviso ao ativar conversa temporária:',
              error && error.message
            );
            sendLog(
              'warn',
              'GEMINI_TEMP_CHAT_ERR',
              `Aviso ao ativar conversa temporária: ${error.message}`,
              {}
            );
          }
        }

        // O aparecimento do wrapper não comprova que o editor esteja hidratado.
        // A seleção é renovada entre métodos; nunca reutiliza nó desconectado.
        let stableComposer = await waitForStableComposer();
        const liveEditor = stableComposer.composer;
        const liveEditable = stableComposer.editor;
        reportProgress('📎 ANEXANDO IMAGEM...', job.mangaTabId);
        const file = dataURLtoFile(job.srcData, 'manga_page.png');
        assertStage(file.size > 0, 'Imagem gerada vazia.', 3, 'PNG verificado no buffer');
        let attachmentResult;
        try {
          // Variante 01 mantém a aba/janela no contexto original.
          sendLog('info', 'GEMINI_ATTACHMENT_CONTEXT', 'Contexto antes do upload', {
            variant: 'MT-UNICO-01', executionMode, ...attachmentSnapshot(),
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
          });
          sendLog('info', 'ATTACHMENT_STARTED', 'Handshake de anexo iniciado', {
            variant: 'MT-UNICO-01', executionMode,
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
          });
          attachmentResult = await attachmentApi.attachFile({
            file, editor: stableComposer.editor, editorRoot: stableComposer.composer, root,
            getEditor: () => selectLiveComposer()?.editor || null,
            getEditorRoot: () => selectLiveComposer()?.composer || null,
            timeoutMs: 20_000, retryAfterMs: 3500, maxDispatches: 3, sleep,
            // Eventos de upload continuam no content script.
            onAttempt: detail => sendLog('info', 'GEMINI_ATTACHMENT_METHOD', 'Método de upload observado', {
              variant: 'MT-UNICO-01', executionMode, ...detail, ...attachmentSnapshot(),
              jobIdPrefix: String(job.jobId || '').slice(0, 8),
            }),
          });
        } finally {
          // Nenhum contexto físico foi alterado nesta variante.
        }
        const uploadMeta = {
          variant: 'MT-UNICO-01', executionMode,
          methodsAttempted: attachmentResult.methodsAttempted,
          signalObserved: attachmentResult.signalObserved,
          evidenceType: attachmentResult.evidence?.type || null,
          ...attachmentSnapshot(),
        };
        if (!attachmentResult.confirmed) {
          sendLog('error', 'GEMINI_ATTACHMENT_NOT_CONFIRMED', 'Anexo não confirmou em 20s; prompt não enviado', uploadMeta);
          sendLog('error', 'ATTACHMENT_REJECTED', 'Handshake de anexo rejeitado', uploadMeta);
          sendLog('error', 'SUBMIT_BLOCKED_ATTACHMENT', 'Envio bloqueado: anexo não confirmado', uploadMeta);
          const attachmentError = new Error('Anexo não confirmado em 20s; prompt não enviado.');
          attachmentError.code = 'GEMINI_ATTACHMENT_NOT_CONFIRMED';
          throw attachmentError;
        }
        sendLog('success', 'GEMINI_STEP_3_OK', 'Anexo confirmado antes do prompt', uploadMeta);
        sendLog('success', 'ATTACHMENT_CONFIRMED', 'Handshake de anexo confirmado', uploadMeta);
        await sleep(1000);

        reportProgress('📤 ENVIANDO PROMPT...', job.mangaTabId);
        debugConsole('log', '[MangaTranslator Gemini] Injetando prompt e enviando...');

        const fallbackPrompt =
          'Crie uma imagem traduzindo todas as falas desta imagem para o Português. Mantenha o sentido original e apenas altere ou modifique o texto na imagem.';
        const actualPrompt =
          job.prompt && String(job.prompt).trim().length > 0
            ? job.prompt
            : fallbackPrompt;

        if (actualPrompt === fallbackPrompt && !job.prompt?.trim?.()) {
          sendLog(
            'error',
            'PROMPT_FALLBACK',
            'Prompt falhou ou está vazio. Usando emergência!',
            { fallbackLength: fallbackPrompt.length }
          );
        }

        const activeEditor =
          queryFirstDeep('rich-textarea, .ql-editor, [contenteditable="true"]') ||
          liveEditor;
        const activeEditable =
          queryFirstDeep(
            'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
          ) ||
          domApi.getEditableElement(activeEditor) ||
          liveEditable;

        const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;
        pageWindow.dispatchEvent(new CustomEventImpl(
          'MANGA_TRANSLATOR_SET_PROMPT',
          { detail: { prompt: actualPrompt } }
        ));
        await sleep(200);

        setPromptInEditor(activeEditable, activeEditor, actualPrompt);

        const promptLength = String(activeEditable.textContent || '').trim().length;
        assertStage(
          promptLength >= 5,
          `O prompt não foi inserido. Comprimento: ${promptLength}`,
          4,
          'Prompt injetado com sucesso.'
        );
        sendLog(
          'success',
          'PROMPT_INJECTED',
          'Prompt confirmado no DOM',
          { promptLen: promptLength }
        );
        await sleep(1000);

        const ignoreImages = new Set(
          queryAllDeep('img')
            .map(image => getImageSource(image))
            .filter(Boolean)
        );

        activeObserver = observerApi.createGeminiObserver({
          jobId: job.jobId,
          root,
          editor: activeEditable,
          getEditor: () =>
            queryFirstDeep(
              'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
            ) || activeEditable,
          ignoreImages,
          imageQuarantine,
          onStateChange: (type, detail) => {
            if (type === 'result_candidate_rejected' || type === 'result_candidate_accepted') {
              const assistStatus = root.getElementById('mt-gemini-assist-status');
              if (assistStatus) {
                assistStatus.textContent = type === 'result_candidate_accepted'
                  ? 'Imagem validada automaticamente. Extraindo resultado...'
                  : 'Imagem encontrada no DOM, mas rejeitada pela validação automática. Aguardando resultado válido...';
              }
              sendLog('info', type === 'result_candidate_rejected' ? 'GEMINI_RESULT_REJECTED' : 'GEMINI_RESULT_ACCEPTED',
                type === 'result_candidate_rejected' ? 'Candidato descartado pelo contexto da imagem' : 'Resposta do modelo validada', {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                  reason: detail?.reason, sourceType: detail?.sourceType,
                  ownerTag: detail?.ownerTag || null,
                });
            }
            if (type === 'generation_started') {
              sendLog(
                'info',
                'GEMINI_GENERATION_ACTIVE',
                'Geração observada na UI',
                { executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8), reason: detail && detail.reason }
              );
              if (!watchdogRefreshRequested) {
                watchdogRefreshRequested = true;
                const refreshMetadata = {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                };
                const reportRefresh = (response, error) => {
                  const ok = !error && response?.ok === true && response.refreshed === true;
                  sendLog(ok ? 'success' : 'warn',
                    ok ? 'GEMINI_WATCHDOG_REFRESH_CONFIRMED' : 'GEMINI_WATCHDOG_REFRESH_FAILED',
                    ok ? 'Watchdog reiniciado após o início da geração' : 'Não foi possível reiniciar o watchdog',
                    refreshMetadata);
                };
                sendLog('info', 'GEMINI_WATCHDOG_REFRESH_REQUESTED',
                  'Solicitando novo prazo de 5 min a partir do início da geração', refreshMetadata);
                try {
                  runtime.sendMessage({
                    action: 'REFRESH_JOB_WATCHDOG', jobId: job.jobId,
                  }, response => reportRefresh(response, runtime.lastError));
                } catch (error) {
                  reportRefresh(null, error);
                }
              }
            }
          },
        }).start();

        pageWindow.__mangaTranslatorActiveGeminiObserver = activeObserver;
        sendLog(
          'info',
          'GEMINI_OBSERVER_READY',
          'Observer instalado antes do submit',
          { jobIdPrefix: String(job.jobId || '').slice(0, 8) }
        );

        let submission;
        try {
          submission = await editorApi.submitWithConfirmation({
            observer: activeObserver,
            getEditor: () =>
              queryFirstDeep(
                'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
              ) || activeEditable,
            getSendButton: () => domApi.findSendButton(root.body),
            maxAttempts: 2,
            confirmationTimeoutMs: 5000,
            sleep,
            onAttempt: attempt => {
              sendLog(
                'info',
                'GEMINI_SUBMIT_ATTEMPT',
                'Tentativa de submit iniciada',
                { attempt }
              );

              if (attempt === 2) {
                // Retry local; não ativa aba/janela nem dispara DO_SEND_NOW.
                setAntiThrottleMode('legacy');
                sendLog('warn', 'GEMINI_SEND_RETRY_BACKGROUND', 'Nova tentativa de envio em segundo plano', {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                });
              }
            },
            mainWorldFallback: async () => {
              pageWindow.dispatchEvent(new CustomEventImpl(
                'MANGA_TRANSLATOR_TRIGGER_SEND'
              ));
              sendLog(
                'warn',
                'GEMINI_SEND_FALLBACK',
                'Fallback MAIN-world tentado; aguardando confirmação observável',
                {}
              );
              return true;
            },
          });
        } catch (submitError) {
          if (submitError?.code === 'GEMINI_SUBMISSION_NOT_CONFIRMED') {
            sendLog(
              'error',
              'GEMINI_SUBMISSION_NOT_CONFIRMED',
              'Nenhuma transição da UI confirmou o envio após duas tentativas',
              {}
            );
            const error = new Error('GEMINI_SUBMISSION_NOT_CONFIRMED');
            error.code = 'GEMINI_SUBMISSION_NOT_CONFIRMED';
            throw error;
          }
          throw submitError;
        }

        setAntiThrottleMode(steadyAntiThrottleMode);
        sendLog(
          'success',
          'GEMINI_SEND_SUCCESS',
          'Envio confirmado por transição observável da UI',
          { attempt: submission.attempt, reason: submission.reason }
        );
        debugConsole(
          'log',
          '[MangaTranslator Gemini] Envio confirmado pelo Observer V2.',
          { attempt: submission.attempt, reason: submission.reason }
        );
        assertStage(
          submission && submission.confirmed,
          'Envio não foi confirmado pela interface.',
          4,
          'Submit confirmado pela UI'
        );

        reportProgress('🧠 GEMINI PROCESSANDO...', job.mangaTabId);
        createGeminiManualPanel(job, () => ignoreImages);

        const shouldDeleteConversation =
          executionMode === 'minimized_window' ||
          executionMode === 'background_delete' ||
          (
            executionMode === 'temp_chat' &&
            tempChatResult.notFound &&
            !tempChatResult.alreadyActive
          );

        const configuredTimeout = Number(scope.__MT_GEMINI_GENERATION_TIMEOUT_MS__);
        const waitTimeoutMs =
          Number.isFinite(configuredTimeout) && configuredTimeout > 0
            ? configuredTimeout
            : 4 * 60 * 1000;

        const waitStartedAt = Date.now();
        const progressTimer = setIntervalFn(() => {
          const elapsedSeconds = Math.floor((Date.now() - waitStartedAt) / 1000);
          reportProgress(
            `🧠 GEMINI PROCESSANDO (${elapsedSeconds}s)...`,
            job.mangaTabId
          );
        }, 5000);

        let resultUrl = null;
        let resultImageElement = null;

        try {
          const observedResult = await activeObserver.waitForResult(waitTimeoutMs);
          resultUrl = observedResult && observedResult.url;
          resultImageElement = observedResult && observedResult.image;
        } catch (waitError) {
          if (waitError?.code === 'GEMINI_UI_ERROR') {
            sendLog(
              'error',
              'GEMINI_ERROR',
              'Erro visível da UI detectado pelo Observer V2',
              { messageLength: String(waitError.message || '').length }
            );
            await deliverWithSecureDeletion({
              action: 'GEMINI_ERROR',
              mangaTabId: job.mangaTabId,
              index: job.index,
              error:
                `Retornou erro interface: ${String(waitError.message || 'Erro da interface do Gemini')}`,
              jobId: job.jobId,
              batchId: job.batchId,
            }, shouldDeleteConversation);
            return { status: 'ui_error' };
          }

          if (waitError?.code === 'GEMINI_RESULT_TIMEOUT') {
            sendLog(
              'error',
              'GEMINI_TIMEOUT',
              'Timeout de geração aguardando Observer V2',
              {}
            );
            await deliverWithSecureDeletion({
              action: 'GEMINI_ERROR',
              mangaTabId: job.mangaTabId,
              index: job.index,
              error: 'Tempo limite (4 min)',
              jobId: job.jobId,
              batchId: job.batchId,
            }, shouldDeleteConversation);
            return { status: 'result_timeout' };
          }

          throw waitError;
        } finally {
          clearIntervalFn(progressTimer);
        }

        assertStage(
          resultUrl &&
            (
              resultUrl.startsWith('http') ||
              resultUrl.startsWith('blob') ||
              resultUrl.startsWith('data:image/')
            ),
          'URL Imagem inválida',
          5,
          'Mídia extraída blob'
        );

        sendLog(
          'success',
          'GEMINI_IMG_FOUND',
          'Imagem gerada!',
          getUrlLogMetadata(resultUrl)
        );
        reportProgress('📥 EXTRAINDO IMAGEM...', job.mangaTabId);

        if (
          resultUrl.includes('googleusercontent.com') &&
          /=s\d+/.test(resultUrl)
        ) {
          resultUrl = resultUrl.replace(/=s\d+[^?#]*/, '=s0');
        }

        const extraction = await resultExtractor.extractOrAuxiliaryFallback({
          resultImageElement,
          resultUrl,
          executionMode,
          maxAttempts: 4,
          retryDelayMs: 1000,
          logContext: {
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
            batchIdPrefix: String(job.batchId || '').slice(0, 8),
            index: job.index,
          },
          onAuxiliaryFallback: async ({ url }) => {
            const registered = await sendRuntimeMessageAsync({
              action: 'GEMINI_RESULT_URL',
              mangaTabId: job.mangaTabId,
              index: job.index,
              url,
              jobId: job.jobId,
              batchId: job.batchId,
            });
            if (!registered?.ok || registered.extractionRegistered !== true) {
              const error = new Error(`Fallback auxiliar não foi registrado: ${registered?.reason || 'registration_failed'}`);
              error.code = 'AUXILIARY_REGISTRATION_FAILED';
              throw error;
            }
            sendLog('info', 'GEMINI_AUXILIARY_REGISTERED',
              'Aba auxiliar assumiu a extração; o job Gemini permanecerá vivo até a persistência.', {
                jobIdPrefix: String(job.jobId || '').slice(0, 8),
                batchIdPrefix: String(job.batchId || '').slice(0, 8),
              });
            return registered;
          },
        });

        if (extraction.kind === 'extracted' && extraction.dataUrl) {
          try {
            const quarantineResult = await imageQuarantine.assessExtractedResult({
              element: resultImageElement,
              candidateDataUrl: extraction.dataUrl,
              inputDataUrl: job.srcData,
              inputHash: inputImageHash,
            });
            if (quarantineResult.quarantined) {
              sendLog(
                'error',
                'GEMINI_RESULT_MATCHES_INPUT',
                'Resultado bloqueado pela quarentena de imagem',
                { reason: quarantineResult.reason, exactMatch: quarantineResult.exactMatch === true }
              );
              const quarantineError = new Error('O resultado do Gemini é idêntico à imagem de entrada.');
              quarantineError.code = 'GEMINI_RESULT_MATCHES_INPUT';
              quarantineError.alreadyLogged = true;
              throw quarantineError;
            }
          } catch (quarantineError) {
            if (quarantineError?.code === 'GEMINI_RESULT_MATCHES_INPUT') throw quarantineError;
            sendLog(
              'warn',
              'GEMINI_QUARANTINE_HASH_UNAVAILABLE',
              'A comparação exata do resultado falhou; o fluxo continuará com os filtros estruturais',
              { messageLength: String(quarantineError?.message || '').length }
            );
          }

          await stageAndCommitResult({
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: job.mangaTabId,
            index: job.index,
            src: extraction.dataUrl,
            jobId: job.jobId,
            batchId: job.batchId,
          });
        }

        return {
          status: extraction.kind === 'extracted'
            ? 'delivered_extracted'
            : 'delivered_auxiliary',
        };
      } catch (error) {
        if (!error?.alreadyLogged) {
          sendLog(
            'error',
            error?.code || 'GEMINI_ERROR',
            'Job Gemini encerrado com erro',
            {
              executionMode,
              index: job.index,
              messageLength: String(error?.message || '').length,
            }
          );
        }
        runtime.sendMessage({
          action: 'GEMINI_ERROR',
          mangaTabId: job.mangaTabId,
          index: job.index,
          error: error.message,
          jobId: job.jobId,
          batchId: job.batchId,
        });
        return { status: 'error', error };
      } finally {
        setAntiThrottleMode('minimal');

        if (activeObserver) {
          try { activeObserver.stop(); } catch (_e) {}
          activeObserver = null;
        }

        if (pageWindow.__mangaTranslatorActiveGeminiObserver) {
          delete pageWindow.__mangaTranslatorActiveGeminiObserver;
        }

        stopScrollAssist();
        closeKeepAlive();
        removeGeminiManualPanel();

        if (pageWindow.__mangaTranslatorManualPickHandler) {
          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
          delete pageWindow.__mangaTranslatorManualPickHandler;
        }

        queryAllDeep('img').forEach(image => {
          if (image.style.outline?.includes('#FF4444')) {
            image.style.outline = '';
            image.style.outlineOffset = '';
          }
        });
      }
    }

    function getActiveObserver() {
      return activeObserver;
    }

    return {
      run,
      dataURLtoFile,
      waitForElement,
      tryClickModelImageCards,
      isLikelyGeneratedImage,
      isManualSelectableImage,
      findGeneratedResultImages,
      setManualGeminiResultUrl,
      removeGeminiManualPanel,
      createGeminiManualPanel,
      setPromptInEditor,
      shouldKeepConversationForDebug,
      requestImageData,
      getAntiThrottleModeForExecutionMode,
      setAntiThrottleMode,
      getActiveObserver,
    };
  }

  const api = { createGeminiJobRunner };
  scope.MangaTranslatorGeminiJobRunner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

```

**Fim da fonte integral.** O bloco acima corresponde ao blob `1b16fd656e82e64ef2d26977e061f87e469aa3ff`; o newline final é contabilizado como posição 1472.
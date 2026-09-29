# Bíblia técnica — `extension/content/gemini/selectors.js`

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE; documentação 131/131 pronta para auditoria compartilhada  
> **SHA auditado:** `0bf8db6e416a880de9f4dd37bd4cc290e5aaba19`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#C`  
> **Tipo:** JavaScript — contrato de seletores do content script Gemini  
> **Linhas textuais:** **130**  
> **Posições documentais:** **131** contando newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`selectors.js` é a tabela central de seletores CSS que define vocabulário compartilhado para reconhecer editor, botões de envio/parada, respostas do modelo, turnos do usuário, erros e regiões do composer na automação do Google Gemini. Ele é carregado **antes** de `dom.js`, `observer.js` e dos demais módulos Gemini pelo manifest.

O módulo não toca o DOM, não envia mensagens, não lê storage e não possui lifecycle assíncrono. Seu efeito colateral é instalar `scope.MangaTranslatorGeminiSelectors`. Mesmo sendo pequeno, ele participa de decisões de confiança importantes: principalmente `MODEL_RESPONSE_STRICT`, que delimita quais containers podem sustentar ownership de uma resposta automática.

## 2. Loader, dependências e consumidores reais

- `extension/manifest.json` injeta `content/gemini/selectors.js` como **primeiro módulo Gemini**, antes de `dom.js` e `observer.js`.
- `scripts/validation/verify-repository-structure.js` mantém essa sequência na estrutura esperada; isto é evidência estática de ordem.
- `extension/content/gemini/dom.js` resolve `MangaTranslatorGeminiSelectors` ou requer `./selectors.js` em CommonJS e consome:
  - `MODEL_RESPONSE_STRICT`;
  - `RESPONSE`;
  - `USER_TURN`;
  - `INPUT_AREA`;
  - `STOP`.
- `extension/content/gemini/observer.js` exige a API e consome:
  - `MODEL_RESPONSE_STRICT`;
  - `ERROR`;
  - `SEND`.
- `tests/helpers/load-content-gemini-module.js` reproduz a ordem modular para suites do bootstrap.
- `tests/unit/content-gemini/dom-modules.test.js` importa este módulo real e faz assertions diretas sobre cinco chaves.
- `tests/unit/content-gemini/observer.test.js` carrega este módulo real com DOM + Observer e exercita ownership, send e user-turn de forma integrada.

## 3. Chaves exportadas e situação de uso

| Chave | Uso atual confirmado | Observação |
|---|---|---|
| `INPUT` | nenhuma leitura `SELECTORS.INPUT` localizada no runtime modular | Existe assertion direta de conteúdo, mas `dom.getEditableElement` mantém seletor próprio. |
| `EDITOR_ROOT` | nenhum consumer `SELECTORS.EDITOR_ROOT` localizado | Contrato disponível, atualmente sem integração encontrada. |
| `SEND` | `observer.js` | Baseline e transição enabled/disabled usam a lista. |
| `STOP` | `dom.js` → `findVisibleStopButton` | Usado como detector visível de geração. |
| `MODEL_RESPONSE_STRICT` | `dom.js` e `observer.js` | Boundary forte de ownership de resposta. |
| `RESPONSE` | `dom.js` | Compatibilidade auxiliar após tentativa strict. |
| `USER_TURN` | `dom.js` | Exclui conteúdo/imagem pertencente ao usuário. |
| `ERROR` | `observer.js` | Baseline e detecção de novos erros visíveis. |
| `FILE_INPUT` | nenhum consumer desta constante localizado | `attachment.js` procura input file com lógica própria. |
| `ATTACHMENT_CONTAINER` | nenhum consumer desta constante localizado | `attachment.js` mantém uma lista equivalente própria. |
| `INPUT_AREA` | `dom.js` | Usado no fallback geométrico de `findSendButton`. |

## 4. Ownership: strict versus compatibilidade

A separação entre `MODEL_RESPONSE_STRICT` e `RESPONSE` é uma fronteira de segurança lógica. A lista strict contém sinais de autoria/role/tag/class suficientemente específicos para o Observer procurar **nova resposta do modelo**. A lista `RESPONSE` contém fallbacks amplos como `message-content` e `.presented-turn-content`, úteis a helpers de compatibilidade, mas inadequados para atribuir ownership sozinhos.

O comentário das linhas 59–60 é parte do contrato: futuras refatorações não devem substituir `MODEL_RESPONSE_STRICT` por `RESPONSE` em `observer.js`.

## 5. Internacionalização e acessibilidade

`SEND` e `STOP` combinam:
- `aria-label` em inglês;
- `aria-label` em português;
- variantes case-insensitive com `i`;
- testids específicos.

Isso reduz dependência de texto visual e mantém compatibilidade com UI localizada. Ainda assim, a lista é limitada aos idiomas/labels conhecidos; mudança do Google pode fazer o fluxo falhar fechado até atualização dos seletores.

## 6. Imutabilidade

`Object.freeze` impede substituição/adição/remoção das propriedades do objeto `SELECTORS`. Como cada lista é convertida imediatamente em **string**, não restam arrays internos mutáveis nesse mapa. Não há teste específico que tente mutar o objeto; portanto a intenção de imutabilidade é inferida diretamente da implementação, mas não possui prova automatizada dedicada.

## 7. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| módulo CommonJS real carrega e expõe `SELECTORS` | `dom-modules.test.js` usa `require(SELECTORS_PATH)` | ✅ PROVADO DIRETAMENTE |
| `INPUT` contém contenteditable | assertion `toContain('contenteditable')` | ✅ PROVADO DIRETAMENTE |
| `SEND` contém send-button | assertion `toContain('send-button')` | ✅ PROVADO DIRETAMENTE |
| `STOP` contém Stop/stop-generating | assertion `toMatch(/Stop|stop-generating/)` | ✅ PROVADO DIRETAMENTE |
| `RESPONSE` contém model-response | assertion `toContain('model-response')` | ✅ PROVADO DIRETAMENTE |
| `ERROR` contém role=alert | assertion `toContain('[role="alert"]')` | ✅ PROVADO DIRETAMENTE |
| `STOP` alimenta `findVisibleStopButton` | DOM test cria Stop oculto/visível e compara retorno | 🟨 EXECUTADO INDIRETAMENTE pelo consumer real |
| strict model ownership | observer/dom tests usam `model-response`, autoria assistant/model e assertam resultado/container | 🟨 EXECUTADO INDIRETAMENTE pelo consumer real |
| user-turn rejeita imagem clonada | OBS-15 cria `user-query` e exige `resultUrl=null` + reason `user_turn` | 🟨 EXECUTADO INDIRETAMENTE pelo consumer real |
| SEND participa do baseline/transição de submit | OBS-13 cria `aria-label="Send message"` e verifica disabled baseline versus transição | 🟨 EXECUTADO INDIRETAMENTE pelo Observer real |
| ordem de carga selectors → dom → ... | manifest e gate estrutural listam a ordem explicitamente | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `EDITOR_ROOT`, `FILE_INPUT`, `ATTACHMENT_CONTAINER` | nenhum assertion/consumer específico localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `Object.isFrozen(SELECTORS)` e tentativa de mutação.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todas as alternativas individuais de `INPUT`; o teste apenas confirma substring `contenteditable`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `EDITOR_ROOT`; também não foi localizado consumer runtime atual.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para cada label português de `SEND`/`STOP`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para cada testid e cada fallback case-insensitive de `SEND`/`STOP`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** dedicado ao conteúdo completo de `MODEL_RESPONSE_STRICT`; há execução integrada de vários sinais, não prova um-a-um.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todos os fallbacks amplos de `RESPONSE`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todas as variantes de `USER_TURN`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `.message-error` e `.error-text` individualmente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `FILE_INPUT`; a action de attachment usa descoberta própria, não esta constante.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `ATTACHMENT_CONTAINER`; existe duplicação de lista no `attachment.js`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que prove o fallback geométrico de `findSendButton` usando especificamente cada variante de `INPUT_AREA`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para publicação global `MangaTranslatorGeminiSelectors` em um contexto browser sem CommonJS.

### Testes recomendados

1. Teste de tabela parametrizado que cria DOM mínimo para cada alternativa de `MODEL_RESPONSE_STRICT`, `USER_TURN`, `SEND`, `STOP` e `ERROR`.
2. Teste `Object.isFrozen` + tentativa de sobrescrever uma chave em strict mode.
3. Teste do global browser e do CommonJS apontando para a mesma estrutura.
4. Teste de regressão que falhe se `attachment.js` e `ATTACHMENT_CONTAINER/FILE_INPUT` divergirem, ou refatoração posterior para consumir estas chaves diretamente.
5. Teste específico do fallback geométrico de `findSendButton` para `INPUT_AREA`.
6. Teste estático/arquitetural que sinalize chaves exportadas sem consumidores, evitando constantes “mortas” silenciosas.

## 9. Análise crítica e riscos

- **Duplicação real:** `FILE_INPUT` e `ATTACHMENT_CONTAINER` pretendem centralizar upload, mas `attachment.js` usa seletores próprios. Alterar apenas `selectors.js` não altera o upload atual.
- **Constantes sem consumidor:** `EDITOR_ROOT` e `INPUT` não foram encontradas em leituras `SELECTORS.*` do runtime modular atual; `INPUT` é testada apenas como conteúdo.
- **`RESPONSE` é deliberadamente mais permissivo:** `message-content` e `.presented-turn-content` não devem migrar para ownership strict sem evidência.
- **`INPUT_AREA` contém `chat-window`:** esse wrapper pode abranger conversa inteira. O próprio `dom.isInsideInputArea` usa uma lista mais restrita para ownership, portanto não se deve reutilizar `INPUT_AREA` cegamente para esse fim.
- **Idioma:** português e inglês estão cobertos nos botões, outros idiomas não.
- **Mudanças do Gemini:** classes/testids podem mudar sem contrato público; o pipeline deve preferir falhar fechado a aceitar conteúdo ambíguo.
- **Freeze raso:** atualmente é suficiente porque valores finais são strings; se no futuro algum valor virar objeto/array, `Object.freeze` do mapa não congelará recursivamente o conteúdo.

## 10. Segurança e privacidade

O arquivo não manipula payload do usuário nem URLs de imagens. Seu risco é **classificação incorreta de DOM**:
- falso positivo em `MODEL_RESPONSE_STRICT` pode atribuir conteúdo errado ao modelo/job;
- falso negativo em SEND/STOP pode interromper automação;
- falso positivo em USER_TURN é preferível a aceitar imagem do usuário como resultado, desde que cause falha fechada;
- listas amplas de compatibilidade não devem atravessar o boundary de ownership.

## 11. Invariantes

1. `selectors.js` deve continuar carregado antes dos módulos que consomem `MangaTranslatorGeminiSelectors`.
2. `MODEL_RESPONSE_STRICT` deve ser mais restritivo que `RESPONSE` e continuar sendo a lista do Observer para ownership.
3. `RESPONSE` não pode, sozinho, conceder ownership de resultado.
4. USER_TURN precisa continuar cobrindo os wrappers que podem conter a imagem originalmente enviada.
5. SEND/STOP devem manter sinais acessíveis/localizados ou equivalentes comprovados.
6. Mudança em classes/testids deve ser acompanhada de testes que executem consumidores reais.
7. Chaves “centralizadas” não devem divergir silenciosamente de seletores duplicados em outros módulos.
8. `SELECTORS` deve permanecer não mutável durante a execução.
9. Browser global e CommonJS devem expor a mesma definição.
10. Um seletor amplo novo deve ser tratado como compatibilidade até existir evidência suficiente para promovê-lo a strict.
11. Nenhuma mudança nesta tabela deve transformar ausência de evidência em sucesso do RPA.
12. `INPUT_AREA` amplo não deve substituir a lista restrita usada por `dom.isInsideInputArea` para ownership.

## 12. Fonte integral

```javascript
'use strict';
// gemini/selectors.js — Seletores centralizados da UI do Google Gemini.
//
// Ordem de preferência: seletor específico -> acessível -> fallback semântico.
// Deep scan continua disponível no adapter DOM, mas nunca deve ser a primeira
// fonte de verdade para estados críticos.

(function(scope) {
  const SELECTORS = Object.freeze({
    INPUT: [
      'rich-textarea [contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      '.ql-editor[contenteditable="true"]',
      '[contenteditable="true"]',
    ].join(', '),

    EDITOR_ROOT: [
      'rich-textarea',
      '.ql-editor',
      '[contenteditable="true"]',
    ].join(', '),

    SEND: [
      'button.send-button',
      'button[aria-label="Send"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Enviar"]',
      'button[aria-label="Enviar mensagem"]',
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Enviar mensagem" i]',
      '[data-test-id="send-button"]',
      '[data-testid="send-button"]',
    ].join(', '),

    STOP: [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="Parar" i]',
      'button[aria-label*="Interromper" i]',
      '[data-test-id="stop-generating-button"]',
      '[data-testid="stop-generating-button"]',
    ].join(', '),

    // Seletores com ownership forte. Somente estes podem conceder ao Observer
    // propriedade de uma resposta automática do modelo.
    MODEL_RESPONSE_STRICT: [
      '[data-message-author="assistant"]',
      '[data-turn-role="assistant"]',
      'model-response',
      '[data-test-id*="model-response"]',
      '[data-testid*="model-response"]',
      '[data-message-author="model"]',
      'bard-model-response',
      'div[data-turn-role="model"]',
      'message-content.model',
      '.model-response-container',
      '.model-response-text',
    ].join(', '),

    // Compatibilidade para módulos auxiliares. Não usar sozinho para ownership.
    RESPONSE: [
      'model-response',
      '[data-test-id*="model-response"]',
      '[data-testid*="model-response"]',
      '[data-message-author="model"]',
      'bard-model-response',
      'div[data-turn-role="model"]',
      '.model-response-container',
      '.model-response-text',
      '.response-container',
      '.model-turn',
      'message-content.model',
      'message-content',
      '[data-message-author="assistant"]',
      'div[data-turn-role="assistant"]',
      '.assistant-message',
      '.assistant-response',
      '.presented-turn-content',
    ].join(', '),

    USER_TURN: [
      'user-query',
      'user-query-content',
      '.user-query',
      '[data-turn-role="user"]',
      '[data-message-author="user"]',
      'div[data-turn-role="user"]',
      '[data-test-id*="user-message"]',
      '[data-testid*="user-message"]',
      '.user-query-container',
      '.user-message',
    ].join(', '),

    ERROR: [
      '.message-error',
      '.error-text',
      '[role="alert"]',
    ].join(', '),

    FILE_INPUT: 'input[type="file"]',

    ATTACHMENT_CONTAINER: [
      'file-preview',
      'attachment-card',
      '[data-test-id*="attachment"]',
      '[data-testid*="attachment"]',
      '[data-test-id*="preview"]',
      '[data-testid*="preview"]',
      '.file-preview',
      '.attachment-preview',
      '.image-preview',
      '.attachment-container',
    ].join(', '),

    INPUT_AREA: [
      'rich-textarea',
      '.input-area',
      'chat-window',
      '.chat-input-container',
      '.chat-input',
      'input-area',
    ].join(', '),
  });

  const api = { SELECTORS };
  scope.MangaTranslatorGeminiSelectors = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
```

## 13. Cobertura linha a linha — 131/131

### Linha 001 — U01

**Fonte:** `'use strict';`

**O que faz:** Ativa modo estrito antes de criar o mapa de seletores.

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que foi implementado dessa forma:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Por que uma implementação ingênua seria pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### Linha 002 — U01

**Fonte:** `// gemini/selectors.js — Seletores centralizados da UI do Google Gemini.`

**O que faz:** Comentário de contrato: gemini/selectors.js — Seletores centralizados da UI do Google Gemini..

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que foi implementado dessa forma:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Por que uma implementação ingênua seria pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### Linha 003 — U01

**Fonte:** `//`

**O que faz:** Comentário de contrato: separador de comentário.

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que foi implementado dessa forma:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Por que uma implementação ingênua seria pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### Linha 004 — U01

**Fonte:** `// Ordem de preferência: seletor específico -> acessível -> fallback semântico.`

**O que faz:** Comentário de contrato: Ordem de preferência: seletor específico -> acessível -> fallback semântico..

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que foi implementado dessa forma:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Por que uma implementação ingênua seria pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### Linha 005 — U01

**Fonte:** `// Deep scan continua disponível no adapter DOM, mas nunca deve ser a primeira`

**O que faz:** Comentário de contrato: Deep scan continua disponível no adapter DOM, mas nunca deve ser a primeira.

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que foi implementado dessa forma:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Por que uma implementação ingênua seria pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### Linha 006 — U01

**Fonte:** `// fonte de verdade para estados críticos.`

**O que faz:** Comentário de contrato: fonte de verdade para estados críticos..

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que foi implementado dessa forma:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Por que uma implementação ingênua seria pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### Linha 007 — U01

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U01 (Contrato e política de seleção) sem alterar o objeto exportado.

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que foi implementado dessa forma:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Por que uma implementação ingênua seria pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### Linha 008 — U02

**Fonte:** `(function(scope) {`

**O que faz:** Abre a IIFE que recebe o global do runtime.

**Como faz:** A IIFE recebe `self/globalThis`; todas as entradas são strings finais, porque arrays são imediatamente unidos.

**Por que foi implementado dessa forma:** Um mapa compartilhado e congelado reduz drift/acidental mutation entre DOM e Observer.

**Por que uma implementação ingênua seria pior:** Constantes mutáveis espalhadas pelos módulos poderiam divergir durante uma mesma execução e alterar critérios críticos de ownership.

### Linha 009 — U02

**Fonte:** `  const SELECTORS = Object.freeze({`

**O que faz:** Cria o mapa central e congela suas propriedades de primeiro nível.

**Como faz:** A IIFE recebe `self/globalThis`; todas as entradas são strings finais, porque arrays são imediatamente unidos.

**Por que foi implementado dessa forma:** Um mapa compartilhado e congelado reduz drift/acidental mutation entre DOM e Observer.

**Por que uma implementação ingênua seria pior:** Constantes mutáveis espalhadas pelos módulos poderiam divergir durante uma mesma execução e alterar critérios críticos de ownership.

### Linha 010 — U03

**Fonte:** `    INPUT: [`

**O que faz:** Abre a lista de alternativas da chave `INPUT`.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que foi implementado dessa forma:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Por que uma implementação ingênua seria pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### Linha 011 — U03

**Fonte:** `      'rich-textarea [contenteditable="true"]',`

**O que faz:** Primeira opção de INPUT: procura contenteditable dentro do componente `rich-textarea`, reduzindo escopo ao composer.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que foi implementado dessa forma:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Por que uma implementação ingênua seria pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### Linha 012 — U03

**Fonte:** `      'div[contenteditable="true"][role="textbox"]',`

**O que faz:** Segunda opção de INPUT: usa role=textbox junto com contenteditable, privilegiando semântica acessível.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que foi implementado dessa forma:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Por que uma implementação ingênua seria pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### Linha 013 — U03

**Fonte:** `      '.ql-editor[contenteditable="true"]',`

**O que faz:** Terceira opção de INPUT: reconhece o editor Quill concreto usado por versões do Gemini.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que foi implementado dessa forma:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Por que uma implementação ingênua seria pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### Linha 014 — U03

**Fonte:** `      '[contenteditable="true"]',`

**O que faz:** Fallback de INPUT: aceita qualquer contenteditable quando os wrappers específicos desapareceram.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que foi implementado dessa forma:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Por que uma implementação ingênua seria pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### Linha 015 — U03

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que foi implementado dessa forma:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Por que uma implementação ingênua seria pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### Linha 016 — U03

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U03 (INPUT) sem alterar o objeto exportado.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que foi implementado dessa forma:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Por que uma implementação ingênua seria pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### Linha 017 — U04

**Fonte:** `    EDITOR_ROOT: [`

**O que faz:** Abre a lista de alternativas da chave `EDITOR_ROOT`.

**Como faz:** Combina `rich-textarea`, `.ql-editor` e contenteditable.

**Por que foi implementado dessa forma:** Permite representar wrapper e editor concreto em um único contrato central.

**Por que uma implementação ingênua seria pior:** Assumir uma única raiz torna foco/dispatch frágeis sob re-renderizações.

### Linha 018 — U04

**Fonte:** `      'rich-textarea',`

**O que faz:** Raiz editorial preferida: o web component `rich-textarea`.

**Como faz:** Combina `rich-textarea`, `.ql-editor` e contenteditable.

**Por que foi implementado dessa forma:** Permite representar wrapper e editor concreto em um único contrato central.

**Por que uma implementação ingênua seria pior:** Assumir uma única raiz torna foco/dispatch frágeis sob re-renderizações.

### Linha 019 — U04

**Fonte:** `      '.ql-editor',`

**O que faz:** Raiz alternativa: o nó `.ql-editor` do editor Quill.

**Como faz:** Combina `rich-textarea`, `.ql-editor` e contenteditable.

**Por que foi implementado dessa forma:** Permite representar wrapper e editor concreto em um único contrato central.

**Por que uma implementação ingênua seria pior:** Assumir uma única raiz torna foco/dispatch frágeis sob re-renderizações.

### Linha 020 — U04

**Fonte:** `      '[contenteditable="true"]',`

**O que faz:** Fallback de raiz: qualquer contenteditable.

**Como faz:** Combina `rich-textarea`, `.ql-editor` e contenteditable.

**Por que foi implementado dessa forma:** Permite representar wrapper e editor concreto em um único contrato central.

**Por que uma implementação ingênua seria pior:** Assumir uma única raiz torna foco/dispatch frágeis sob re-renderizações.

### Linha 021 — U04

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Combina `rich-textarea`, `.ql-editor` e contenteditable.

**Por que foi implementado dessa forma:** Permite representar wrapper e editor concreto em um único contrato central.

**Por que uma implementação ingênua seria pior:** Assumir uma única raiz torna foco/dispatch frágeis sob re-renderizações.

### Linha 022 — U04

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U04 (EDITOR_ROOT) sem alterar o objeto exportado.

**Como faz:** Combina `rich-textarea`, `.ql-editor` e contenteditable.

**Por que foi implementado dessa forma:** Permite representar wrapper e editor concreto em um único contrato central.

**Por que uma implementação ingênua seria pior:** Assumir uma única raiz torna foco/dispatch frágeis sob re-renderizações.

### Linha 023 — U05

**Fonte:** `    SEND: [`

**O que faz:** Abre a lista de alternativas da chave `SEND`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 024 — U05

**Fonte:** `      'button.send-button',`

**O que faz:** SEND por classe explícita `send-button`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 025 — U05

**Fonte:** `      'button[aria-label="Send"]',`

**O que faz:** SEND por aria-label inglês curto `Send`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 026 — U05

**Fonte:** `      'button[aria-label="Send message"]',`

**O que faz:** SEND por aria-label inglês `Send message`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 027 — U05

**Fonte:** `      'button[aria-label="Enviar"]',`

**O que faz:** SEND por aria-label português curto `Enviar`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 028 — U05

**Fonte:** `      'button[aria-label="Enviar mensagem"]',`

**O que faz:** SEND por aria-label português `Enviar mensagem`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 029 — U05

**Fonte:** `      'button[aria-label*="Send message" i]',`

**O que faz:** SEND case-insensitive contendo `Send message`, tolerando sufixos/prefixos acessíveis.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 030 — U05

**Fonte:** `      'button[aria-label*="Enviar mensagem" i]',`

**O que faz:** SEND case-insensitive contendo `Enviar mensagem`, cobrindo UI localizada com texto adicional.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 031 — U05

**Fonte:** `      '[data-test-id="send-button"]',`

**O que faz:** SEND por variante `data-test-id=send-button`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 032 — U05

**Fonte:** `      '[data-testid="send-button"]',`

**O que faz:** SEND por variante `data-testid=send-button`.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 033 — U05

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 034 — U05

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U05 (SEND) sem alterar o objeto exportado.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que foi implementado dessa forma:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Por que uma implementação ingênua seria pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### Linha 035 — U06

**Fonte:** `    STOP: [`

**O que faz:** Abre a lista de alternativas da chave `STOP`.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 036 — U06

**Fonte:** `      'button[aria-label*="Stop" i]',`

**O que faz:** STOP por aria-label contendo `Stop`, case-insensitive.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 037 — U06

**Fonte:** `      'button[aria-label*="Parar" i]',`

**O que faz:** STOP por aria-label português contendo `Parar`.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 038 — U06

**Fonte:** `      'button[aria-label*="Interromper" i]',`

**O que faz:** STOP por aria-label português contendo `Interromper`.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 039 — U06

**Fonte:** `      '[data-test-id="stop-generating-button"]',`

**O que faz:** STOP por `data-test-id` específico do controle de geração.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 040 — U06

**Fonte:** `      '[data-testid="stop-generating-button"]',`

**O que faz:** STOP pela variante ortográfica `data-testid` do mesmo controle.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 041 — U06

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 042 — U06

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U06 (STOP) sem alterar o objeto exportado.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que foi implementado dessa forma:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Por que uma implementação ingênua seria pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### Linha 043 — U07

**Fonte:** `    // Seletores com ownership forte. Somente estes podem conceder ao Observer`

**O que faz:** Comentário de contrato: Seletores com ownership forte. Somente estes podem conceder ao Observer.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 044 — U07

**Fonte:** `    // propriedade de uma resposta automática do modelo.`

**O que faz:** Comentário de contrato: propriedade de uma resposta automática do modelo..

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 045 — U07

**Fonte:** `    MODEL_RESPONSE_STRICT: [`

**O que faz:** Abre a lista de alternativas da chave `MODEL_RESPONSE_STRICT`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 046 — U07

**Fonte:** `      '[data-message-author="assistant"]',`

**O que faz:** Ownership strict por atributo `data-message-author=assistant`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 047 — U07

**Fonte:** `      '[data-turn-role="assistant"]',`

**O que faz:** Ownership strict por `data-turn-role=assistant`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 048 — U07

**Fonte:** `      'model-response',`

**O que faz:** Ownership strict pela tag customizada `model-response`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 049 — U07

**Fonte:** `      '[data-test-id*="model-response"]',`

**O que faz:** Ownership strict por `data-test-id` que identifica model-response.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 050 — U07

**Fonte:** `      '[data-testid*="model-response"]',`

**O que faz:** Ownership strict pela variante `data-testid`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 051 — U07

**Fonte:** `      '[data-message-author="model"]',`

**O que faz:** Ownership strict por autoria explícita `model`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 052 — U07

**Fonte:** `      'bard-model-response',`

**O que faz:** Ownership strict pela tag legada/alternativa `bard-model-response`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 053 — U07

**Fonte:** `      'div[data-turn-role="model"]',`

**O que faz:** Ownership strict por `data-turn-role=model` em div.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 054 — U07

**Fonte:** `      'message-content.model',`

**O que faz:** Ownership strict por `message-content.model`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 055 — U07

**Fonte:** `      '.model-response-container',`

**O que faz:** Ownership strict por `.model-response-container`.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 056 — U07

**Fonte:** `      '.model-response-text',`

**O que faz:** Ownership strict por `.model-response-text`, útil para wrappers internos ainda ligados a resposta do modelo.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 057 — U07

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 058 — U07

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U07 (MODEL_RESPONSE_STRICT) sem alterar o objeto exportado.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que foi implementado dessa forma:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Por que uma implementação ingênua seria pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### Linha 059 — U08

**Fonte:** `    // Compatibilidade para módulos auxiliares. Não usar sozinho para ownership.`

**O que faz:** Comentário de contrato: Compatibilidade para módulos auxiliares. Não usar sozinho para ownership..

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 060 — U08

**Fonte:** `    RESPONSE: [`

**O que faz:** Abre a lista de alternativas da chave `RESPONSE`.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 061 — U08

**Fonte:** `      'model-response',`

**O que faz:** RESPONSE compatível reconhece `model-response`.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 062 — U08

**Fonte:** `      '[data-test-id*="model-response"]',`

**O que faz:** RESPONSE compatível aceita testid de model-response.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 063 — U08

**Fonte:** `      '[data-testid*="model-response"]',`

**O que faz:** RESPONSE compatível aceita variante data-testid.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 064 — U08

**Fonte:** `      '[data-message-author="model"]',`

**O que faz:** RESPONSE compatível aceita autoria model.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 065 — U08

**Fonte:** `      'bard-model-response',`

**O que faz:** RESPONSE compatível aceita `bard-model-response`.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 066 — U08

**Fonte:** `      'div[data-turn-role="model"]',`

**O que faz:** RESPONSE compatível aceita role model.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 067 — U08

**Fonte:** `      '.model-response-container',`

**O que faz:** RESPONSE compatível aceita container de resposta do modelo.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 068 — U08

**Fonte:** `      '.model-response-text',`

**O que faz:** RESPONSE compatível aceita texto de resposta do modelo.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 069 — U08

**Fonte:** `      '.response-container',`

**O que faz:** Fallback amplo `.response-container`; útil para compatibilidade, inadequado sozinho para ownership.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 070 — U08

**Fonte:** `      '.model-turn',`

**O que faz:** Fallback amplo `.model-turn`.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 071 — U08

**Fonte:** `      'message-content.model',`

**O que faz:** Reconhece `message-content.model`, ainda com indicação de model.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 072 — U08

**Fonte:** `      'message-content',`

**O que faz:** Fallback `message-content` sem autoria explícita; motivo pelo qual RESPONSE não pode conceder ownership sozinho.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 073 — U08

**Fonte:** `      '[data-message-author="assistant"]',`

**O que faz:** Aceita autoria assistant na lista compatível.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 074 — U08

**Fonte:** `      'div[data-turn-role="assistant"]',`

**O que faz:** Aceita role assistant em div.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 075 — U08

**Fonte:** `      '.assistant-message',`

**O que faz:** Fallback de classe `.assistant-message`.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 076 — U08

**Fonte:** `      '.assistant-response',`

**O que faz:** Fallback de classe `.assistant-response`.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 077 — U08

**Fonte:** `      '.presented-turn-content',`

**O que faz:** Fallback `.presented-turn-content`, amplo e destinado apenas à compatibilidade.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 078 — U08

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 079 — U08

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U08 (RESPONSE compatível) sem alterar o objeto exportado.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que foi implementado dessa forma:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Por que uma implementação ingênua seria pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### Linha 080 — U09

**Fonte:** `    USER_TURN: [`

**O que faz:** Abre a lista de alternativas da chave `USER_TURN`.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 081 — U09

**Fonte:** `      'user-query',`

**O que faz:** USER_TURN pela tag `user-query`.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 082 — U09

**Fonte:** `      'user-query-content',`

**O que faz:** USER_TURN pela tag `user-query-content`.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 083 — U09

**Fonte:** `      '.user-query',`

**O que faz:** USER_TURN pela classe `.user-query`.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 084 — U09

**Fonte:** `      '[data-turn-role="user"]',`

**O que faz:** USER_TURN por role=user.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 085 — U09

**Fonte:** `      '[data-message-author="user"]',`

**O que faz:** USER_TURN por autoria user.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 086 — U09

**Fonte:** `      'div[data-turn-role="user"]',`

**O que faz:** USER_TURN por div role=user.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 087 — U09

**Fonte:** `      '[data-test-id*="user-message"]',`

**O que faz:** USER_TURN por data-test-id de user-message.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 088 — U09

**Fonte:** `      '[data-testid*="user-message"]',`

**O que faz:** USER_TURN por data-testid de user-message.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 089 — U09

**Fonte:** `      '.user-query-container',`

**O que faz:** USER_TURN por `.user-query-container`.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 090 — U09

**Fonte:** `      '.user-message',`

**O que faz:** USER_TURN por `.user-message`.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 091 — U09

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 092 — U09

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U09 (USER_TURN) sem alterar o objeto exportado.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que foi implementado dessa forma:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Por que uma implementação ingênua seria pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### Linha 093 — U10

**Fonte:** `    ERROR: [`

**O que faz:** Abre a lista de alternativas da chave `ERROR`.

**Como faz:** Cobre classes de erro e `[role=alert]` acessível.

**Por que foi implementado dessa forma:** Falhas de UI devem abortar waiters em vez de parecer timeout ou sucesso.

**Por que uma implementação ingênua seria pior:** Ignorar role=alert perderia erros acessíveis sem classe estável; aceitar qualquer texto vermelho seria heurística frágil.

### Linha 094 — U10

**Fonte:** `      '.message-error',`

**O que faz:** ERROR pela classe `.message-error`.

**Como faz:** Cobre classes de erro e `[role=alert]` acessível.

**Por que foi implementado dessa forma:** Falhas de UI devem abortar waiters em vez de parecer timeout ou sucesso.

**Por que uma implementação ingênua seria pior:** Ignorar role=alert perderia erros acessíveis sem classe estável; aceitar qualquer texto vermelho seria heurística frágil.

### Linha 095 — U10

**Fonte:** `      '.error-text',`

**O que faz:** ERROR pela classe `.error-text`.

**Como faz:** Cobre classes de erro e `[role=alert]` acessível.

**Por que foi implementado dessa forma:** Falhas de UI devem abortar waiters em vez de parecer timeout ou sucesso.

**Por que uma implementação ingênua seria pior:** Ignorar role=alert perderia erros acessíveis sem classe estável; aceitar qualquer texto vermelho seria heurística frágil.

### Linha 096 — U10

**Fonte:** `      '[role="alert"]',`

**O que faz:** ERROR pelo papel acessível `[role=alert]`.

**Como faz:** Cobre classes de erro e `[role=alert]` acessível.

**Por que foi implementado dessa forma:** Falhas de UI devem abortar waiters em vez de parecer timeout ou sucesso.

**Por que uma implementação ingênua seria pior:** Ignorar role=alert perderia erros acessíveis sem classe estável; aceitar qualquer texto vermelho seria heurística frágil.

### Linha 097 — U10

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Cobre classes de erro e `[role=alert]` acessível.

**Por que foi implementado dessa forma:** Falhas de UI devem abortar waiters em vez de parecer timeout ou sucesso.

**Por que uma implementação ingênua seria pior:** Ignorar role=alert perderia erros acessíveis sem classe estável; aceitar qualquer texto vermelho seria heurística frágil.

### Linha 098 — U10

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U10 (ERROR) sem alterar o objeto exportado.

**Como faz:** Cobre classes de erro e `[role=alert]` acessível.

**Por que foi implementado dessa forma:** Falhas de UI devem abortar waiters em vez de parecer timeout ou sucesso.

**Por que uma implementação ingênua seria pior:** Ignorar role=alert perderia erros acessíveis sem classe estável; aceitar qualquer texto vermelho seria heurística frágil.

### Linha 099 — U11

**Fonte:** `    FILE_INPUT: 'input[type="file"]',`

**O que faz:** FILE_INPUT canônico: qualquer input HTML de tipo file.

**Como faz:** Usa o seletor HTML direto `input[type=file]`.

**Por que foi implementado dessa forma:** Serve como contrato nominal para upload, embora o `attachment.js` atual faça descoberta própria mais estrita.

**Por que uma implementação ingênua seria pior:** Duplicar seletores sem consumidor comum cria risco de drift; este é precisamente um ponto de dívida atual.

### Linha 100 — U11

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U11 (FILE_INPUT) sem alterar o objeto exportado.

**Como faz:** Usa o seletor HTML direto `input[type=file]`.

**Por que foi implementado dessa forma:** Serve como contrato nominal para upload, embora o `attachment.js` atual faça descoberta própria mais estrita.

**Por que uma implementação ingênua seria pior:** Duplicar seletores sem consumidor comum cria risco de drift; este é precisamente um ponto de dívida atual.

### Linha 101 — U12

**Fonte:** `    ATTACHMENT_CONTAINER: [`

**O que faz:** Abre a lista de alternativas da chave `ATTACHMENT_CONTAINER`.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 102 — U12

**Fonte:** `      'file-preview',`

**O que faz:** Attachment container pela tag `file-preview`.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 103 — U12

**Fonte:** `      'attachment-card',`

**O que faz:** Attachment container pela tag `attachment-card`.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 104 — U12

**Fonte:** `      '[data-test-id*="attachment"]',`

**O que faz:** Attachment por data-test-id contendo attachment.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 105 — U12

**Fonte:** `      '[data-testid*="attachment"]',`

**O que faz:** Attachment por data-testid contendo attachment.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 106 — U12

**Fonte:** `      '[data-test-id*="preview"]',`

**O que faz:** Preview por data-test-id contendo preview.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 107 — U12

**Fonte:** `      '[data-testid*="preview"]',`

**O que faz:** Preview pela variante data-testid.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 108 — U12

**Fonte:** `      '.file-preview',`

**O que faz:** Preview pela classe `.file-preview`.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 109 — U12

**Fonte:** `      '.attachment-preview',`

**O que faz:** Preview pela classe `.attachment-preview`.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 110 — U12

**Fonte:** `      '.image-preview',`

**O que faz:** Preview pela classe `.image-preview`.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 111 — U12

**Fonte:** `      '.attachment-container',`

**O que faz:** Preview pela classe `.attachment-container`.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 112 — U12

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 113 — U12

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U12 (ATTACHMENT_CONTAINER) sem alterar o objeto exportado.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que foi implementado dessa forma:** A intenção é centralizar variações do markup de preview.

**Por que uma implementação ingênua seria pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### Linha 114 — U13

**Fonte:** `    INPUT_AREA: [`

**O que faz:** Abre a lista de alternativas da chave `INPUT_AREA`.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 115 — U13

**Fonte:** `      'rich-textarea',`

**O que faz:** INPUT_AREA pelo componente `rich-textarea`.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 116 — U13

**Fonte:** `      '.input-area',`

**O que faz:** INPUT_AREA pela classe `.input-area`.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 117 — U13

**Fonte:** `      'chat-window',`

**O que faz:** INPUT_AREA por `chat-window`; é amplo e deve permanecer restrito a usos não críticos/geometria.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 118 — U13

**Fonte:** `      '.chat-input-container',`

**O que faz:** INPUT_AREA pela classe `.chat-input-container`.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 119 — U13

**Fonte:** `      '.chat-input',`

**O que faz:** INPUT_AREA pela classe `.chat-input`.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 120 — U13

**Fonte:** `      'input-area',`

**O que faz:** INPUT_AREA pela tag `input-area`.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 121 — U13

**Fonte:** `    ].join(', '),`

**O que faz:** Converte a lista de alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 122 — U13

**Fonte:** `  });`

**O que faz:** Fecha o objeto `SELECTORS` e a chamada `Object.freeze`.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 123 — U13

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U13 (INPUT_AREA) sem alterar o objeto exportado.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que foi implementado dessa forma:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Por que uma implementação ingênua seria pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### Linha 124 — U14

**Fonte:** `  const api = { SELECTORS };`

**O que faz:** Cria a superfície pública mínima contendo apenas o mapa `SELECTORS`.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

### Linha 125 — U14

**Fonte:** `  scope.MangaTranslatorGeminiSelectors = api;`

**O que faz:** Publica a API no global consumido por `dom.js` e `observer.js` no browser.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

### Linha 126 — U14

**Fonte:** ␠ [linha vazia]

**O que faz:** Linha vazia que separa visualmente a unidade U14 (Export browser/CommonJS) sem alterar o objeto exportado.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

### Linha 127 — U14

**Fonte:** `  if (typeof module !== 'undefined' && module.exports) {`

**O que faz:** Detecta CommonJS para oferecer a mesma API aos testes Jest.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

### Linha 128 — U14

**Fonte:** `    module.exports = api;`

**O que faz:** Exporta exatamente o mesmo objeto `api` no ambiente CommonJS.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

### Linha 129 — U14

**Fonte:** `  }`

**O que faz:** Fecha o bloco CommonJS sem efeito no browser que não possui `module.exports`.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

### Linha 130 — U14

**Fonte:** `})(typeof self !== 'undefined' ? self : globalThis);`

**O que faz:** Fecha a IIFE escolhendo `self` quando existe e `globalThis` como fallback.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

### Linha 131 — U14

**Fonte:** ␠ [linha vazia]

**O que faz:** Representa o newline terminal da fonte e fecha a contagem física 131/131.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que foi implementado dessa forma:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

## 14. Análise por unidade

### U01 — linhas 1–7 — Contrato e política de seleção

**O que faz:** Ativa modo estrito e documenta a política: preferir seletores específicos/acessíveis antes de fallback semântico; deep scan não deve ser primeira fonte de verdade para estados críticos.

**Como faz:** O comentário estabelece intenção arquitetural antes da IIFE; não executa busca por si mesmo.

**Por que assim:** RPA sobre UI mutável precisa separar seletor forte de heurística ampla para reduzir falso positivo.

**Alternativa pior:** Usar deep scan sem prioridade/ownership pode confundir mensagens do usuário, respostas do modelo e controles adjacentes.

### U02 — linhas 8–9 — IIFE e mapa imutável

**O que faz:** Abre escopo do módulo e cria `SELECTORS` com `Object.freeze`.

**Como faz:** A IIFE recebe `self/globalThis`; todas as entradas são strings finais, porque arrays são imediatamente unidos.

**Por que assim:** Um mapa compartilhado e congelado reduz drift/acidental mutation entre DOM e Observer.

**Alternativa pior:** Constantes mutáveis espalhadas pelos módulos poderiam divergir durante uma mesma execução e alterar critérios críticos de ownership.

### U03 — linhas 10–16 — INPUT

**O que faz:** Agrupa seletores de elemento editável, do mais específico (`rich-textarea`) ao fallback genérico `[contenteditable=true]`.

**Como faz:** Quatro alternativas são unidas em uma única lista CSS por vírgula.

**Por que assim:** Mantém compatibilidade com versões Quill e wrappers acessíveis do Gemini.

**Alternativa pior:** Começar pelo fallback genérico pode casar editores fora do composer; depender só de Quill falha quando o markup muda.

### U04 — linhas 17–22 — EDITOR_ROOT

**O que faz:** Define possíveis raízes editoriais/composer.

**Como faz:** Combina `rich-textarea`, `.ql-editor` e contenteditable.

**Por que assim:** Permite representar wrapper e editor concreto em um único contrato central.

**Alternativa pior:** Assumir uma única raiz torna foco/dispatch frágeis sob re-renderizações.

### U05 — linhas 23–34 — SEND

**O que faz:** Define controles explícitos de envio em inglês/português, por classe, aria-label e testid.

**Como faz:** Mistura matches exatos e contains case-insensitive para variações acessíveis/localizadas.

**Por que assim:** O submit é estado crítico; seletores reconhecíveis são preferíveis a escolher botão por posição.

**Alternativa pior:** Selecionar qualquer botão com texto 'send' pode atingir feedback ou controles semânticos não relacionados.

### U06 — linhas 35–42 — STOP

**O que faz:** Define controles que indicam geração em andamento/parada disponível.

**Como faz:** Aceita aria-label Stop/Parar/Interromper e testids específicos.

**Por que assim:** Observer/dom usam Stop como sinal operacional; localização não pode quebrar o detector.

**Alternativa pior:** Um seletor inglês único falha em UI localizada; seletor genérico de botão gera falsos positivos.

### U07 — linhas 43–58 — MODEL_RESPONSE_STRICT

**O que faz:** Define a allowlist forte de containers que podem estabelecer ownership de resposta automática do modelo.

**Como faz:** Usa atributos explícitos de autoria/role, tags model-response/bard-model-response, testids e classes específicas de resposta.

**Por que assim:** Resultados de imagem só podem ser atribuídos ao job depois de ligar a mídia a um turno de modelo confiável.

**Alternativa pior:** Usar wrappers genéricos como `message-content` sozinho pode aceitar conteúdo do usuário e causar entrega de imagem errada.

### U08 — linhas 59–79 — RESPONSE compatível

**O que faz:** Define conjunto mais amplo de containers de resposta para helpers auxiliares, explicitamente não suficiente sozinho para ownership.

**Como faz:** Inclui a base strict e fallbacks mais genéricos como `.response-container`, `.model-turn`, `message-content` e wrappers assistant.

**Por que assim:** Funções não críticas podem precisar reconhecer layouts antigos/alternativos sem enfraquecer o Observer strict.

**Alternativa pior:** Reutilizar esta lista ampla para ownership apagaria a fronteira de confiança documentada nas linhas 59–60.

### U09 — linhas 80–92 — USER_TURN

**O que faz:** Identifica containers pertencentes ao turno do usuário.

**Como faz:** Combina tags user-query, atributos de role/author, testids e classes de mensagem do usuário.

**Por que assim:** DOM/Observer precisam excluir imagens clonadas/input do usuário da seleção do resultado gerado.

**Alternativa pior:** Sem classificação de user turn, uma imagem enviada originalmente pode ser confundida com resposta traduzida.

### U10 — linhas 93–98 — ERROR

**O que faz:** Define superfícies de erro do Gemini observáveis pelo Observer.

**Como faz:** Cobre classes de erro e `[role=alert]` acessível.

**Por que assim:** Falhas de UI devem abortar waiters em vez de parecer timeout ou sucesso.

**Alternativa pior:** Ignorar role=alert perderia erros acessíveis sem classe estável; aceitar qualquer texto vermelho seria heurística frágil.

### U11 — linhas 99–100 — FILE_INPUT

**O que faz:** Expõe seletor canônico para input de arquivo.

**Como faz:** Usa o seletor HTML direto `input[type=file]`.

**Por que assim:** Serve como contrato nominal para upload, embora o `attachment.js` atual faça descoberta própria mais estrita.

**Alternativa pior:** Duplicar seletores sem consumidor comum cria risco de drift; este é precisamente um ponto de dívida atual.

### U12 — linhas 101–113 — ATTACHMENT_CONTAINER

**O que faz:** Agrupa containers conhecidos de preview/anexo.

**Como faz:** Combina tags customizadas, testids de attachment/preview e classes recorrentes.

**Por que assim:** A intenção é centralizar variações do markup de preview.

**Alternativa pior:** Como `attachment.js` atualmente mantém sua própria lista equivalente, alterações em apenas um dos dois locais podem causar divergência funcional.

### U13 — linhas 114–123 — INPUT_AREA

**O que faz:** Define wrappers de região do composer usados como referência espacial/semântica.

**Como faz:** Inclui rich-textarea, input-area, chat-window e wrappers de chat/input.

**Por que assim:** `dom.findSendButton` usa a área para fallback geométrico quando sinais semânticos falham.

**Alternativa pior:** Fallback geométrico sem delimitação do composer pode escolher controles de outras regiões da página; `chat-window` também é amplo e deve ser usado com cuidado em ownership.

### U14 — linhas 124–131 — Export browser/CommonJS

**O que faz:** Fecha o mapa, publica `MangaTranslatorGeminiSelectors`, exporta a mesma API em CommonJS e encerra a IIFE/newline.

**Como faz:** `api` referencia o objeto congelado; browser usa global e Jest usa `module.exports`.

**Por que assim:** Manifest e testes executam a mesma definição de seletores sem duas fontes de verdade.

**Alternativa pior:** Ter export separado para testes permitiria suites verdes sobre seletores diferentes dos carregados no content script.

## 15. Auditoria interna antes do fechamento

- [x] Reserva pertence a `GPT-5.6-Sol#C`.
- [x] SHA reservado e SHA atual: `0bf8db6e416a880de9f4dd37bd4cc290e5aaba19`.
- [x] Fonte integral copiada sem abreviação.
- [x] 130 linhas textuais + newline final = 131/131 headings sequenciais.
- [x] Manifest e gate estrutural conferidos quanto à ordem de carga.
- [x] Consumers reais em `dom.js` e `observer.js` verificados.
- [x] Assertions diretas de `dom-modules.test.js` lidas.
- [x] Observer real separado de prova direta do conteúdo da tabela.
- [x] Chaves sem consumer atual registradas como dívida/lacuna.
- [x] Invariantes, segurança e riscos registrados.
- [x] Nenhum código funcional alterado.

**Veredito interno:** documentação completa para o SHA `0bf8db6e416a880de9f4dd37bd4cc290e5aaba19`; a promoção para `✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA` depende da futura seção crítica compartilhada.

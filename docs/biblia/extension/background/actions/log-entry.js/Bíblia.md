# Bíblia técnica — `extension/background/actions/log-entry.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `d57e1a25531beca36510928564ffd855f607881b`  
> **Linhas textuais:** **50**  
> **Posições documentais:** **51** contando newline final

## Papel arquitetural

`log-entry.js` é o adaptador IPC que recebe `LOG_ENTRY` de content scripts e encaminha os campos para o logger central do background. Ele não persiste logs por conta própria; sua responsabilidade é validar o envelope e chamar `context.log(...)`.

Os emissores reais incluem `content_manga.js` e `content_gemini.js`, que usam `LOG_ENTRY` para telemetria e diagnóstico de etapas do fluxo.

## Validação

Os campos `level`, `source`, `action_name` e `detail` são opcionais, mas quando aparecem precisam ser strings.

`extra` também é opcional. Quando informado, precisa ser um objeto não-nulo e não pode ser array.

A validação **não** impõe:
- enums para level/source;
- tamanho máximo para detail;
- profundidade/tamanho máximo de extra;
- plain-object obrigatório;
- chaves permitidas em extra.

Esses limites permanecem responsabilidade do contrato de logging e dos emissores.

## Relação com o logger central

O `context.log` usado pelo background aponta para `MangaTranslatorLog.log`. O logger central:

1. enfileira a entrada sincronamente;
2. aplica defaults como `info`, `bg`, `UNKNOWN` e objeto vazio;
3. inicia `_flushLog()` assíncrono;
4. persiste em `chrome.storage.local.translatorLog`;
5. mantém no máximo 500 entradas;
6. captura silenciosamente erros de storage.

Por isso a resposta síncrona `{ok:true}` desta action significa **entrada aceita/encaminhada**, não prova de persistência durável no storage.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `tests/unit/background/actions-low-risk.test.js` | ✅ PROVADO DIRETAMENTE | A action real encaminha os cinco argumentos ao logger central e retorna em canal síncrono. |
| `tests/unit/background/routed-actions-legacy.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | LOG_ENTRY passa pelo roteador real e mantém resposta `{ok:true}`. |
| `extension/background/log.js` | 🟨 DEPENDÊNCIA REAL | Queue, defaults, flush assíncrono, retenção de 500 e swallow de erro de storage. |
| `content_manga.js` / `content_gemini.js` | 🟨 EMISSORES REAIS | Produzem mensagens LOG_ENTRY em fluxos de manga/Gemini. |

## Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para cada campo string receber número/boolean/null.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `extra:null`, array, string ou número.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `MangaTranslatorRouter` ausente no carregamento desta action.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `context.log` lançar sincronicamente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para popup/external source, apesar de `allowedSources:['any']`.
- ⚠️ Não há limites de payload/metadata no validator local.
- ⚠️ A persistência do log é assíncrona e falhas de storage são absorvidas em `background/log.js`.

## Invariantes

1. Payload de log inválido deve falhar antes de `context.log`.
2. Campos ausentes são permitidos.
3. Campos string presentes não são normalizados pela action.
4. `extra` precisa ser objeto não-array quando presente.
5. O logger recebe exatamente `level, source, action_name, detail, extra`.
6. A action é síncrona para o router.
7. `ok:true` não deve ser interpretado como ACK de persistência em storage.
8. A action não deve conhecer a implementação de retenção/flush do logger.

## Fonte integral

~~~javascript
'use strict';
// background/actions/log-entry.js — Encaminha entradas legadas ao logger central.

(function(scope) {
  if (!scope.MangaTranslatorRouter ||
      typeof scope.MangaTranslatorRouter.registerAction !== 'function') {
    throw new Error('MangaTranslatorRouter indisponível para registrar log-entry');
  }

  function validate(request) {
    const optionalStringFields = ['level', 'source', 'action_name', 'detail'];
    for (const field of optionalStringFields) {
      if (request[field] !== undefined && typeof request[field] !== 'string') {
        return {
          code: 'INVALID_PAYLOAD',
          message: field + ' deve ser uma string quando informado',
        };
      }
    }

    if (request.extra !== undefined &&
        (request.extra === null || Array.isArray(request.extra) || typeof request.extra !== 'object')) {
      return {
        code: 'INVALID_PAYLOAD',
        message: 'extra deve ser um objeto quando informado',
      };
    }

    return null;
  }

  scope.MangaTranslatorRouter.registerAction({
    name: 'log-entry',
    meta: {
      async: false,
      // Mantém compatibilidade com todos os emissores autorizados pelo contrato atual de logging.
      allowedSources: ['any'],
    },
    validate,
    execute(request, context) {
      context.log(
        request.level,
        request.source,
        request.action_name,
        request.detail,
        request.extra
      );
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 51/51

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/log-entry.js — Encaminha entradas legadas ao logger central. | Comentário de compatibilidade: background/actions/log-entry.js — Encaminha entradas legadas ao logger central.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: `(function(scope) {`. |
| 005 | U02 |   if (!scope.MangaTranslatorRouter \|\| | Verifica se o router global existe. |
| 006 | U02 |       typeof scope.MangaTranslatorRouter.registerAction !== 'function') { | Exige API de registro utilizável. |
| 007 | U02 |     throw new Error('MangaTranslatorRouter indisponível para registrar log-entry'); | Falha cedo se o bootstrap não carregou o router. |
| 008 | U02 |   } | Fecha estrutura sintática da unidade U02. |
| 009 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 010 | U03 |   function validate(request) { | Abre o validator do payload de log. |
| 011 | U03 |     const optionalStringFields = ['level', 'source', 'action_name', 'detail']; | Define os quatro campos opcionais que, quando presentes, devem ser strings. |
| 012 | U03 |     for (const field of optionalStringFields) { | Define os quatro campos opcionais que, quando presentes, devem ser strings. |
| 013 | U03 |       if (request[field] !== undefined && typeof request[field] !== 'string') { | Permite ausência, mas rejeita tipo diferente de string. |
| 014 | U03 |         return { | Parte da expressão da unidade U03: `return {`. |
| 015 | U03 |           code: 'INVALID_PAYLOAD', | Classifica violação de tipo como payload inválido. |
| 016 | U03 |           message: field + ' deve ser uma string quando informado', | Constrói mensagem específica com o nome do campo. |
| 017 | U03 |         }; | Fecha estrutura sintática da unidade U03. |
| 018 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 019 | U03 |     } | Fecha estrutura sintática da unidade U03. |
| 020 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 021 | U03 |     if (request.extra !== undefined && | Valida `extra` apenas quando informado. |
| 022 | U03 |         (request.extra === null \|\| Array.isArray(request.extra) \|\| typeof request.extra !== 'object')) { | Rejeita null para preservar contrato de objeto. |
| 023 | U03 |       return { | Parte da expressão da unidade U03: `return {`. |
| 024 | U03 |         code: 'INVALID_PAYLOAD', | Classifica violação de tipo como payload inválido. |
| 025 | U03 |         message: 'extra deve ser um objeto quando informado', | Mensagem estável para metadata inválida. |
| 026 | U03 |       }; | Fecha estrutura sintática da unidade U03. |
| 027 | U03 |     } | Fecha estrutura sintática da unidade U03. |
| 028 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 029 | U03 |     return null; | Indica payload válido ao router. |
| 030 | U03 |   } | Fecha estrutura sintática da unidade U03. |
| 031 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 032 | U04 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action. |
| 033 | U04 |     name: 'log-entry', | Nome canônico do alias LOG_ENTRY. |
| 034 | U04 |     meta: { | Parte da expressão da unidade U04: `meta: {`. |
| 035 | U04 |       async: false, | Faz o router responder sincronicamente após execute. |
| 036 | U04 |       // Mantém compatibilidade com todos os emissores autorizados pelo contrato atual de logging. | Comentário de compatibilidade: Mantém compatibilidade com todos os emissores autorizados pelo contrato atual de logging.. |
| 037 | U04 |       allowedSources: ['any'], | Não restringe categoria de origem no router. |
| 038 | U04 |     }, | Fecha estrutura sintática da unidade U04. |
| 039 | U04 |     validate, | Associa o validator definido acima. |
| 040 | U04 |     execute(request, context) { | Abre o encaminhamento síncrono ao logger do context. |
| 041 | U05 |       context.log( | Chama o logger central injetado pelo background/router. |
| 042 | U05 |         request.level, | Encaminha level sem transformação adicional. |
| 043 | U05 |         request.source, | Encaminha source sem transformação adicional. |
| 044 | U05 |         request.action_name, | Mapeia action_name do payload para o terceiro argumento do logger. |
| 045 | U05 |         request.detail, | Encaminha detail. |
| 046 | U05 |         request.extra | Encaminha metadata extra como quinto argumento. |
| 047 | U05 |       ); | Fecha estrutura sintática da unidade U05. |
| 048 | U05 |     }, | Fecha estrutura sintática da unidade U05. |
| 049 | U06 |   }); | Fecha estrutura sintática da unidade U06. |
| 050 | U06 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 051 | U07 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e intenção de compatibilidade com entradas legadas.

### U02 — Fail-fast do router
Impede registro silenciosamente incompleto quando o bootstrap não disponibilizou o router.

### U03 — Validação do envelope
Valida tipos dos campos opcionais e a estrutura básica de `extra`.

### U04 — Registro e metadados
Marca a action como síncrona, associa o validator e mantém origem ampla.

### U05 — Encaminhamento ao logger
Não transforma dados: apenas chama `context.log` com os cinco argumentos.

### U06 — Fechamento
Fecha action e IIFE.

### U07 — Newline final
Posição editorial usada para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 50 linhas + newline = 51/51 posições;
- [x] happy path ligado a assertions reais;
- [x] validator não testado foi mantido como lacuna;
- [x] persistência assíncrona diferenciada do ACK síncrono;
- [x] emissores reais e logger central verificados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `d57e1a25531beca36510928564ffd855f607881b`.

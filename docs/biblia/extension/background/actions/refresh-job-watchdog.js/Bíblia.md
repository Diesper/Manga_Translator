# Bíblia técnica — `extension/background/actions/refresh-job-watchdog.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `25f86a8dba57c25a11a234c8f1ded0c3871d2aaa`  
> **Linhas textuais:** **86**  
> **Posições documentais:** **87** contando newline final  
> **Teste direto:** `tests/unit/background/refresh-job-watchdog-action.test.js` — `d2acd697b78872400a16bfdac3a4866446d2239f`

## Papel arquitetural

Esta action reinicia o prazo do watchdog **quando o `job-runner` observa que a geração realmente começou**. O objetivo é não consumir o timeout com abertura da aba, upload/attachment e submit.

Ela não confia em ids de destino enviados pelo request. O request relevante contém apenas `jobId`; `mangaTabId`, `index` e `geminiTabId` usados no rearme vêm do `state.jobIndex` durável.

## Fluxo de segurança/ownership

1. O router só aceita source classificada como `gemini`.
2. O estado é reidratado via `ensureInitialized()` quando disponível.
3. O sender tabId vem de `context.sender.tab.id`.
4. O job é localizado no `jobIndex` pelo jobId.
5. Sender e `indexed.geminiTabId` são canonicalizados por `TabIdentity` quando disponível.
6. Os ids canônicos precisam coincidir.
7. Só então `armWatchdog` recebe os dados persistidos do índice.

Essa dupla checagem é mais forte do que confiar nos campos do payload e continua funcionando quando uma aba Gemini foi substituída e existe alias canônico.

## Integração com o job-runner

`job-runner.js` envia `REFRESH_JOB_WATCHDOG` apenas na primeira notificação `generation_started`, protegido por `watchdogRefreshRequested`. A mensagem contém somente `{action, jobId}`.

`job-runner.test.js` prova que exatamente uma mensagem de refresh é emitida e que a resposta mockada `{ok:true, refreshed:true}` gera log de confirmação. Esse teste prova o **consumidor**, não a implementação interna desta action.

## Relação com jobs-watchdog.js

`armWatchdog(mangaTabId,index,geminiTabId,jobId)` limpa o alarme anterior, persiste `wd_data_<tabId>`, cria novo alarme e re-resolve o tabId após a escrita para fechar uma corrida com `tabs.onReplaced`. O helper devolve o tabId canônico final, que esta action retorna ao caller.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `refresh-job-watchdog-action.test.js` | ✅ PROVADO DIRETAMENTE | Inicialização, dados vindos do jobIndex, armWatchdog com ids corretos, resposta de sucesso e rejeição de sender que não possui o job. |
| `job-runner.test.js` | ✅ PROVA DO CONSUMIDOR | `generation_started` gera exatamente um REFRESH_JOB_WATCHDOG com jobId e interpreta ACK de refresh. |
| `jobs-watchdog.js` | 🟨 DEPENDÊNCIA REAL | Persistência do watchdog, alarme e reconciliação de tab replacement dentro de `arm`. |
| `tab-identity.js` | 🟨 DEPENDÊNCIA REAL | Resolve aliases canônicos de abas com proteção de ciclo/TTL/hops. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `jobId` de tipo não-string mas truthy; o validator atual só testa presença/truthiness.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `jobIndex` ausente/não-array ou jobId não encontrado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para sender sem `tab`/id.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `armWatchdog` ausente ou rejeitando.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `ensureInitialized()` rejeitando.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para TabIdentity ausente e uso do fallback identity.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para aliases reais em que sender antigo e indexed novo convergem ao mesmo id canônico.
- ⚠️ A comparação usa `String(canonicalSender) === String(canonicalIndexed)`, portanto valores numericamente/textualmente equivalentes podem ser tratados como iguais.
- ⚠️ O logger é opcional; não há assertion focal sobre `JOB_WATCHDOG_REFRESH`.
- ⚠️ A classificação `gemini` do router é apenas a primeira barreira; a ownership pelo jobIndex/tab canônico é a autoridade decisiva.

## Invariantes

1. JobId ausente deve falhar antes do executor.
2. Dados de manga/index/Gemini usados no rearme devem vir do jobIndex, não do request.
3. Sender sem aba deve falhar.
4. Job não indexado deve falhar.
5. Sender canônico precisa ser igual ao tab canônico do job.
6. `armWatchdog` só é chamado depois da ownership.
7. A resposta usa o tabId devolvido pelo helper, não necessariamente o id original.
8. O refresh do consumidor deve ocorrer uma vez por início de geração observado.

## Fonte integral

~~~javascript
'use strict';
// background/actions/refresh-job-watchdog.js
//
// Recomeça o prazo do watchdog quando o content script confirma que a geração
// realmente começou. Isso evita consumir o timeout com abertura da aba,
// attachment e submit, mantendo ownership estrito pelo jobId/aba Gemini.

(function(scope) {
  if (!scope.MangaTranslatorRouter ||
      typeof scope.MangaTranslatorRouter.registerAction !== 'function') {
    throw new Error('MangaTranslatorRouter indisponível para registrar refresh-job-watchdog');
  }

  function validate(request) {
    if (!request || !request.jobId) {
      return { code: 'INVALID_PAYLOAD', message: 'jobId ausente' };
    }
    return null;
  }

  scope.MangaTranslatorRouter.registerAction({
    name: 'refresh-job-watchdog',
    meta: {
      allowedSources: ['gemini'],
    },
    validate,
    async execute(request, context) {
      if (typeof context.ensureInitialized === 'function') {
        await context.ensureInitialized();
      }
      if (typeof context.armWatchdog !== 'function') {
        throw new Error('armWatchdog indisponível');
      }

      const senderTabId = context.sender && context.sender.tab
        ? context.sender.tab.id
        : null;
      if (senderTabId === null || senderTabId === undefined) {
        throw new Error('Aba remetente ausente');
      }

      const entries = Array.isArray(context.state && context.state.jobIndex)
        ? context.state.jobIndex
        : [];
      const indexed = entries.find(entry => entry && entry.jobId === request.jobId);
      if (!indexed) {
        throw new Error('Job não encontrado no índice durável');
      }

      const resolveCanonical = context.tabIdentity &&
        typeof context.tabIdentity.resolveCanonicalTabId === 'function'
          ? tabId => context.tabIdentity.resolveCanonicalTabId(tabId)
          : async tabId => tabId;

      const canonicalSender = await resolveCanonical(senderTabId);
      const canonicalIndexed = await resolveCanonical(indexed.geminiTabId);
      if (String(canonicalSender) !== String(canonicalIndexed)) {
        throw new Error('Aba remetente não é dona do job');
      }

      const refreshedTabId = await context.armWatchdog(
        indexed.mangaTabId,
        indexed.index,
        canonicalIndexed,
        indexed.jobId
      );

      context.log?.(
        'info',
        'bg',
        'JOB_WATCHDOG_REFRESH',
        'Watchdog reiniciado a partir do início real da geração',
        {
          index: indexed.index,
          geminiTabId: refreshedTabId,
          jobIdPrefix: String(indexed.jobId).slice(0, 8),
        }
      );

      return {
        refreshed: true,
        geminiTabId: refreshedTabId,
      };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 87/87

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/refresh-job-watchdog.js | Comentário arquitetural: background/actions/refresh-job-watchdog.js. |
| 003 | U01 | // | Comentário arquitetural: . |
| 004 | U01 | // Recomeça o prazo do watchdog quando o content script confirma que a geração | Comentário arquitetural: Recomeça o prazo do watchdog quando o content script confirma que a geração. |
| 005 | U01 | // realmente começou. Isso evita consumir o timeout com abertura da aba, | Comentário arquitetural: realmente começou. Isso evita consumir o timeout com abertura da aba,. |
| 006 | U01 | // attachment e submit, mantendo ownership estrito pelo jobId/aba Gemini. | Comentário arquitetural: attachment e submit, mantendo ownership estrito pelo jobId/aba Gemini.. |
| 007 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 008 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 009 | U02 |   if (!scope.MangaTranslatorRouter \|\| | Verifica presença do router global. |
| 010 | U02 |       typeof scope.MangaTranslatorRouter.registerAction !== 'function') { | Exige API de registro válida. |
| 011 | U02 |     throw new Error('MangaTranslatorRouter indisponível para registrar refresh-job-watchdog'); | Falha cedo se bootstrap do router estiver incompleto. |
| 012 | U02 |   } | Fecha estrutura sintática da unidade U02. |
| 013 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 014 | U03 |   function validate(request) { | Abre validator do request. |
| 015 | U03 |     if (!request \|\| !request.jobId) { | Exige jobId truthy; não exige tipo string. |
| 016 | U03 |       return { code: 'INVALID_PAYLOAD', message: 'jobId ausente' }; | Retorna INVALID_PAYLOAD para jobId ausente/falsy. |
| 017 | U03 |     } | Fecha estrutura sintática da unidade U03. |
| 018 | U03 |     return null; | Indica validação bem-sucedida. |
| 019 | U03 |   } | Fecha estrutura sintática da unidade U03. |
| 020 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 021 | U04 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action. |
| 022 | U04 |     name: 'refresh-job-watchdog', | Nome canônico do alias REFRESH_JOB_WATCHDOG. |
| 023 | U04 |     meta: { | Parte da expressão da unidade U04: meta: { |
| 024 | U04 |       allowedSources: ['gemini'], | Restringe a source classificada pelo router a gemini. |
| 025 | U04 |     }, | Fecha estrutura sintática da unidade U04. |
| 026 | U04 |     validate, | Parte da expressão da unidade U04: validate, |
| 027 | U04 |     async execute(request, context) { | Abre executor assíncrono. |
| 028 | U04 |       if (typeof context.ensureInitialized === 'function') { | Reidrata estado quando o helper está disponível. |
| 029 | U04 |         await context.ensureInitialized(); | Aguarda inicialização antes de consultar jobIndex. |
| 030 | U04 |       } | Fecha estrutura sintática da unidade U04. |
| 031 | U04 |       if (typeof context.armWatchdog !== 'function') { | Exige helper de rearme injetado pelo background. |
| 032 | U04 |         throw new Error('armWatchdog indisponível'); | Falha explicitamente sem a dependência principal. |
| 033 | U05 |       } | Fecha estrutura sintática da unidade U05. |
| 034 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 035 | U05 |       const senderTabId = context.sender && context.sender.tab | Deriva tabId da sender real, não do payload. |
| 036 | U05 |         ? context.sender.tab.id | Obtém id da aba remetente quando existe. |
| 037 | U05 |         : null; | Parte da expressão da unidade U05: : null; |
| 038 | U05 |       if (senderTabId === null \|\| senderTabId === undefined) { | Rejeita sender sem aba identificável. |
| 039 | U05 |         throw new Error('Aba remetente ausente'); | Erro explícito para ausência de sender tab. |
| 040 | U05 |       } | Fecha estrutura sintática da unidade U05. |
| 041 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 042 | U05 |       const entries = Array.isArray(context.state && context.state.jobIndex) | Normaliza jobIndex para array; valor inválido vira lista vazia. |
| 043 | U05 |         ? context.state.jobIndex | Lê o índice durável reidratado do background. |
| 044 | U05 |         : []; | Parte da expressão da unidade U05: : []; |
| 045 | U05 |       const indexed = entries.find(entry => entry && entry.jobId === request.jobId); | Procura entry pelo jobId do request. |
| 046 | U05 |       if (!indexed) { | Bloqueia refresh quando o job não está no índice. |
| 047 | U05 |         throw new Error('Job não encontrado no índice durável'); | Erro explícito para job ausente/stale. |
| 048 | U05 |       } | Fecha estrutura sintática da unidade U05. |
| 049 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 050 | U06 |       const resolveCanonical = context.tabIdentity && | Seleciona resolver de alias de tab quando disponível. |
| 051 | U06 |         typeof context.tabIdentity.resolveCanonicalTabId === 'function' | Confirma API de canonicalização. |
| 052 | U06 |           ? tabId => context.tabIdentity.resolveCanonicalTabId(tabId) | Usa TabIdentity para resolver substituições de aba. |
| 053 | U06 |           : async tabId => tabId; | Fallback identity quando TabIdentity não foi injetado. |
| 054 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 055 | U06 |       const canonicalSender = await resolveCanonical(senderTabId); | Resolve a aba remetente para id canônico. |
| 056 | U06 |       const canonicalIndexed = await resolveCanonical(indexed.geminiTabId); | Resolve a aba Gemini do jobIndex para id canônico. |
| 057 | U06 |       if (String(canonicalSender) !== String(canonicalIndexed)) { | Resolve a aba remetente para id canônico. |
| 058 | U06 |         throw new Error('Aba remetente não é dona do job'); | Rejeita sender cujo id canônico diverge do job. |
| 059 | U06 |       } | Fecha estrutura sintática da unidade U06. |
| 060 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 061 | U06 |       const refreshedTabId = await context.armWatchdog( | Rearma o watchdog usando dados autoritativos do jobIndex. |
| 062 | U07 |         indexed.mangaTabId, | Usa mangaTabId persistido, ignorando eventual campo homônimo do request. |
| 063 | U07 |         indexed.index, | Usa index persistido do job. |
| 064 | U07 |         canonicalIndexed, | Resolve a aba Gemini do jobIndex para id canônico. |
| 065 | U07 |         indexed.jobId | Usa o jobId persistido ao armar o alarme. |
| 066 | U07 |       ); | Fecha estrutura sintática da unidade U07. |
| 067 | U07 | ␠ [linha vazia] | Separador visual da unidade U07. |
| 068 | U07 |       context.log?.( | Emite telemetria somente se logger existe. |
| 069 | U08 |         'info', | Classifica o refresh bem-sucedido como info. |
| 070 | U08 |         'bg', | Parte da expressão da unidade U08: 'bg', |
| 071 | U08 |         'JOB_WATCHDOG_REFRESH', | Nome do evento de telemetria do background. |
| 072 | U08 |         'Watchdog reiniciado a partir do início real da geração', | Mensagem explica que o prazo começa no início real da geração. |
| 073 | U08 |         { | Parte da expressão da unidade U08: { |
| 074 | U08 |           index: indexed.index, | Loga o índice persistido. |
| 075 | U08 |           geminiTabId: refreshedTabId, | Loga/retorna o id efetivamente usado pelo helper após possível migração. |
| 076 | U08 |           jobIdPrefix: String(indexed.jobId).slice(0, 8), | Loga somente prefixo de oito caracteres do jobId. |
| 077 | U08 |         } | Fecha estrutura sintática da unidade U08. |
| 078 | U08 |       ); | Fecha estrutura sintática da unidade U08. |
| 079 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 080 | U08 |       return { | Abre resposta de sucesso da action. |
| 081 | U08 |         refreshed: true, | Marca que o rearme concluiu. |
| 082 | U08 |         geminiTabId: refreshedTabId, | Loga/retorna o id efetivamente usado pelo helper após possível migração. |
| 083 | U09 |       }; | Fecha estrutura sintática da unidade U09. |
| 084 | U09 |     }, | Fecha estrutura sintática da unidade U09. |
| 085 | U09 |   }); | Fecha estrutura sintática da unidade U09. |
| 086 | U09 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 087 | U10 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho e intenção
Explica por que o deadline é reiniciado no início real da geração.

### U02 — Fail-fast do router
Exige MangaTranslatorRouter antes do registro.

### U03 — Validação de jobId
Bloqueia request sem jobId, mas não restringe seu tipo.

### U04 — Registro, inicialização e dependências
Restringe source a Gemini, reidrata estado e exige armWatchdog.

### U05 — Sender e jobIndex durável
Obtém a aba remetente e localiza o job no índice persistido/reidratado.

### U06 — Canonicalização e ownership
Resolve aliases e compara a sender real com a dona persistida do job.

### U07 — Rearmamento
Usa somente dados do índice para rearmar o watchdog.

### U08 — Telemetria e resposta
Registra o refresh e devolve o tabId final do helper.

### U09 — Fechamento
Fecha executor/action/IIFE.

### U10 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 86 linhas + newline = 87/87;
- [x] ownership ligada a assertions diretas;
- [x] consumer e helpers separados da prova da action;
- [x] campos do request não-autoritativos documentados;
- [x] lacunas de aliases/dependências/validator explicitadas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `25f86a8dba57c25a11a234c8f1ded0c3871d2aaa`.

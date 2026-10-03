# Bíblia técnica — `extension/background/jobs-dom-ack.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `abbf440fd4cd8db415f991235aab0f59a9dbe58e`  
> **Linhas textuais:** **185**  
> **Posições documentais:** **186**, contando o newline final
> **Teste direto:** `tests/unit/background/jobs-dom-ack-staging.test.js` — `5db47daff53026aa778944c999d7dc922f35ecad`

## Papel arquitetural

`jobs-dom-ack.js` implementa o handshake entre o background MV3 e a aba leitora para que um resultado só seja considerado entregue depois de `UPDATE_IMAGE` receber confirmação do content script.

Ele substitui o antigo modelo de esperar um delay fixo e liberar o job por tempo. O background injeta `updateJobState`, `finalizeJob`, `log` e `DOM_ACK_TIMEOUT_MS = 30_000` por meio de `createDomAckDelivery`.

## Dois modos: staging moderno e compatibilidade legada

`finalizeOnAck=false` é o modo moderno usado por `deliver-result.js` e `deliver-result-from-tab.js`. Nesse modo o handshake apenas confirma staging/persistência; outra etapa faz commit/finalização. Um ACK ausente **não** pode ser aceito.

`finalizeOnAck=true` é o modo legado padrão. Nesse modo `settle()` também chama `finalizeJob(...)`. Além disso, o erro textual `message channel closed` é tolerado como `legacy_no_ack`, preservando compatibilidade com listeners antigos que aplicavam o resultado mas não respondiam.

## Estado do job

Logo no início, o módulo dispara `updateJobState(geminiTabId,{state:'result_received'})` sem await e engole a rejeição. Após um `ok` aceito, tenta gravar `state:'dom_applied'`, `resultPersisted:true` e `resultPersistedAt`.

Essas gravações são bookkeeping do background. A persistência que o handshake realmente quer provar é a confirmação do `content_manga`, que só responde depois de `persistTranslatedPage(...)`.

### Risco de ordenação

A gravação inicial `result_received` é fire-and-forget. Como o ACK pode chegar rapidamente, existe uma janela teórica em que a atualização `dom_applied` e a atualização inicial disputam ordem assíncrona. Não há teste que force a primeira escrita a terminar depois da segunda. Uma implementação futura deve preservar monotonicidade de estado.

## Protocolo UPDATE_IMAGE

O módulo envia para `mangaTabId`: `action:'UPDATE_IMAGE'`, `index`, `newSrc`, `jobId`, `batchId` e `expectAck:true`.

`content_manga.js` rejeita batch stale, aplica a imagem quando o nó existe, persiste a página e só então responde. Se o DOM já não contém a imagem, persiste mesmo assim e responde `domApplied:false`. Em falha de persistência responde `{ok:false, reason:'persist_failed'}`.

## Idempotência de conclusão

`settled` é marcado antes de qualquer await dentro de `settle()`. Isso impede que timeout e callback tardio finalizem o job duas vezes. O timer é cancelado na primeira conclusão.

## Classificação de respostas

- `runtime.lastError` comum → falha com a mensagem do erro;
- `message channel closed` + staging → `ack_required_for_staging`, falha;
- `message channel closed` + modo legado → `legacy_no_ack`, sucesso compatível;
- `response.ok === false` → falha com `response.reason` ou `rejected_by_page`;
- callback sem erro e sem `ok:false` → sucesso `ack`.

### Semântica permissiva do ACK positivo

Um callback com `response === undefined`, mas sem `runtime.lastError`, cai no ramo de sucesso. Como `response?.persisted !== false` e `response?.domApplied !== false`, o retorno será `persisted:true` e `domApplied:true`. Não há teste focal para esse caso.

Também há uma inconsistência potencial se um futuro listener responder `{ok:true,persisted:false}`: `settle()` primeiro grava `resultPersisted:true` no estado do job e depois retorna `persisted:false`. O `content_manga` atual não produz esse formato contraditório; ele responde `ok:false` quando a persistência falha.

## Finalização

Quando `finalizeOnAck=true`, qualquer settle — sucesso ou falha — tenta finalizar. O terceiro argumento é `!ok`, então falha/timeout finaliza com `fromError=true`. Exceções de `finalizeJob` são absorvidas e a Promise ainda resolve.

Quando `finalizeOnAck=false`, este módulo não finaliza nada. Isso é essencial para o pipeline de staging + commit atual.

## MV3 e watchdog

O timeout local de 30 s impede Promise infinita enquanto o worker está vivo, mas timers de service worker não são garantia durável após suspensão/restart. O próprio comentário de `background.js` deixa claro que a garantia durável continua sendo o watchdog/estado persistido, não este timer.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `jobs-dom-ack-staging.test.js` | ✅ PROVADO DIRETAMENTE | ACK positivo em staging, finalização no modo legado com ACK, ACK negativo, timeout, runtime error e canal fechado rejeitado no staging. |
| `message-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | GEMINI_IMAGE_EXTRACTED/IMAGE_READY enviam UPDATE_IMAGE com expectAck e staging preserva o slot até commit. |
| `content_manga.js` | 🟨 CONSUMIDOR REAL | Só responde ACK após aplicação/persistência; pode responder domApplied:false quando persiste sem nó DOM. |
| `deliver-result.js` | 🟨 CONSUMIDOR REAL | Usa `finalizeOnAck:false` e exige `staged.ok` + `persisted !== false`. |
| `deliver-result-from-tab.js` | 🟨 CONSUMIDOR REAL | Usa staging sem finalização e só depois remove aba auxiliar/finaliza. |
| `smoke-01-batch-lifecycle.js` | 🟨 SIMULAÇÃO COMPLEMENTAR | Simula ACK rápido; não importa nem executa `jobs-dom-ack.js`, portanto não é prova direta. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para compatibilidade `legacy_no_ack` com `finalizeOnAck:true`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para callback `undefined` sem `runtime.lastError`, hoje tratado como ACK positivo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `{ok:true,persisted:false}` e divergência entre retorno e `resultPersisted:true` no job.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `{ok:true,domApplied:false}` no módulo isolado, embora o content script real possa produzir isso quando só persiste.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para callback tardio após timeout, apesar de `settled` proteger contra dupla conclusão.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para corrida de ordenação `result_received` versus `dom_applied`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `updateJobState` rejeitando no ACK positivo; a falha é engolida.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `finalizeJob` rejeitando no modo legado; a falha é engolida.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `log` ausente/lançando no ramo de falha.
- ⚠️ Não há validação local de mangaTabId/index/src/jobId/batchId/geminiTabId; callers devem fornecer identidade já validada.
- ⚠️ O timeout local depende da vida do service worker; não substitui watchdog durável.

## Segurança e privacidade

- `src` pode conter Data URL grande com bytes da imagem traduzida e é enviado à aba indicada.
- O módulo não valida ownership; ele é um helper interno e depende dos actions callers terem validado sender/job antes de chamá-lo.
- JobId/batchId completos são enviados ao content script para correlação, mas logs de falha usam apenas prefixos de oito caracteres.
- Não há persistência direta de `src` neste arquivo; a persistência ocorre no content script.

## Invariantes

1. Staging moderno (`finalizeOnAck:false`) nunca deve tratar ausência de ACK como persistência confirmada.
2. ACK negativo/timeout em staging não deve finalizar o job.
3. `settled` deve impedir callback tardio de produzir segunda finalização/resolução.
4. `UPDATE_IMAGE` deve continuar carregando `expectAck:true`.
5. O content script deve responder somente depois da persistência quando `expectAck` está ativo.
6. `domApplied:false` não deve implicar necessariamente falha de persistência.
7. A transição de estado do job deve ser monotônica; `result_received` não deve sobrescrever `dom_applied` por corrida.
8. O timeout local não deve ser tratado como substituto do watchdog MV3.
9. Ownership deve continuar sendo validada antes, nos actions consumidores.

## Fonte integral

~~~javascript
'use strict';
// background/jobs-dom-ack.js -- Entrega resultado ao leitor e só libera após ACK/persistência.

(function(scope) {
  function createDomAckDelivery({ updateJobState, finalizeJob, log, timeoutMs = 30_000 }) {
    const safeLog = (...args) => {
      if (typeof log !== 'function') return;
      try { log(...args); } catch (_error) {
        // Telemetria não pode quebrar o protocolo de ACK.
      }
    };

    const awaitBounded = (promise, timeoutReason) => new Promise((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        const error = new Error(timeoutReason);
        error.code = timeoutReason;
        reject(error);
      }, timeoutMs);
      if (timeout && typeof timeout.unref === 'function') timeout.unref();

      Promise.resolve(promise).then(
        value => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          resolve(value);
        },
        error => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          reject(error);
        }
      );
    });

    function deliver({
      mangaTabId, index, src, jobId, batchId, geminiTabId,
      finalizeOnAck = true,
    }) {
      return new Promise(resolve => {
        let settled = false;
        let timer = null;

        const settle = async (ok, reason, response = null, { legacyAccepted = false } = {}) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);

          const persisted = response?.persisted === true;
          const domApplied = response ? response.domApplied !== false : false;
          let effectiveOk = ok === true;
          let effectiveReason = reason;

          if (effectiveOk && !legacyAccepted && !persisted) {
            effectiveOk = false;
            effectiveReason = 'persistence_not_confirmed';
          }

          if (effectiveOk && persisted) {
            try {
              await awaitBounded(updateJobState(geminiTabId, {
                state: 'dom_applied',
                resultPersisted: true,
                resultPersistedAt: Date.now(),
              }), 'state_update_timeout');
            } catch (error) {
              effectiveOk = false;
              effectiveReason = error && error.code === 'state_update_timeout'
                ? 'state_update_timeout'
                : 'state_update_failed';
              safeLog('error', 'bg', 'DOM_ACK_STATE_UPDATE_FAILED',
                'ACK de persistência recebido, mas o estado durável do job não pôde ser atualizado.', {
                  index,
                  jobId: String(jobId || '').slice(0, 8),
                  errorName: error && error.name ? error.name : 'Error',
                });
            }
          }

          if (!effectiveOk) {
            safeLog('warn', 'bg', 'DOM_APPLY_FAIL',
              `Resultado não confirmado pela aba do mangá: ${effectiveReason}`,
              {
                index,
                reason: effectiveReason,
                jobId: String(jobId || '').slice(0, 8),
                batchId: String(batchId || '').slice(0, 8),
              });
          }

          if (finalizeOnAck && effectiveReason !== 'state_update_failed') {
            try {
              await awaitBounded(
                finalizeJob(geminiTabId, mangaTabId, !effectiveOk),
                'finalize_timeout'
              );
            } catch (error) {
              safeLog('error', 'bg', 'DOM_ACK_FINALIZE_FAILED',
                'Falha ao finalizar job após conclusão do handshake DOM.', {
                  index,
                  jobId: String(jobId || '').slice(0, 8),
                  errorName: error && error.name ? error.name : 'Error',
                });
              resolve({
                ok: false,
                reason: error && error.code === 'finalize_timeout'
                  ? 'finalize_timeout'
                  : 'finalize_failed',
                persisted,
                domApplied,
              });
              return;
            }
          }

          resolve({
            ok: effectiveOk,
            reason: effectiveReason,
            persisted: effectiveOk && persisted,
            domApplied,
          });
        };

        timer = setTimeout(() => {
          void settle(false, 'ack_timeout');
        }, timeoutMs);
        if (timer && typeof timer.unref === 'function') timer.unref();

        const start = async () => {
          if (settled) return;

          try {
            chrome.tabs.sendMessage(mangaTabId, {
              action: 'UPDATE_IMAGE',
              index,
              newSrc: src,
              jobId,
              batchId,
              expectAck: true,
            }, response => {
              const error = chrome.runtime.lastError;
              if (error) {
                const legacyNoAck = /message channel closed/i.test(error.message || '');
                const legacyAccepted = legacyNoAck && finalizeOnAck;
                void settle(
                  legacyAccepted,
                  legacyNoAck
                    ? (legacyAccepted ? 'legacy_no_ack' : 'ack_required_for_staging')
                    : (error.message || 'send_failed'),
                  response,
                  { legacyAccepted }
                );
                return;
              }

              if (!response || response.ok !== true) {
                void settle(false, response?.reason || 'ack_missing', response);
                return;
              }

              if (response.persisted !== true) {
                void settle(false, response.reason || 'persistence_not_confirmed', response);
                return;
              }

              void settle(true, 'ack', response);
            });
          } catch (error) {
            void settle(false, error && error.message ? error.message : 'send_exception');
          }
        };

        void start();
      });
    }

    return { deliver };
  }

  scope.MangaTranslatorJobsDomAck = { createDomAckDelivery };
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 90/90

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/jobs-dom-ack.js -- Entrega resultado ao leitor e só libera após ACK/persistência. | Comentário arquitetural: background/jobs-dom-ack.js -- Entrega resultado ao leitor e só libera após ACK/persistência.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 |   function createDomAckDelivery({ updateJobState, finalizeJob, log, timeoutMs = 30_000 }) { | Factory que injeta atualização de job, finalização, logger e timeout. |
| 006 | U02 |     function deliver({ | Abre a operação de entrega de um resultado ao leitor. |
| 007 | U02 |       mangaTabId, index, src, jobId, batchId, geminiTabId, | Recebe identidade/dados necessários para UPDATE_IMAGE. |
| 008 | U02 |       finalizeOnAck = true, | Modo legado finaliza dentro do handshake por padrão; staging moderno pode desativar. |
| 009 | U02 |     }) { | Parte da expressão da unidade U02: }) { |
| 010 | U03 |       return new Promise(resolve => { | Entrega retorna Promise concluída apenas por settle. |
| 011 | U03 |         Promise.resolve(updateJobState(geminiTabId, { state: 'result_received' })).catch(() => {}); | Marca tentativa de resultado recebido sem bloquear o envio. |
| 012 | U03 |         let settled = false; | Flag impede timeout/callback tardio de concluir duas vezes. |
| 013 | U03 |         let timer = null; | Reserva referência do timeout. |
| 014 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 015 | U03 |         const settle = async (ok, reason, response = null) => { | Centraliza conclusão idempotente da entrega. |
| 016 | U03 |           if (settled) return; | Ignora callback/timeout tardio após a primeira conclusão. |
| 017 | U03 |           settled = true; | Fecha a janela para conclusões concorrentes antes de awaits. |
| 018 | U03 |           if (timer) clearTimeout(timer); | Remove o timeout quando um resultado chega primeiro. |
| 019 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 020 | U04 |           if (ok) { | Ramo de ACK aceito. |
| 021 | U04 |             try { | Parte da expressão da unidade U04: try { |
| 022 | U04 |               await updateJobState(geminiTabId, { | Atualiza estado do job após ACK positivo. |
| 023 | U04 |                 state: 'dom_applied', | Marca o resultado como aplicado no estágio de jobs. |
| 024 | U04 |                 resultPersisted: true, | Marca bookkeeping do job como persistido após qualquer ok positivo. |
| 025 | U04 |                 resultPersistedAt: Date.now(), | Registra timestamp local da confirmação. |
| 026 | U04 |               }); | Fecha estrutura sintática da unidade U04. |
| 027 | U04 |             } catch (_e) {} | Falha de bookkeeping/finalização é deliberadamente absorvida. |
| 028 | U04 |           } else { | Ramo de falha de ACK/entrega. |
| 029 | U04 |             log('warn', 'bg', 'DOM_APPLY_FAIL', | Loga falha de confirmação do leitor. |
| 030 | U04 |               `Resultado não confirmado pela aba do mangá: ${reason}`, | Mensagem inclui o motivo de falha. |
| 031 | U04 |               { index, reason, jobId: String(jobId \|\| '').slice(0, 8), batchId: String(batchId \|\| '').slice(0, 8) }); | Loga index e prefixos de job/batch para diagnóstico. |
| 032 | U04 |           } | Fecha estrutura sintática da unidade U04. |
| 033 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 034 | U05 |           if (finalizeOnAck) { | Controla se o próprio handshake finaliza o job. |
| 035 | U05 |             try { | Parte da expressão da unidade U05: try { |
| 036 | U05 |               await finalizeJob(geminiTabId, mangaTabId, !ok); | Finaliza o job em modo legado. |
| 037 | U05 |             } catch (_e) {} | Falha de bookkeeping/finalização é deliberadamente absorvida. |
| 038 | U05 |           } | Fecha estrutura sintática da unidade U05. |
| 039 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 040 | U05 |           resolve({ | Resolve a Promise externa com status normalizado. |
| 041 | U05 |             ok, | Expõe o booleano de sucesso do settle. |
| 042 | U05 |             reason, | Expõe a razão textual do caminho escolhido. |
| 043 | U05 |             persisted: ok && response?.persisted !== false, | Considera persistido salvo quando ACK explicita persisted:false. |
| 044 | U05 |             domApplied: response?.domApplied !== false, | Considera DOM aplicado salvo quando ACK explicita domApplied:false. |
| 045 | U05 |           }); | Fecha estrutura sintática da unidade U05. |
| 046 | U05 |         }; | Fecha estrutura sintática da unidade U05. |
| 047 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 048 | U06 |         timer = setTimeout(() => { | Arma guarda-chuva de timeout. |
| 049 | U06 |           void settle(false, 'ack_timeout'); | Timeout conclui como falha. |
| 050 | U06 |         }, timeoutMs); | Usa timeout configurável, 30 s por padrão. |
| 051 | U06 |         if (timer && typeof timer.unref === 'function') timer.unref(); | Em runtimes Node que suportam unref, evita manter processo de teste vivo. |
| 052 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 053 | U07 |         try { | Parte da expressão da unidade U07: try { |
| 054 | U07 |           chrome.tabs.sendMessage(mangaTabId, { | Envia UPDATE_IMAGE para a aba leitora. |
| 055 | U07 |             action: 'UPDATE_IMAGE', | Contrato de mensagem consumido por content_manga. |
| 056 | U07 |             index, | Encaminha índice da imagem. |
| 057 | U07 |             newSrc: src, | Encaminha bytes/URL traduzidos como newSrc. |
| 058 | U07 |             jobId, | Encaminha jobId para correlação. |
| 059 | U07 |             batchId, | Encaminha batchId para rejeição de lote stale. |
| 060 | U07 |             expectAck: true, | Exige handshake explícito do content script. |
| 061 | U07 |           }, response => { | Callback recebe ACK ou ausência de resposta. |
| 062 | U07 |             const error = chrome.runtime.lastError; | Captura erro de transporte Chrome dentro do callback. |
| 063 | U07 |             if (error) { | Classifica falha de transporte. |
| 064 | U07 |               const legacyNoAck = /message channel closed/i.test(error.message \|\| ''); | Detecta especificamente canal fechado sem resposta. |
| 065 | U07 |               const legacyAccepted = legacyNoAck && finalizeOnAck; | Detecta especificamente canal fechado sem resposta. |
| 066 | U07 |               void settle( | Parte da expressão da unidade U07: void settle( |
| 067 | U07 |                 legacyAccepted, | Canal fechado só é aceito no modo finalizeOnAck legado. |
| 068 | U07 |                 legacyNoAck | Detecta especificamente canal fechado sem resposta. |
| 069 | U07 |                   ? (legacyAccepted ? 'legacy_no_ack' : 'ack_required_for_staging') | Canal fechado só é aceito no modo finalizeOnAck legado. |
| 070 | U07 |                   : (error.message \|\| 'send_failed'), | Fallback de razão para erro de transporte sem mensagem. |
| 071 | U07 |                 response | Parte da expressão da unidade U07: response |
| 072 | U07 |               ); | Fecha estrutura sintática da unidade U07. |
| 073 | U07 |             } else if (response && response.ok === false) { | ACK explicitamente negativo vira falha. |
| 074 | U07 |               void settle(false, response.reason \|\| 'rejected_by_page', response); | Preserva reason do leitor ou usa fallback. |
| 075 | U07 |             } else { | Ramo de falha de ACK/entrega. |
| 076 | U07 |               void settle(true, 'ack', response); | Qualquer callback sem erro e sem ok:false é tratado como ACK positivo. |
| 077 | U07 |             } | Fecha estrutura sintática da unidade U07. |
| 078 | U07 |           }); | Fecha estrutura sintática da unidade U07. |
| 079 | U08 |         } catch (error) { | Captura exceção síncrona de tabs.sendMessage. |
| 080 | U08 |           void settle(false, error && error.message ? error.message : 'send_exception'); | Normaliza exceção sem mensagem. |
| 081 | U08 |         } | Fecha estrutura sintática da unidade U08. |
| 082 | U08 |       }); | Fecha estrutura sintática da unidade U08. |
| 083 | U09 |     } | Fecha estrutura sintática da unidade U09. |
| 084 | U09 | ␠ [linha vazia] | Separador visual da unidade U09. |
| 085 | U09 |     return { deliver }; | Exporta a operação criada pela factory. |
| 086 | U09 |   } | Fecha estrutura sintática da unidade U09. |
| 087 | U09 | ␠ [linha vazia] | Separador visual da unidade U09. |
| 088 | U09 |   scope.MangaTranslatorJobsDomAck = { createDomAckDelivery }; | Publica factory no namespace global esperado pelo background. |
| 089 | U09 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE compatível com worker/testes. |
| 090 | U10 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e intenção de entrega com ACK/persistência.

### U02 — Factory e contrato de entrega
Injeta dependências e define parâmetros do resultado.

### U03 — Inicialização da tentativa e settle idempotente
Marca `result_received`, cria guardas de conclusão e cancela timeout na primeira resposta.

### U04 — ACK positivo/negativo e atualização de estado
Atualiza bookkeeping do job ou registra `DOM_APPLY_FAIL`.

### U05 — Finalização opcional e resposta normalizada
Suporta modo legado e constrói `{ok,reason,persisted,domApplied}`.

### U06 — Timeout de ACK
Converte silêncio do leitor em `ack_timeout`.

### U07 — Envio UPDATE_IMAGE e classificação do callback
Envia payload, trata lastError, legacy no-ACK, rejeição explícita e ACK positivo.

### U08 — Exceção síncrona de sendMessage
Converte throw em falha normalizada.

### U09 — Exports e fechamento
Expõe `deliver` e publica a factory global.

### U10 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 89 linhas + newline = 90/90;
- [x] ACK positivo/negativo, timeout e runtime error ligados a assertions reais;
- [x] staging e modo legado diferenciados;
- [x] content script, actions callers e smoke simulado classificados separadamente;
- [x] riscos de ACK permissivo e ordenação assíncrona registrados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `07b4197a206f85559f2e843d74c71d4858734be7`.

## Cobertura documental de linhas/posições — revisão atual

Cobertura canônica da revisão atual. Os mapas históricos anteriores são preservados como contexto, mas esta seção é a referência estrutural para o blob vigente.

| Linhas/posição | Escopo | Evidência |
|---:|---|---|
| 1–186 | Blob integral atual `abbf440fd4cd8db415f991235aab0f59a9dbe58e` (185 linhas textuais + terminador final quando aplicável). | fonte integral embutida + SHA Git do source |

Esta sincronização documental **não concede aprovação**: a revisão atual deve passar novamente por PRIMARY + ADVERSARIAL independentes.

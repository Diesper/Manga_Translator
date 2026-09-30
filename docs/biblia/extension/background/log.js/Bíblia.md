# Bíblia técnica — `extension/background/log.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `86d5f2f1229b2c9ae7f980fad1495628a05222ca`  
> **Linhas textuais:** **30**  
> **Posições documentais:** **31** contando newline final

## Papel arquitetural e status runtime atual

`background/log.js` contém uma implementação modular do logger assíncrono do MangaTranslator. Ela mantém fila em memória, persiste em `chrome.storage.local.translatorLog` e conserva no máximo 500 entradas.

**Entretanto, neste SHA o arquivo não é carregado pelo `background.js`.** A lista de `importScripts(...)` e o caminho CommonJS `require(...)` carregam router/state/jobs/actions, mas não `background/log.js`.

`background.js` ainda possui uma implementação inline própria de `_logQueue`, `_logFlushing`, `log()` e `_flushLog()` com a mesma lógica básica. O `contextFactory` do router integrado injeta explicitamente esse `log` inline nas actions.

Portanto este arquivo deve ser tratado como **módulo extraído ainda não conectado ao runtime principal**, e não como a implementação efetivamente usada pelo service worker atual.

## Consequência para a cobertura

Há testes fortes do comportamento equivalente no `background.js`, incluindo batching e cap de 500 entradas. Eles não importam nem executam `background/log.js`; por isso são evidência arquitetural/comportamental complementar, não prova direta deste arquivo.

`actions-low-risk.test.js` também define manualmente `global.MangaTranslatorLog = {log: jest.fn()}`. Isso prova integração do router com um logger injetado, não esta implementação real.

Não foi localizado teste que faça `require()`/`importScripts()` de `extension/background/log.js` e execute seu `log/_flushLog`.

## Formato da entrada

`log(level, source, action, detail, extra={})` cria um registro com:

- `id`: `Date.now() + '_' + Math.random()`;
- `ts`: novo `Date.now()`;
- defaults por truthiness: `info`, `bg`, `UNKNOWN`, string vazia e objeto vazio;
- `extra` preservado quando truthy.

O id é diagnóstico, não identificador de segurança/ownership. Não existe garantia criptográfica de unicidade.

## Batching

A primeira chamada adiciona a entrada e inicia `_flushLog()` quando `_logFlushing` está false. O flush marca o mutex antes do primeiro await, retira de `_logQueue` todas as entradas disponíveis e executa um read-modify-write de `translatorLog`.

Entradas que chegam enquanto `storage.get/set` está pendente ficam na fila; o `while` as coleta na iteração seguinte. Isso permite batching sem criar uma gravação por chamada em burst.

Os testes PERF-01 da implementação inline equivalente provam que 500 chamadas são persistidas com no máximo 10 writes no ambiente de integração, mas novamente isso **não prova este módulo extraído**.

## Retenção

Depois de concatenar o batch ao histórico, o código remove do início tudo que excede 500. Assim preserva as 500 entradas mais recentes.

`PERF-02` e `handlers-extra-real.test.js` provam a retenção de 500 na implementação inline de `background.js`, inclusive remoção da entrada mais antiga após novo log.

## Falhas e perda de logs

O `catch` é vazio. Como o batch já foi removido da fila com `splice` antes de `storage.get/set`, qualquer falha pode perder definitivamente aquele batch.

Há outro caso sutil: se novas entradas chegarem enquanto uma operação de storage falha, elas permanecem em `_logQueue`, mas o catch sai do `while` e apenas coloca `_logFlushing=false`. Essas entradas não disparam novo flush sozinhas; ficam retidas até uma nova chamada a `log()` ou uma chamada externa a `_flushLog()`.

Isso é aceitável apenas se logs forem estritamente best-effort/diagnósticos. Não deve ser usado como journal de integridade, auditoria de segurança ou fonte única de estado.

## MV3

`_logQueue` e `_logFlushing` são memória volátil do service worker. Suspensão/encerramento do worker antes do flush pode perder registros ainda não persistidos. `translatorLog` é durável; a fila não.

Não há `chrome.alarms`, journal ou retry durável para logs, o que é coerente com telemetria best-effort, mas precisa continuar separado de estados críticos de jobs.

## Duplicação e risco de drift

No SHA auditado existem duas implementações: esta e a cópia inline em `background.js`. Elas são semanticamente equivalentes nas operações principais, mas não compartilham execução nem testes.

⚠️ Isso cria risco concreto de drift: uma correção feita aqui pode não afetar produção; uma correção feita no inline pode deixar esta Bíblia/módulo desatualizados. Uma futura migração deveria escolher uma implementação canônica e então atualizar testes, mas esta tarefa não altera o código funcional.

## Concorrência e read-modify-write

Dentro de uma única instância deste módulo, `_logFlushing` serializa flushes iniciados via `log()`. Porém `_flushLog` é exportado publicamente; chamadas manuais simultâneas podem ignorar o guard e executar dois read-modify-write concorrentes.

Além disso, duas instâncias/contextos diferentes escrevendo `translatorLog` poderiam sobrescrever entradas uma da outra porque não há compare-and-swap/transação. No runtime atual, este módulo nem está conectado e o service worker inline é a principal instância de escrita.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `tests/integration/performance.test.js` PERF-01/PERF-02 | 🟨 EVIDÊNCIA DE IMPLEMENTAÇÃO EQUIVALENTE | Carrega `background.js` e prova batching/cap de 500 do logger **inline**, não deste arquivo. |
| `tests/unit/background/handlers-extra-real.test.js` | 🟨 EVIDÊNCIA DE IMPLEMENTAÇÃO EQUIVALENTE | LOG_ENTRY integrado mantém apenas 500 no logger inline do background. |
| `tests/unit/background/actions-low-risk.test.js` | 🟨 MOCK/INTEGRAÇÃO | Injeta `MangaTranslatorLog.log = jest.fn()` e prova que log-entry chama um logger; não executa este módulo. |
| `extension/background/router.js` | 🟨 CONSUMIDOR POTENCIAL | Usa `scope.MangaTranslatorLog.log` quando nenhum contextFactory customizado substitui o logger. |
| `extension/background.js` | 🟦 EVIDÊNCIA ESTRUTURAL | Não importa este arquivo e contém implementação inline duplicada. |
| `background/log.js` direto | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO | Nenhuma suíte localizada importa/executa este arquivo real. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** deste módulo real.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para erro em `storage.get` ou `storage.set` e perda do batch retirado da fila.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para novas entradas ficarem presas na fila após um flush falhar.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para duas chamadas manuais concorrentes de `_flushLog()`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para colisão de ids `Date.now()_Math.random()`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para suspensão MV3 antes da persistência.
- ⚠️ O catch silencioso impede observar falhas do próprio sistema de logging.
- ⚠️ A fila não possui limite em memória enquanto storage estiver lento.
- ⚠️ Defaults por truthiness podem substituir deliberadamente valores vazios/falsy.
- ⚠️ O módulo não está conectado ao runtime principal atual.
- ⚠️ Existe duplicação funcional com `background.js`, elevando risco de divergência futura.

## Invariantes

1. Logs são best-effort e não podem virar fonte de verdade de jobs.
2. Ordem dos registros dentro de cada batch deve ser preservada.
3. Retenção durável deve permanecer limitada às 500 entradas mais recentes.
4. Apenas um flush iniciado via `log()` deve estar ativo por instância.
5. Entradas que chegam durante um flush normal devem ser drenadas pelo `while` subsequente.
6. Falha do logger nunca deve derrubar o fluxo funcional que o chamou.
7. Se este módulo virar canônico no runtime, a duplicação inline deve ser reconciliada e os testes devem importar o arquivo real.
8. Cobertura da implementação inline não deve ser rotulada como prova direta deste arquivo.

## Fonte integral

~~~javascript
'use strict';
// background/log.js — Sistema de log assíncrono do MangaTranslator
// Extraído de background.js para modularização

(function(scope) {
  let _logQueue = [];
  let _logFlushing = false;

  function log(level, source, action, detail, extra = {}) {
      _logQueue.push({ id: `${Date.now()}_${Math.random()}`, ts: Date.now(), level: level || 'info', source: source || 'bg', action: action || 'UNKNOWN', detail: detail || '', extra: extra || {} });
      if (!_logFlushing) _flushLog();
  }

  async function _flushLog() {
      _logFlushing = true;
      try {
          while (_logQueue.length > 0) {
              const batch = _logQueue.splice(0, _logQueue.length);
              const data = await chrome.storage.local.get(['translatorLog']);
              const entries = data.translatorLog || [];
              entries.push(...batch);
              if (entries.length > 500) entries.splice(0, entries.length - 500);
              await chrome.storage.local.set({ translatorLog: entries });
          }
      } catch (e) {}
      _logFlushing = false;
  }

  scope.MangaTranslatorLog = { log, _flushLog };
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 31/31

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/log.js — Sistema de log assíncrono do MangaTranslator | Comentário arquitetural: background/log.js — Sistema de log assíncrono do MangaTranslator. |
| 003 | U01 | // Extraído de background.js para modularização | Comentário arquitetural: Extraído de background.js para modularização. |
| 004 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 005 | U02 | (function(scope) { | Passo operacional de U02: (function(scope) { |
| 006 | U02 |   let _logQueue = []; | Fila em memória dos registros ainda não persistidos. |
| 007 | U02 |   let _logFlushing = false; | Mutex booleano cooperativo que evita iniciar dois flushes pela API log. |
| 008 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 009 | U03 |   function log(level, source, action, detail, extra = {}) { | API de enqueue síncrono. |
| 010 | U03 |       _logQueue.push({ id: `${Date.now()}_${Math.random()}`, ts: Date.now(), level: level \|\| 'info', source: source \|\| 'bg', action: action \|\| 'UNKNOWN', detail: detail \|\| '', extra: extra \|\| {} }); | Cria entrada com id/timestamp/defaults e adiciona à fila. |
| 011 | U03 |       if (!_logFlushing) _flushLog(); | Inicia flush apenas quando nenhum flush declarado está ativo. |
| 012 | U03 |   } | Fecha estrutura sintática de U03. |
| 013 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 014 | U04 |   async function _flushLog() { | Abre rotina assíncrona de drenagem da fila. |
| 015 | U04 |       _logFlushing = true; | Marca flush ativo antes do primeiro await. |
| 016 | U04 |       try { | Protege toda a drenagem contra falhas de storage. |
| 017 | U04 |           while (_logQueue.length > 0) { | Continua drenando entradas que chegaram durante awaits anteriores. |
| 018 | U04 |               const batch = _logQueue.splice(0, _logQueue.length); | Move atomicamente o lote residente atual para variável local. |
| 019 | U04 |               const data = await chrome.storage.local.get(['translatorLog']); | Lê translatorLog durável existente. |
| 020 | U04 |               const entries = data.translatorLog \|\| []; | Normaliza ausência do log persistido para array vazio. |
| 021 | U04 |               entries.push(...batch); | Anexa o batch em ordem ao histórico existente. |
| 022 | U04 |               if (entries.length > 500) entries.splice(0, entries.length - 500); | Aplica retenção máxima de 500 entradas. |
| 023 | U04 |               await chrome.storage.local.set({ translatorLog: entries }); | Persiste snapshot completo do translatorLog. |
| 024 | U04 |           } | Fecha estrutura sintática de U04. |
| 025 | U04 |       } catch (e) {} | Engole qualquer falha de leitura/escrita; batch já retirado pode ser perdido. |
| 026 | U04 |       _logFlushing = false; | Libera o mutex ao terminar ou após catch. |
| 027 | U04 |   } | Fecha estrutura sintática de U04. |
| 028 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 029 | U05 |   scope.MangaTranslatorLog = { log, _flushLog }; | Publica log e _flushLog no namespace global. |
| 030 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE compatível com worker/Jest. |
| 031 | U06 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho e IIFE
Identifica o logger modular e abre escopo isolado.

### U02 — Estado da fila
Mantém fila volátil e flag de flush em memória.

### U03 — Enqueue de log
Cria entrada normalizada, enfileira e dispara flush quando necessário.

### U04 — Flush assíncrono e retenção
Drena batches, faz read-modify-write, limita a 500 e engole erros.

### U05 — Export e fechamento
Expõe `log` e `_flushLog` em `MangaTranslatorLog`.

### U06 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 30 linhas + newline = 31/31;
- [x] status runtime (não carregado) verificado contra importScripts/require atuais;
- [x] duplicação inline identificada;
- [x] testes equivalentes separados de prova direta;
- [x] riscos de perda/batching/concorrência/MV3 explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `86d5f2f1229b2c9ae7f980fad1495628a05222ca`.

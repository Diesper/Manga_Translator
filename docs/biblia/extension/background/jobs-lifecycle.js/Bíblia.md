# Bíblia técnica — `extension/background/jobs-lifecycle.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `e4ab9f6c54725a5a8e3f5f3c0e1cbd7a0e1c87e5`  
> **Linhas textuais:** **746**  
> **Posições documentais:** **747** contando newline final

## Identidade e papel arquitetural

`jobs-lifecycle.js` é o núcleo de lifecycle/scheduling dos jobs Gemini. Ele não recebe mensagens IPC diretamente: `background.js` cria a instância e expõe fachadas como `processNextJob`, `finalizeJob`, `assertJobOwnership`, `updateJobState` e recovery para actions/reconciler/watchdog.

É runtime crítico de Service Worker MV3. Seu papel é preservar quatro invariantes sob concorrência e suspensão: (1) um batch por vez, com FIFO dos pendentes; (2) no máximo `_cachedMaxCon` jobs ativos; (3) finalização contabilizada exatamente uma vez; (4) identidade do job continua correta quando uma tab é substituída pelo Chrome.

## Dependências injetadas

A factory recebe estado/fachada de persistência, logger, sync, progress, watchdog, índice de jobs, gerador de id, proteção de finalização e TabIdentity. Os defaults de `resolveCanonicalTabId`/`migrateTabIdentity` são identity/no-op para compatibilidade/testes.

⚠️ `delay` é desestruturado nas dependências mas **não é usado em nenhuma outra linha do arquivo**. É dívida técnica/injeção residual, não comportamento ativo.

## Matriz estrutural — o que, como e por que

| Unidade | Bloco | O que faz | Como faz | Por que uma implementação ingênua seria pior |
|---|---|---|---|---|
| U01 | Cabeçalho e IIFE | Define strict mode, explica que o lifecycle recebe dependências explicitamente e abre uma IIFE global compatível com service worker e Jest. | Ao não criar um segundo estado próprio, o módulo opera sobre o snapshot/fachada do background/state.js. | Um singleton interno paralelo criaria divergência após suspensão/reidratação MV3 e tornaria reconciliação não determinística. |
| U02 | Factory, dependências e chaves de marcador | Desestrutura estado, logging, scheduler, watchdog, índice, geração de IDs, idempotência de finalização e identidade de tabs. Define chaves `gemini_finalized_<tab>` e alarmes correspondentes. | Aliases de tab têm fallbacks identity para permitir testes/compatibilidade, enquanto o background real injeta TabIdentity. | Capturar globals diretamente aumentaria acoplamento, dificultaria testes reais e esconderia dependências críticas de recovery. |
| U03 | Clone defensivo da fila pendente | Clona `pendingBatches` e cada `images[]`, normalizando não-arrays para lista vazia. | Evita mutar referências compartilhadas enquanto transições serializadas trabalham sobre snapshots. | Reusar arrays/objetos originais poderia contaminar estado antes de commit e introduzir races difíceis de reproduzir. |
| U04 | Ativação de snapshot de batch | Transforma um batch pendente em batch ativo: reconstrói `jobQueue`, zera contadores, define mangaTabId, processing e limpa completion claim. | Só preserva campos necessários de cada imagem (`index`) e reaplica prompt/batchId em cada job. | Carregar estado residual do batch anterior causaria contagem errada, jobs estrangeiros e conclusão prematura. |
| U05 | Promoção FIFO de batch pendente | Detecta idle real usando currentBatchId/completionClaimed, filas, índice e activeJobsCount; ignora `isProcessing=true` residual do MV3. Promove o primeiro pending batch e notifica progresso. | Usa `state.mutate` quando existe para serializar a transição; fallback muta e chama syncState. | Confiar apenas em `isProcessing` congelaria a fila após restart; promover sem checar índice/slots poderia sobrepor batches. |
| U06 | Contabilidade idempotente de finalização | Remove o job do índice e atualiza `completedJobs`/`activeJobsCount` somente se o job pertence ao batch atual. Em recovery, índice já ausente significa accounting já aplicado. | O marker durável funciona como journal de duas fases em torno da ausência de transação multi-chave no chrome.storage. | Reaplicar contabilidade após crash duplicaria completedJobs; alterar contadores de batch estrangeiro corromperia o batch promovido. |
| U07 | Recovery de finalização pendente | Reabre marker `gemini_finalized_*`, valida TTL/jobId, restaura proteção em memória, aplica accounting pendente uma vez, limpa watchdog/job/wd_data. | Usa `accountingApplied` e o índice como prova de progresso do journal. | Recomeçar finalize do zero após restart poderia duplicar contadores ou reexecutar efeitos destrutivos. |
| U08 | Recovery de resultado já persistido | Se job reidratado já indica `resultPersisted`, `dom_applied` ou `result_committed`, não regenera; finaliza o job existente. | Canonicaliza tabId antes de buscar a chave e usa dados persistidos como fonte de verdade. | Regenerar uma imagem já persistida desperdiçaria Gemini e poderia sobrescrever resultado confirmado. |
| U09 | Atualização canônica de estado do job | Resolve tab canônica, lê o job, faz merge do patch e renova `updatedAt`. | Concentra updates de estados como opening/result_received/dom_applied/result_committed na chave canônica. | Escrever na tab antiga após replacement criaria estado stale e ownership inconsistente. |
| U10 | Ownership sender/jobId e migração de tab | Prova que a aba remetente possui o jobId. Tenta chave direta, depois alias canônico e por fim a janela de race em que o índice ainda aponta para a aba antiga. | Na race TAB_REPLACED, compara canonical do índice com sender novo e chama `migrateTabIdentity` antes de reler o job. | Confiar em jobId vindo do payload sem amarrá-lo ao sender permitiria spoofing entre jobs. |
| U11 | Construção da URL do job Gemini | Acrescenta `mangatranslator=true` e `jobId`; em localhost/127.0.0.1 adiciona `jobIndex` para ambiente de teste. | Usa `URL` para preservar query existente e encoding; em URL inválida retorna base original. | Concatenação manual quebraria query/hash/escaping e poderia duplicar parâmetros. |
| U12 | Refresh de concorrência máxima | Lê `maxConcurrentJobs`, aplica `parseInt` e fallback 1, armazenando em `_cachedMaxCon`. | O scheduler usa esse cache para decidir quantos jobs abrir. | Consultar storage a cada iteração aumentaria latência, mas ausência de clamp local deixa valores negativos/excessivos como risco. |
| U13 | Abertura de superfície Gemini | No modo `minimized_window`, cria janela já minimizada; se houver tab, retorna um callback `ensureWindowState` que só confirma estado físico depois da persistência do job. Em falha, limpa janela parcial e cai para tab inativa. | Se a janela minimizada não puder ser criada, usa `chrome.tabs.create({active:false})`. | Esperar windows.update/get antes de persistir o job atrasaria CLAIM_GEMINI_JOB e ampliaria race em ambientes throttled. |
| U14 | Tombstone de launches invalidados | Registra batchIds cancelados em Set apenas em memória e limita a 128 entradas. | Serve para promises de tabs/windows que retornam depois de STOP_BATCH limpar `currentBatchId`. | Persistir tombstones de Promises que não sobrevivem ao restart seria ruído durável sem benefício. |
| U15 | Reabilitação de launches | Remove o batchId do tombstone quando um batch com esse id é legitimamente aceito de novo. | Retorna se houve remoção. | Sem limpeza, reuso legítimo do id continuaria sendo abortado durante toda a vida do worker. |
| U16 | Detecção de launch inválido | Combina stopRequested, tombstone, completionClaimed e mismatch com currentBatchId. | É consultada em vários checkpoints de processNextJob. | Um único check antes de `tabs.create` não cobre cancelamentos que chegam enquanto APIs Chrome estão pendentes. |
| U17 | Abort/cleanup de launch invalidado | Após cada fase crítica, remove índice, watchdog, storage e superfície aberta; decrementa slot apenas quando isso não pertence a um batch novo. | Faz cleanup best-effort e sincroniza estado antes de logar JOB_START_ABORTED. | Decrementar activeJobsCount de um batch promovido por causa de erro tardio do batch antigo criaria slot fantasma/oversubscription. |
| U18 | Scheduler processNextJob | Promove batches pendentes, conclui batch uma única vez, respeita stop/concorrência, reserva slot antes do primeiro await, abre Gemini, persiste job+índice, reconcilia tab replacement, arma watchdog e recursa para preencher capacidade. | Completion é claimada via `completionClaimedBatchId`; launch possui checkpoints após tab create, persistência, identidade e watchdog. | Scheduler ingênuo com timers fixos ou sem claims seria vulnerável a dupla conclusão, batch overlap, worker restart e tabs substituídas. |
| U19 | Finalização durável e cleanup de superfície | Impede duplicata em memória e via marker durável, escreve marker antes de accounting, aplica contadores, marca accountingApplied, limpa watchdog/job e fecha ou preserva superfície conforme debug/executionMode. | temp_chat fecha após 600 ms; minimized/background_delete solicita DELETE_CONVERSATION, mantém `deleting_urls` e fecha após 18 s. Em erro antes de conversa real, pula delete. | Finalizar antes do marker permitiria dupla contabilidade após crash; excluir conversa antes de resultado persistido poderia perder a única cópia do resultado. |
| U20 | API pública e fechamento | Exporta somente as operações que o background precisa: update, ownership, concorrência, scheduler, finalize, recoveries e tombstones. | Helpers internos como openGeminiTab/applyAccounting não escapam da factory. | Expor toda a implementação aumentaria superfície de acoplamento e permitiria violar invariantes internas. |
| U21 | Newline final | Representa a posição física terminal usada para equivalência documental. | Permite declarar 747/747 posições documentadas. | Omitir a posição final dificultaria auditoria byte/linha em arquivos com newline terminal. |

## Estado e persistência MV3

O módulo trabalha simultaneamente com estado residente (`state`) e artefatos duráveis: `gemini_job_*`, `gemini_finalized_*`, watchdog data, aliases de tabs e `pendingBatches` persistidos pelo state manager. Nenhuma variável em memória é tratada como suficiente para sobrevivência ao restart.

`invalidatedLaunchBatchIds` é a exceção deliberada: é apenas tombstone de Promises em voo. Como uma Promise de `tabs.create/windows.create` morre junto com o worker, persistir esse Set não ajudaria recovery.

## Scheduler e concorrência

`processNextJob()` reserva o slot de forma síncrona (`jobQueue.shift()` + `activeJobsCount += 1`) antes do primeiro await, o que fecha a race entre chamadas concorrentes no mesmo worker. Depois persiste snapshot e abre a superfície Gemini.

Quando fila e slots zeram, o scheduler consulta o índice antes de concluir. Se ainda existem jobs indexados, corrige `activeJobsCount` e não emite BATCH_COMPLETE. Quando realmente termina, a conclusão é claimada no snapshot com `completionClaimedBatchId`, impedindo múltiplos callers concorrentes de emitir BATCH_COMPLETE/BATCH_DONE mais de uma vez.

Os testes diretos provam conclusão única sob três chamadas concorrentes, FIFO A→G, fila de 64 batches e promoção após restart com `isProcessing` stale.

## FIFO e batches pendentes

`promotePendingBatchIfIdle()` não usa `isProcessing` como fonte exclusiva de verdade. Um worker reidratado pode trazer `isProcessing:true` residual mesmo sem current work; por isso o idle é derivado de `currentBatchId/completionClaimedBatchId`, jobQueue, activeJobsCount e jobIndex.

Quando um batch termina e há pending, a promoção pode ocorrer na mesma mutação que claimou a conclusão anterior. Isso reduz a janela em que dois callers poderiam escolher o mesmo pending batch.

## Abertura e identidade de tabs

`openGeminiTab()` suporta `temp_chat/background_delete` via aba inativa e `minimized_window` via janela dedicada. No modo minimizado, o job é persistido **antes** de aguardar `windows.update/get`; a suíte BATCH-STATUS-10 prova essa ordem.

Depois da criação, `processNextJob()` resolve o tabId canônico antes de persistir, persiste job+índice, executa `ensureWindowState`, resolve novamente e migra se um replacement aconteceu durante a janela crítica. Depois há novo checkpoint de invalidation antes de armar watchdog.

`tab-identity.test.js` prova o caso em que o alias já existe antes da persistência: somente `gemini_job_<canonical>` é criado e o índice também usa a tab canônica.

## Ownership

`assertJobOwnership(sender,jobId)` usa a aba real do sender. O caminho rápido lê `gemini_job_<senderTabId>` uma vez. Se não existir, resolve alias canônico. No intervalo estreito em que TAB_REPLACED aconteceu mas o rekey ainda não terminou, procura o jobId no índice, resolve a identidade e chama `migrateTabIdentity`.

Essa função é a fronteira de confiança usada por actions de resultado/commit/erro. Conhecer um jobId não basta se o sender não possuir a tab correspondente.

## Finalização exatamente uma vez

`finalizeJob()` combina proteção em memória (`isFinalized/markFinalized`) com marker durável `gemini_finalized_<tab>`. A marca é escrita **antes** dos efeitos contábeis. `accountingApplied:false` sinaliza journal incompleto; recovery consegue terminar a contabilidade após restart.

`applyFinalizationAccounting()` remove o job do índice e só altera contadores se o job pertence ao `currentBatchId`. Finalização tardia de A enquanto B está ativo remove A, mas não decrementa slot nem incrementa completed de B.

Os testes P0 provam tanto dupla finalização após perda da proteção em memória quanto restart exatamente entre marker e accounting.

## Recovery

`recoverPendingFinalization()` usa marker ainda válido para reconstruir idempotência e terminar cleanup. `recoverPersistedResult()` detecta `resultPersisted`, `dom_applied` ou `result_committed` e finaliza sem regenerar.

⚠️ O recovery por marker depende de `expiresAt > Date.now()`. Não há teste de crash que permaneça desligado além do TTL antes de reconciliar; após expiração, esse caminho retorna false e o reconciler precisa decidir o destino por outros sinais.

## Fechamento e exclusão segura

Debug mode preserva a superfície Gemini. `temp_chat` agenda fechamento da tab em 600 ms. `minimized_window/background_delete` obtêm a tab e, quando há conversa real, adicionam a URL em `deleting_urls`, enviam `DELETE_CONVERSATION`, liberam scheduling e fecham a superfície após 18 s.

Quando `fromError=true` e a URL ainda não contém `/app/<id>`, o módulo entende que nenhuma conversa foi criada, pula DELETE_CONVERSATION e fecha a superfície imediatamente.

⚠️ Os timers de 600 ms e 18 s são timers de Service Worker, não alarmes duráveis. Os testes provam o comportamento enquanto o worker permanece vivo; não existe prova focal de suspensão do worker durante esses timers. `deleting_urls` é durável, mas o callback local de cleanup não é.

## Segurança e privacidade

- `geminiBaseUrl` vem de storage e é aberto pelo scheduler; este arquivo não aplica allowlist de host. Uma configuração/storage adulterada pode enviar `jobId` como query parameter para outro host.
- O registro `gemini_job_*` persiste `prompt`, mangaTabId, index, batchId, executionMode e metadados de superfície. Isso é estado operacional sensível e deve continuar restrito a `chrome.storage.local` da extensão.
- Logs truncam jobId/batchId em muitos pontos, minimizando exposição diagnóstica.
- Ownership usa sender + job persistido, não apenas campos do payload.
- `DELETE_CONVERSATION` só é disparado depois da finalização pós-persistência, protegendo os bytes traduzidos.

## Lacunas de teste, casos-limite e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `maxConcurrentJobs` negativo ou enorme. `parseInt(value)||1` não faz clamp; `-1` é truthy e pode bloquear o scheduler porque `activeJobsCount >= -1` será verdadeiro.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `windows.create` retornar uma janela sem tabs e `tabs.query` retornar vazio sem lançar. O código cai para `tabs.create`, mas a janela vazia recém-criada não é removida porque cleanup desse windowId só acontece no `catch`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para URL inválida em `buildGeminiJobUrl`; nesse caso retorna baseUrl original sem jobId/mangatranslator.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `updateJobState` concorrente sobre o mesmo job. É read-modify-write sem compare-and-swap; callers concorrentes podem perder patches.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** focal para `assertJobOwnership` em cada uma das três rotas (direta, alias, race de índice); ações integradas cobrem ownership, mas não isolam todas as propriedades.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para tombstone Set ultrapassar 128 e remover o oldest ainda relevante; a intenção é limitar memória.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `clearWatchdog`/storage cleanup falhando durante `abortInvalidatedLaunch`; falhas são absorvidas e o restante do cleanup continua.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para worker suspenso durante os timers de 600 ms/18 s.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `processNextJob()` fire-and-forget rejeitar dentro dos callbacks de finalize; vários caminhos chamam sem await/catch.
- ⚠️ `delay` é dependência morta atualmente.
- ⚠️ O marker durável evita dupla contabilidade dentro do TTL, mas tabId reutilizada sem job record pode colidir com marker ainda válido; com job presente, jobId reduz esse risco.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `jobs-lifecycle-batch-status.test.js` | ✅ PROVADO DIRETAMENTE | Importa este módulo real: hasErrors, finalize fromError, conclusão concorrente única, recovery de resultado persistido, FIFO A→G, fila 64, restart stale, erro tardio estrangeiro e persistência antes de confirmação da janela minimizada. |
| `tab-identity.test.js` | ✅ PROVADO DIRETAMENTE/PARCIAL | O teste `TAB-02 lifecycle` importa este lifecycle e prova alias existente antes da persistência; os outros testes provam o módulo TabIdentity dependente, não cada ramo deste arquivo. |
| `process-finalize-real.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | Scheduler/concorrência, erro de abertura, finalize idempotente, debug, missing tab, marker TTL, deleting_urls, restart do journal, STOP durante tabs.create e exclusão pós-persistência. |
| `batch-lifecycle-real.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | START_BATCH cria jobs/abas/watchdogs e STOP limpa recursos reais. |
| `plan-missing-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | FIFO/idempotência de batches e concorrência configurada. |
| `message-handlers-real.test.js` | 🟨 EXECUTADO INDIRETAMENTE | Fluxos de resultado/commit acionam ownership/finalização através do background, mas a suite não isola cada helper do lifecycle. |
| `smoke-01-batch-lifecycle.js` | 🟨 SIMULAÇÃO COMPLEMENTAR | Exercita um modelo simplificado do lifecycle; não substitui as suítes que importam o módulo real. |

## Invariantes

1. Um job finalizado não pode alterar contadores mais de uma vez, mesmo após restart.
2. Finalização tardia de batch antigo nunca altera contadores do batch atual.
3. `completionClaimedBatchId` deve impedir BATCH_COMPLETE/BATCH_DONE duplicados.
4. `pendingBatches` deve preservar FIFO em promoção normal e após restart.
5. Scheduler nunca deve exceder a concorrência válida configurada.
6. Slot deve ser reservado antes do primeiro await de abertura do job.
7. STOP_BATCH durante API Chrome pendente não pode ressuscitar job cancelado.
8. Job deve estar duravelmente persistido/índice criado antes de aguardar confirmação física de janela minimizada.
9. TabId deve ser canonicalizado e migrado durante replacements.
10. Ownership deve permanecer ligada à sender tab + jobId persistido.
11. Marker durável deve ser escrito antes da contabilidade de finalização.
12. Resultado já persistido não deve ser regenerado após reidratação.
13. Exclusão de conversa só pode ocorrer depois da persistência/finalização segura do resultado.
14. Debug mode deve preservar a superfície Gemini.
15. Timers locais de cleanup não devem ser confundidos com garantias duráveis MV3.

## Fonte integral

~~~javascript
'use strict';
// background/jobs-lifecycle.js -- Abertura, finalização e contabilidade dos jobs.
// Este módulo recebe todas as dependências explícitas para não criar outro estado
// em memória além do snapshot mantido pelo background/state.js.

(function(scope) {
  function createLifecycle(deps) {
    const {
      state, log, syncState, sendProgress, armWatchdog, clearWatchdog,
      indexAddJob, indexRemoveJob, indexJobsOfBatch, delay, generateId,
      markFinalized, isFinalized, finalizedMarkerTtlMinutes,
      resolveCanonicalTabId = async tabId => tabId,
      migrateTabIdentity = async (_oldTabId, newTabId) => newTabId,
    } = deps;

    const markerKey = tabId => `gemini_finalized_${tabId}`;
    const markerAlarm = tabId => `finalization_marker_${tabId}`;

    function clonePendingBatches(value) {
      return Array.isArray(value)
        ? value.map(batch => ({
            ...batch,
            images: Array.isArray(batch?.images)
              ? batch.images.map(image => ({ ...image }))
              : [],
          }))
        : [];
    }

    function activateBatchSnapshot(snapshot, batch) {
      snapshot.currentBatchId = batch.batchId;
      snapshot.stopRequested = false;
      snapshot.jobQueue = (Array.isArray(batch.images) ? batch.images : []).map(image => ({
        mangaTabId: batch.mangaTabId,
        index: image.index,
        prompt: batch.prompt || '',
        batchId: batch.batchId,
      }));
      snapshot.completedJobs = 0;
      snapshot.activeJobsCount = 0;
      snapshot.totalJobs = snapshot.jobQueue.length;
      snapshot.activeMangaTabId = batch.mangaTabId || null;
      snapshot.isProcessing = true;
      snapshot.completionClaimedBatchId = null;
      return snapshot;
    }

    async function promotePendingBatchIfIdle() {
      let promoted = null;
      const transition = snapshot => {
        const pending = clonePendingBatches(snapshot.pendingBatches);
        const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : [];
        const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : [];
        const currentBatchAlreadyCompleted = Boolean(
          snapshot.currentBatchId &&
          snapshot.completionClaimedBatchId === snapshot.currentBatchId
        );
        // currentBatchId + filas/índice são a fonte de verdade. Um
        // isProcessing=true residual após suspensão do MV3 não pode congelar
        // lotes persistidos que já não possuem trabalho ativo.
        const idle = !snapshot.stopRequested &&
          (!snapshot.currentBatchId || currentBatchAlreadyCompleted) &&
          queued.length === 0 &&
          Number(snapshot.activeJobsCount) === 0 &&
          indexed.length === 0;

        if (!idle || pending.length === 0) return snapshot;

        promoted = pending.shift();
        snapshot.pendingBatches = pending;
        activateBatchSnapshot(snapshot, promoted);
        return snapshot;
      };

      if (typeof state.mutate === 'function') {
        await state.mutate(transition);
      } else {
        transition(state);
        await syncState();
      }

      if (promoted) {
        log('info', 'bg', 'BATCH_PROMOTED',
          'Próximo lote da fila FIFO foi promovido para execução.', {
            batchId: String(promoted.batchId || '').slice(0, 8),
            pendingCount: Array.isArray(state.pendingBatches) ? state.pendingBatches.length : 0,
            totalJobs: Array.isArray(promoted.images) ? promoted.images.length : 0,
          });
        sendProgress(promoted.mangaTabId, '▶️ INICIANDO LOTE DA FILA...');
      }

      return promoted;
    }

    // chrome.storage não oferece transação entre a marca e o snapshot. O índice
    // persistido funciona como journal: enquanto accountingApplied é falso, o
    // job fica no índice. Se o worker cair nesse intervalo, a reconciliação o
    // encontra e aplica a transição exatamente uma vez.
    async function applyFinalizationAccounting(geminiTabId, job, marker, { recovery = false } = {}) {
      let skippedForeignBatchAccounting = false;
      const transition = snapshot => {
        const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : [];
        const belongsToJob = entry => entry && entry.geminiTabId === geminiTabId &&
          (!job.jobId || !entry.jobId || entry.jobId === job.jobId);
        const wasIndexed = indexed.some(belongsToJob);
        // Em recovery, um índice já removido prova que o snapshot com a
        // contabilidade foi salvo antes da suspensão; repetir seria duplicar.
        if (recovery && !wasIndexed) return snapshot;
        snapshot.jobIndex = indexed.filter(entry => !belongsToJob(entry));

        const jobBatchId = job.batchId || null;
        const belongsToCurrentBatch = !jobBatchId ||
          jobBatchId === snapshot.currentBatchId;

        if (belongsToCurrentBatch) {
          if (!marker.fromError) snapshot.completedJobs = (Number(snapshot.completedJobs) || 0) + 1;
          snapshot.activeJobsCount = Math.max(0, (Number(snapshot.activeJobsCount) || 0) - 1);
        } else {
          skippedForeignBatchAccounting = true;
        }
        return snapshot;
      };

      if (typeof state.mutate === 'function') {
        await state.mutate(transition);
        if (skippedForeignBatchAccounting) {
          log('warn', 'bg', 'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
            'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', {
              jobId: String(job.jobId || '').slice(0, 8),
              jobBatchId: String(job.batchId || '').slice(0, 8),
              currentBatchId: String(state.currentBatchId || '').slice(0, 8),
            });
        }
        return;
      }

      // Ponte para versões que ainda usam a fachada de estado do background.
      const wasIndexed = indexJobsOfBatch(null).some(entry => entry && entry.geminiTabId === geminiTabId &&
        (!job.jobId || !entry.jobId || entry.jobId === job.jobId));
      if (recovery && !wasIndexed) return;
      indexRemoveJob(geminiTabId);
      const belongsToCurrentBatch = !job.batchId || job.batchId === state.currentBatchId;
      if (belongsToCurrentBatch) {
        if (!marker.fromError) state.completedJobs = (Number(state.completedJobs) || 0) + 1;
        state.activeJobsCount = Math.max(0, (Number(state.activeJobsCount) || 0) - 1);
      } else {
        log('warn', 'bg', 'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
          'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', {
            jobId: String(job.jobId || '').slice(0, 8),
            jobBatchId: String(job.batchId || '').slice(0, 8),
            currentBatchId: String(state.currentBatchId || '').slice(0, 8),
          });
      }
      await syncState();
    }

    async function recoverPendingFinalization(entry) {
      if (!entry || entry.geminiTabId === null || entry.geminiTabId === undefined) return false;
      const geminiTabId = entry.geminiTabId;
      const key = markerKey(geminiTabId);
      const jobKey = `gemini_job_${geminiTabId}`;
      const data = await chrome.storage.local.get([key, jobKey]);
      const marker = data && data[key];
      if (!marker || marker.expiresAt <= Date.now()) return false;
      const job = (data && data[jobKey]) || entry;
      if (marker.jobId && job.jobId && marker.jobId !== job.jobId) return false;

      markFinalized(geminiTabId);
      if (!marker.accountingApplied) {
        await applyFinalizationAccounting(geminiTabId, job, marker, { recovery: true });
        await chrome.storage.local.set({ [key]: { ...marker, accountingApplied: true, accountingRecoveredAt: Date.now() } });
      }
      clearWatchdog(geminiTabId, job.jobId || entry.jobId);
      await chrome.storage.local.remove([jobKey, `wd_data_${geminiTabId}`]);
      return true;
    }

    async function recoverPersistedResult(entry) {
      if (!entry || entry.geminiTabId === null || entry.geminiTabId === undefined) return false;
      const canonicalTabId = await resolveCanonicalTabId(entry.geminiTabId);
      const jobKey = `gemini_job_${canonicalTabId}`;
      const data = await chrome.storage.local.get([jobKey]);
      const job = data && data[jobKey];

      if (!job || (job.resultPersisted !== true && job.state !== 'dom_applied' && job.state !== 'result_committed')) {
        return false;
      }

      log('warn', 'bg', 'JOB_RECONCILE_PERSISTED_RESULT',
        'Job reidratado já possui resultado persistido; pulando nova geração e finalizando com segurança.', {
          jobId: String(job.jobId || entry.jobId || '').slice(0, 8),
          batchId: String(job.batchId || entry.batchId || '').slice(0, 8),
          geminiTabId: canonicalTabId,
          state: job.state || null,
        });

      await finalizeJob(
        canonicalTabId,
        job.mangaTabId || entry.mangaTabId || null,
        false
      );
      return true;
    }

    async function updateJobState(geminiTabId, patch = {}) {
      if (geminiTabId === null || geminiTabId === undefined) return null;
      const canonicalTabId = await resolveCanonicalTabId(geminiTabId);
      const jobKey = `gemini_job_${canonicalTabId}`;
      const data = await chrome.storage.local.get([jobKey]);
      const job = data && data[jobKey];
      if (!job) return null;
      const next = { ...job, ...patch, geminiTabId: canonicalTabId, canonicalTabId, updatedAt: Date.now() };
      await chrome.storage.local.set({ [jobKey]: next });
      return next;
    }

    async function assertJobOwnership(sender, jobId) {
      const senderTabId = sender && sender.tab ? sender.tab.id : null;
      if (!jobId || senderTabId === null) return { owns: false, tabId: senderTabId, job: null };

      // Caminho comum sem replacement: uma leitura apenas, preservando a
      // latência original. Só consultamos aliases se a chave física não existe.
      let tabId = senderTabId;
      let data = await chrome.storage.local.get([`gemini_job_${tabId}`]);
      let job = data && data[`gemini_job_${tabId}`];
      if (job) return { owns: job.jobId === jobId, tabId, job };

      tabId = await resolveCanonicalTabId(senderTabId);
      if (tabId !== senderTabId) {
        data = await chrome.storage.local.get([`gemini_job_${tabId}`]);
        job = data && data[`gemini_job_${tabId}`];
        if (job) return { owns: job.jobId === jobId, tabId, job };
      }

      // Durante a pequena janela entre TAB_REPLACED e o término do rekey, o
      // sender já é a aba nova enquanto o índice ainda aponta para a antiga.
      const indexed = indexJobsOfBatch(null).find(entry => entry && entry.jobId === jobId);
      if (indexed) {
        const indexedCanonical = await resolveCanonicalTabId(indexed.geminiTabId);
        if (indexedCanonical === senderTabId) {
          tabId = await migrateTabIdentity(indexed.geminiTabId, senderTabId, { jobId });
          data = await chrome.storage.local.get([`gemini_job_${tabId}`]);
          job = data && data[`gemini_job_${tabId}`];
        }
      }
      return { owns: Boolean(job && job.jobId === jobId), tabId, job: job || null };
    }

    function buildGeminiJobUrl(baseUrl, jobIndex, jobId) {
      try {
        const parsed = new URL(baseUrl);
        parsed.searchParams.set('mangatranslator', 'true');
        parsed.searchParams.set('jobId', jobId);
        if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
          parsed.searchParams.set('jobIndex', String(jobIndex));
        }
        return parsed.toString();
      } catch (_error) {
        return baseUrl;
      }
    }

    async function refreshMaxConcurrency() {
      const data = await chrome.storage.local.get('maxConcurrentJobs');
      state._cachedMaxCon = parseInt(data && data.maxConcurrentJobs, 10) || 1;
      return state._cachedMaxCon;
    }

    async function openGeminiTab(url, executionMode) {
      if (executionMode === 'minimized_window') {
        let createdWindowId = null;
        try {
          // IMPORTANTE: chrome.windows.create() já recebe state=minimized.
          // Não bloqueie a persistência do job em windows.update/get: o
          // content script pode chegar a CLAIM_GEMINI_JOB imediatamente e a
          // janela minimizada é justamente o caso mais sujeito a scheduling
          // lento. O estado físico é verificado somente DEPOIS de gemini_job_*
          // + jobIndex estarem duráveis.
          const window = await chrome.windows.create({ url, focused: false, state: 'minimized' });
          createdWindowId = window.id;
          let tab = (window.tabs && window.tabs[0]) || null;
          if (!tab) tab = (await chrome.tabs.query({ windowId: window.id }))[0];
          if (tab) {
            return {
              tab,
              windowId: window.id,
              dedicatedWindow: true,
              ensureWindowState: async () => {
                try {
                  await chrome.windows.update(window.id, { state: 'minimized', focused: false });
                  const actualWindow = await chrome.windows.get(window.id);
                  log(actualWindow.state === 'minimized' ? 'info' : 'warn', 'bg', 'GEMINI_WINDOW_STATE',
                    'Estado físico da janela do job', {
                      state: actualWindow.state,
                      focused: actualWindow.focused,
                    });
                  if (actualWindow.state !== 'minimized') {
                    log('warn', 'bg', 'GEMINI_WINDOW_MINIMIZE_DEGRADED',
                      'Job preservado, mas a janela não confirmou estado minimizado após persistência.', {
                        windowId: window.id,
                        state: actualWindow.state,
                      });
                  }
                } catch (error) {
                  // Neste ponto o job já pode ter sido reivindicado. Nunca
                  // destrua a superfície só porque a verificação física falhou.
                  log('warn', 'bg', 'GEMINI_WINDOW_MINIMIZE_DEGRADED',
                    'Job preservado; falhou apenas a confirmação do estado minimizado.', {
                      windowId: window.id,
                      error: error && error.message ? error.message : 'window_state_error',
                    });
                }
              },
            };
          }
        } catch (_error) {
          if (createdWindowId !== null) {
            try { await chrome.windows.remove(createdWindowId); } catch (_e) {}
          }
          log('warn', 'bg', 'GEMINI_WINDOW_MINIMIZE_FAILED', 'Janela minimizada indisponível; usando aba inativa', {});
        }
      }
      const tab = await chrome.tabs.create({ url, active: false });
      return { tab, windowId: tab.windowId, dedicatedWindow: false, ensureWindowState: null };
    }

    // Tombstone apenas em memória: uma Promise de tabs/windows não sobrevive
    // ao restart do Service Worker, então não há motivo para persistir isso.
    // Ele serve para distinguir "currentBatchId=null porque A foi cancelado"
    // de "currentBatchId=null em um fixture/recovery ainda válido".
    const invalidatedLaunchBatchIds = new Set();

    function invalidateBatchLaunches(batchId) {
      if (!batchId) return false;
      invalidatedLaunchBatchIds.add(batchId);
      // Evita crescimento ilimitado durante uma sessão muito longa do worker.
      while (invalidatedLaunchBatchIds.size > 128) {
        const oldest = invalidatedLaunchBatchIds.values().next().value;
        invalidatedLaunchBatchIds.delete(oldest);
      }
      return true;
    }

    function allowBatchLaunches(batchId) {
      if (!batchId) return false;
      return invalidatedLaunchBatchIds.delete(batchId);
    }

    function launchWasInvalidated(batchId) {
      return Boolean(
        state.stopRequested ||
        (batchId && invalidatedLaunchBatchIds.has(batchId)) ||
        (batchId && state.completionClaimedBatchId === batchId) ||
        (batchId && state.currentBatchId && batchId !== state.currentBatchId)
      );
    }

    async function abortInvalidatedLaunch({
      batchId,
      jobId,
      geminiTabId,
      opened,
      indexed = false,
      phase = 'unknown',
    }) {
      if (!launchWasInvalidated(batchId)) return false;

      if (indexed && (geminiTabId || geminiTabId === 0)) {
        indexRemoveJob(geminiTabId);
      }
      if (geminiTabId || geminiTabId === 0) {
        try { clearWatchdog(geminiTabId, jobId); } catch (_e) {}
        try {
          await chrome.storage.local.remove([
            `gemini_job_${geminiTabId}`,
            `wd_data_${geminiTabId}`,
          ]);
        } catch (_e) {}
      }

      const closeTab = tabId => {
        if (tabId === null || tabId === undefined) return;
        try {
          chrome.tabs.remove(tabId, () => { void chrome.runtime.lastError; });
        } catch (_e) {}
      };
      if (opened?.dedicatedWindow === true && opened.windowId !== null && opened.windowId !== undefined) {
        try {
          chrome.windows.remove(opened.windowId, () => { void chrome.runtime.lastError; });
        } catch (_e) {
          closeTab(geminiTabId);
        }
      } else {
        closeTab(geminiTabId);
      }

      if (!batchId || !state.currentBatchId || state.currentBatchId === batchId) {
        state.activeJobsCount = Math.max(0, (Number(state.activeJobsCount) || 0) - 1);
      }
      await syncState();
      log('warn', 'bg', 'JOB_START_ABORTED',
        'Abertura de job cancelada porque o lote foi interrompido ou substituído durante o lançamento.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(batchId || '').slice(0, 8),
          geminiTabId,
          phase,
          stopRequested: Boolean(state.stopRequested),
          currentBatchId: String(state.currentBatchId || '').slice(0, 8),
        });
      return true;
    }

    async function processNextJob() {
      const currentBatchAlreadyCompleted = Boolean(
        state.currentBatchId &&
        state.completionClaimedBatchId === state.currentBatchId
      );
      if (!state.stopRequested &&
          (!state.currentBatchId || currentBatchAlreadyCompleted) &&
          state.jobQueue.length === 0 && state.activeJobsCount === 0 &&
          Array.isArray(state.pendingBatches) && state.pendingBatches.length > 0) {
        const promoted = await promotePendingBatchIfIdle();
        if (promoted) {
          await refreshMaxConcurrency();
          return processNextJob();
        }
      }

      if (state.stopRequested || (state.jobQueue.length === 0 && state.activeJobsCount === 0)) {
        const stillOpen = !state.stopRequested ? indexJobsOfBatch(state.currentBatchId).length : 0;
        if (stillOpen > 0) {
          state.activeJobsCount = Math.max(state.activeJobsCount, stillOpen);
          await syncState();
          return;
        }

        if (!state.stopRequested && state.jobQueue.length === 0 && state.activeJobsCount === 0) {
          let completion = null;
          let promotedAfterCompletion = null;

          const claimCompletion = snapshot => {
            const batchId = snapshot.currentBatchId || null;
            const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : [];
            if (!batchId || snapshot.stopRequested || queued.length > 0 ||
                Number(snapshot.activeJobsCount) > 0 ||
                snapshot.completionClaimedBatchId === batchId) {
              return snapshot;
            }

            const completed = Number(snapshot.completedJobs) || 0;
            const total = Number(snapshot.totalJobs) || 0;
            completion = {
              batchId,
              mangaTabId: snapshot.activeMangaTabId || null,
              completed,
              total,
              hasErrors: completed < total,
            };
            snapshot.completionClaimedBatchId = batchId;

            const pending = clonePendingBatches(snapshot.pendingBatches);
            if (pending.length > 0) {
              promotedAfterCompletion = pending.shift();
              snapshot.pendingBatches = pending;
              activateBatchSnapshot(snapshot, promotedAfterCompletion);
            } else {
              snapshot.isProcessing = false;
              snapshot.activeMangaTabId = null;
            }
            return snapshot;
          };

          if (typeof state.mutate === 'function') {
            await state.mutate(claimCompletion);
          } else {
            claimCompletion(state);
            await syncState();
          }

          if (completion) {
            if (completion.mangaTabId) {
              chrome.tabs.sendMessage(completion.mangaTabId, {
                action: 'BATCH_COMPLETE',
                batchId: completion.batchId,
                hasErrors: completion.hasErrors,
              }, () => { void chrome.runtime.lastError; });
            }
            log(completion.hasErrors ? 'warn' : 'success', 'bg', 'BATCH_DONE',
              completion.hasErrors
                ? 'Lote encerrado com falhas; traduções não concluídas.'
                : 'Lote finalizado com sucesso!',
              {
                batchId: String(completion.batchId).slice(0, 8),
                completed: completion.completed,
                total: completion.total,
                hasErrors: completion.hasErrors,
              });
          }

          if (promotedAfterCompletion) {
            log('info', 'bg', 'BATCH_PROMOTED',
              'Próximo lote da fila FIFO foi promovido após a conclusão do lote anterior.', {
                previousBatchId: String(completion?.batchId || '').slice(0, 8),
                batchId: String(promotedAfterCompletion.batchId || '').slice(0, 8),
                pendingCount: Array.isArray(state.pendingBatches) ? state.pendingBatches.length : 0,
                totalJobs: Array.isArray(promotedAfterCompletion.images)
                  ? promotedAfterCompletion.images.length
                  : 0,
              });
            sendProgress(promotedAfterCompletion.mangaTabId, '▶️ INICIANDO LOTE DA FILA...');
            await refreshMaxConcurrency();
            return processNextJob();
          }
        }
        return;
      }
      if (state.stopRequested || state.jobQueue.length === 0 || state.activeJobsCount >= state._cachedMaxCon) return;

      const job = state.jobQueue.shift();
      if (!job) return;
      state.activeJobsCount += 1;
      const { mangaTabId, index, prompt } = job;
      const jobId = generateId();
      const batchId = job.batchId || state.currentBatchId;
      state.activeMangaTabId = mangaTabId;
      await syncState();
      log('info', 'bg', 'JOB_START', 'Iniciando imagem', { index, completedJobs: state.completedJobs, totalJobs: state.totalJobs });
      sendProgress(mangaTabId, `🔄 ABRINDO GEMINI (${state.completedJobs + 1}/${state.totalJobs})...`);

      try {
        const settings = await chrome.storage.local.get(['geminiBaseUrl', 'geminiExecutionMode']);
        let baseUrl = settings.geminiBaseUrl || 'https://gemini.google.com/app';
        if (baseUrl === 'https://gemini.google.com/' || baseUrl === 'https://gemini.google.com') baseUrl = 'https://gemini.google.com/app';
        const executionMode = settings.geminiExecutionMode || 'temp_chat';
        const opened = await openGeminiTab(buildGeminiJobUrl(baseUrl, index, jobId), executionMode);
        if (!opened.tab) throw new Error('Não foi possível obter a aba do Gemini');
        const openedTabId = opened.tab.id;
        let canonicalTabId = await resolveCanonicalTabId(openedTabId);
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: false, phase: 'after_tab_create',
        })) return processNextJob();

        let record = {
          jobId, batchId, mangaTabId, index, prompt,
          geminiTabId: canonicalTabId,
          canonicalTabId,
          replacementCount: canonicalTabId === openedTabId ? 0 : 1,
          windowId: opened.windowId,
          dedicatedWindow: opened.dedicatedWindow === true,
          executionMode,
          state: 'opening',
          attempt: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await chrome.storage.local.set({ [`gemini_job_${canonicalTabId}`]: record });
        indexAddJob({ geminiTabId: canonicalTabId, jobId, batchId, mangaTabId, index });
        await syncState();
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: true, phase: 'after_job_persist',
        })) return processNextJob();

        // A confirmação física da janela minimizada vem DEPOIS da persistência
        // do job. Assim o content script nunca precisa esperar update/get de
        // window para conseguir reivindicar seu job.
        if (typeof opened.ensureWindowState === 'function') {
          await opened.ensureWindowState();
        }

        // Fecha a corrida nas duas ordens:
        // 1) replacement antes da persistência -> alias já existe e migramos;
        // 2) replacement depois da persistência -> listener migra os registros.
        // O recheck só ocorre DEPOIS de job + índice existirem, de modo que um
        // listener concorrente sempre veja tudo ou o recheck repare o que faltou.
        const latestCanonicalTabId = await resolveCanonicalTabId(openedTabId);
        if (latestCanonicalTabId !== canonicalTabId) {
          canonicalTabId = await migrateTabIdentity(canonicalTabId, latestCanonicalTabId, { jobId });
          const migrated = await chrome.storage.local.get([`gemini_job_${canonicalTabId}`]);
          record = migrated[`gemini_job_${canonicalTabId}`] || { ...record, geminiTabId: canonicalTabId, canonicalTabId };
        }

        canonicalTabId = await resolveCanonicalTabId(openedTabId);
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: true, phase: 'after_tab_identity',
        })) return processNextJob();

        log('info', 'bg', 'TAB_CREATED_FOR_JOB', 'Aba Gemini associada ao job', {
          oldTabId: openedTabId,
          newTabId: canonicalTabId,
          jobIdPrefix: String(jobId).slice(0, 8),
          index,
        });
        await armWatchdog(mangaTabId, index, canonicalTabId, jobId);
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: true, phase: 'after_watchdog_arm',
        })) return processNextJob();
        return processNextJob();
      } catch (error) {
        const message = error && error.message ? error.message : 'Falha ao abrir Gemini';
        const belongsToCurrentBatch = !state.currentBatchId || state.currentBatchId === batchId;

        if (belongsToCurrentBatch) {
          state.activeJobsCount = Math.max(0, state.activeJobsCount - 1);
          log('error', 'bg', 'JOB_ERROR', 'Erro ao abrir Gemini', {
            index,
            error: message,
            batchId: String(batchId || '').slice(0, 8),
          });
          chrome.tabs.sendMessage(mangaTabId, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: `Erro ao abrir: ${message}`,
            imgIndex: index,
            isDebug: false,
            batchId,
          }, () => { void chrome.runtime.lastError; });
        } else {
          // A/B/C/... podem trocar de posição enquanto uma API de tabs/windows
          // ainda está pendente. Um erro tardio de A não pertence à contabilidade
          // de B e não pode consumir/devolver slots do lote promovido.
          log('warn', 'bg', 'JOB_ERROR_FOREIGN_BATCH_IGNORED',
            'Falha tardia de abertura pertence a lote anterior; contadores do lote atual foram preservados.', {
              index,
              error: message,
              batchId: String(batchId || '').slice(0, 8),
              currentBatchId: String(state.currentBatchId || '').slice(0, 8),
            });
        }

        await syncState();
        return processNextJob();
      }
    }

    async function finalizeJob(geminiTabId, mangaTabId, fromError = false) {
      if (isFinalized(geminiTabId)) return false;

      // Leitura direta primeiro: no caminho normal isso mantém exatamente uma
      // ida ao storage. Se a chave física já foi movida, então resolvemos alias.
      let jobKey = `gemini_job_${geminiTabId}`;
      let key = markerKey(geminiTabId);
      let data = await chrome.storage.local.get([jobKey, key, 'geminiExecutionMode', 'debugMode']);
      if (!data[jobKey]) {
        const canonicalTabId = await resolveCanonicalTabId(geminiTabId);
        if (canonicalTabId !== geminiTabId) {
          geminiTabId = canonicalTabId;
          if (isFinalized(geminiTabId)) return false;
          jobKey = `gemini_job_${geminiTabId}`;
          key = markerKey(geminiTabId);
          data = await chrome.storage.local.get([jobKey, key, 'geminiExecutionMode', 'debugMode']);
        }
      }
      const job = data[jobKey] || {};
      const prior = data[key];
      if (prior && prior.expiresAt > Date.now() && (!job.jobId || prior.jobId === job.jobId)) {
        markFinalized(geminiTabId);
        return false;
      }
      markFinalized(geminiTabId);
      const marker = { jobId: job.jobId || null, fromError: Boolean(fromError), finalizedAt: Date.now(), expiresAt: Date.now() + finalizedMarkerTtlMinutes * 60_000, accountingApplied: false };
      // A marca é escrita antes de qualquer efeito. No restart, a reconciliação
      // pode finalizar a contabilidade pendente usando este registro.
      await chrome.storage.local.set({ [key]: marker });
      chrome.alarms.create(markerAlarm(geminiTabId), { delayInMinutes: finalizedMarkerTtlMinutes });
      await applyFinalizationAccounting(geminiTabId, job, marker);
      await chrome.storage.local.set({ [key]: { ...marker, accountingApplied: true } });
      clearWatchdog(geminiTabId, job.jobId);
      await chrome.storage.local.remove(jobKey);

      if (data.debugMode === true) { processNextJob(); return true; }
      const executionMode = job.executionMode || data.geminiExecutionMode || 'temp_chat';
      const closeGeminiSurface = tab => {
        if (job.dedicatedWindow === true && tab?.windowId) {
          chrome.windows.remove(tab.windowId, () => { void chrome.runtime.lastError; });
          return;
        }
        chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; });
      };
      if (executionMode === 'temp_chat') {
        setTimeout(() => chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; }), 600);
        processNextJob();
        return true;
      }
      chrome.tabs.get(geminiTabId, async tab => {
        if (chrome.runtime.lastError || !tab) {
          chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; });
          processNextJob();
          return;
        }
        const shouldDeleteConversation = executionMode === 'minimized_window' || executionMode === 'background_delete';
        if (!shouldDeleteConversation) {
          chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; });
          processNextJob();
          return;
        }
        // Resultado já foi persistido no leitor. Agora a conversa pode ser
        // excluída sem risco de perder os bytes traduzidos.
        const activeUrl = tab.url || '';
        if (fromError && !/\/app\/[^/?#]+/.test(activeUrl)) {
          log('info', 'bg', 'DELETE_SKIPPED_NO_CONVERSATION', 'Job falhou antes de criar conversa; não há ID para apagar', {});
          closeGeminiSurface(tab);
          processNextJob();
          return;
        }
        const stored = await chrome.storage.local.get(['deleting_urls']);
        const deletingUrls = Array.isArray(stored.deleting_urls) ? stored.deleting_urls : [];
        if (activeUrl && !deletingUrls.includes(activeUrl)) deletingUrls.push(activeUrl);
        await chrome.storage.local.set({ deleting_urls: deletingUrls });
        chrome.tabs.sendMessage(geminiTabId, { action: 'DELETE_CONVERSATION' }, response => {
          const deleteError = chrome.runtime.lastError;
          log(deleteError || response?.ok === false ? 'warn' : 'success', 'bg',
            deleteError || response?.ok === false ? 'POST_PERSIST_DELETE_DEFERRED' : 'POST_PERSIST_DELETE_OK',
            deleteError || response?.ok === false
              ? 'Resultado já persistido; exclusão da conversa não confirmou imediatamente.'
              : 'Conversa excluída depois da persistência confirmada do resultado.',
            { jobId: String(job.jobId || '').slice(0, 8), batchId: String(job.batchId || '').slice(0, 8) });
        });
        processNextJob();
        setTimeout(() => {
          chrome.storage.local.get(['deleting_urls']).then(next => {
            const urls = (next.deleting_urls || []).filter(url => url !== activeUrl);
            return chrome.storage.local.set({ deleting_urls: urls });
          }).catch(() => {});
          closeGeminiSurface(tab);
        }, 18_000);
      });
      return true;
    }

    return {
      updateJobState,
      assertJobOwnership,
      refreshMaxConcurrency,
      processNextJob,
      finalizeJob,
      recoverPendingFinalization,
      recoverPersistedResult,
      invalidateBatchLaunches,
      allowBatchLaunches,
    };
  }
  scope.MangaTranslatorJobsLifecycle = { createLifecycle };
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 747/747

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/jobs-lifecycle.js -- Abertura, finalização e contabilidade dos jobs. | Comentário arquitetural: background/jobs-lifecycle.js -- Abertura, finalização e contabilidade dos jobs.. |
| 003 | U01 | // Este módulo recebe todas as dependências explícitas para não criar outro estado | Comentário arquitetural: Este módulo recebe todas as dependências explícitas para não criar outro estado. |
| 004 | U01 | // em memória além do snapshot mantido pelo background/state.js. | Comentário arquitetural: em memória além do snapshot mantido pelo background/state.js.. |
| 005 | U01 | ␠ [linha vazia] | Separador visual dentro de U01. |
| 006 | U01 | (function(scope) { | Passo operacional de U01: (function(scope) { |
| 007 | U02 |   function createLifecycle(deps) { | Abre a factory do lifecycle com dependências explicitamente injetadas. |
| 008 | U02 |     const { | Passo operacional de U02: const { |
| 009 | U02 |       state, log, syncState, sendProgress, armWatchdog, clearWatchdog, | Sincroniza estado durável após mutação fora de state.mutate. |
| 010 | U02 |       indexAddJob, indexRemoveJob, indexJobsOfBatch, delay, generateId, | Insere job no índice runtime/durável do lote. |
| 011 | U02 |       markFinalized, isFinalized, finalizedMarkerTtlMinutes, | Passo operacional de U02: markFinalized, isFinalized, finalizedMarkerTtlMinutes, |
| 012 | U02 |       resolveCanonicalTabId = async tabId => tabId, | Resolve tabId através da identidade canônica/aliases. |
| 013 | U02 |       migrateTabIdentity = async (_oldTabId, newTabId) => newTabId, | Migra registros quando o Chrome substituiu a aba. |
| 014 | U02 |     } = deps; | Passo operacional de U02: } = deps; |
| 015 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 016 | U02 |     const markerKey = tabId => `gemini_finalized_${tabId}`; | Declara helper/closure local da unidade U02. |
| 017 | U02 |     const markerAlarm = tabId => `finalization_marker_${tabId}`; | Declara helper/closure local da unidade U02. |
| 018 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 019 | U03 |     function clonePendingBatches(value) { | Declara função da unidade U03: function clonePendingBatches(value) { |
| 020 | U03 |       return Array.isArray(value) | Retorno/curto-circuito da unidade U03. |
| 021 | U03 |         ? value.map(batch => ({ | Passo operacional de U03: ? value.map(batch => ({ |
| 022 | U03 |             ...batch, | Passo operacional de U03: ...batch, |
| 023 | U03 |             images: Array.isArray(batch?.images) | Passo operacional de U03: images: Array.isArray(batch?.images) |
| 024 | U03 |               ? batch.images.map(image => ({ ...image })) | Passo operacional de U03: ? batch.images.map(image => ({ ...image })) |
| 025 | U03 |               : [], | Passo operacional de U03: : [], |
| 026 | U03 |           })) | Fecha estrutura sintática da unidade U03. |
| 027 | U03 |         : []; | Passo operacional de U03: : []; |
| 028 | U03 |     } | Fecha estrutura sintática da unidade U03. |
| 029 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 030 | U04 |     function activateBatchSnapshot(snapshot, batch) { | Declara função da unidade U04: function activateBatchSnapshot(snapshot, batch) { |
| 031 | U04 |       snapshot.currentBatchId = batch.batchId; | Consulta ou altera identidade do batch atualmente ativo. |
| 032 | U04 |       snapshot.stopRequested = false; | Respeita gate de cancelamento do lote. |
| 033 | U04 |       snapshot.jobQueue = (Array.isArray(batch.images) ? batch.images : []).map(image => ({ | Passo operacional de U04: snapshot.jobQueue = (Array.isArray(batch.images) ? batch.images : []).map(image => ({ |
| 034 | U04 |         mangaTabId: batch.mangaTabId, | Passo operacional de U04: mangaTabId: batch.mangaTabId, |
| 035 | U04 |         index: image.index, | Passo operacional de U04: index: image.index, |
| 036 | U04 |         prompt: batch.prompt \|\| '', | Passo operacional de U04: prompt: batch.prompt // '', |
| 037 | U04 |         batchId: batch.batchId, | Passo operacional de U04: batchId: batch.batchId, |
| 038 | U04 |       })); | Fecha estrutura sintática da unidade U04. |
| 039 | U04 |       snapshot.completedJobs = 0; | Atualiza/consulta contagem de jobs concluídos com sucesso. |
| 040 | U04 |       snapshot.activeJobsCount = 0; | Atualiza/consulta contador de slots ativos. |
| 041 | U04 |       snapshot.totalJobs = snapshot.jobQueue.length; | Passo operacional de U04: snapshot.totalJobs = snapshot.jobQueue.length; |
| 042 | U04 |       snapshot.activeMangaTabId = batch.mangaTabId \|\| null; | Passo operacional de U04: snapshot.activeMangaTabId = batch.mangaTabId // null; |
| 043 | U04 |       snapshot.isProcessing = true; | Passo operacional de U04: snapshot.isProcessing = true; |
| 044 | U04 |       snapshot.completionClaimedBatchId = null; | Protege conclusão de batch contra emissão duplicada. |
| 045 | U04 |       return snapshot; | Retorno/curto-circuito da unidade U04. |
| 046 | U04 |     } | Fecha estrutura sintática da unidade U04. |
| 047 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 048 | U05 |     async function promotePendingBatchIfIdle() { | Declara função da unidade U05: async function promotePendingBatchIfIdle() { |
| 049 | U05 |       let promoted = null; | Passo operacional de U05: let promoted = null; |
| 050 | U05 |       const transition = snapshot => { | Declara helper/closure local da unidade U05. |
| 051 | U05 |         const pending = clonePendingBatches(snapshot.pendingBatches); | Manipula a fila FIFO persistida de batches. |
| 052 | U05 |         const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []; | Passo operacional de U05: const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []; |
| 053 | U05 |         const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : []; | Passo operacional de U05: const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : []; |
| 054 | U05 |         const currentBatchAlreadyCompleted = Boolean( | Passo operacional de U05: const currentBatchAlreadyCompleted = Boolean( |
| 055 | U05 |           snapshot.currentBatchId && | Consulta ou altera identidade do batch atualmente ativo. |
| 056 | U05 |           snapshot.completionClaimedBatchId === snapshot.currentBatchId | Protege conclusão de batch contra emissão duplicada. |
| 057 | U05 |         ); | Fecha estrutura sintática da unidade U05. |
| 058 | U05 |         // currentBatchId + filas/índice são a fonte de verdade. Um | Comentário arquitetural: currentBatchId + filas/índice são a fonte de verdade. Um. |
| 059 | U05 |         // isProcessing=true residual após suspensão do MV3 não pode congelar | Comentário arquitetural: isProcessing=true residual após suspensão do MV3 não pode congelar. |
| 060 | U05 |         // lotes persistidos que já não possuem trabalho ativo. | Comentário arquitetural: lotes persistidos que já não possuem trabalho ativo.. |
| 061 | U05 |         const idle = !snapshot.stopRequested && | Respeita gate de cancelamento do lote. |
| 062 | U05 |           (!snapshot.currentBatchId \|\| currentBatchAlreadyCompleted) && | Consulta ou altera identidade do batch atualmente ativo. |
| 063 | U05 |           queued.length === 0 && | Passo operacional de U05: queued.length === 0 && |
| 064 | U05 |           Number(snapshot.activeJobsCount) === 0 && | Atualiza/consulta contador de slots ativos. |
| 065 | U05 |           indexed.length === 0; | Passo operacional de U05: indexed.length === 0; |
| 066 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 067 | U05 |         if (!idle \|\| pending.length === 0) return snapshot; | Retorno/curto-circuito da unidade U05. |
| 068 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 069 | U05 |         promoted = pending.shift(); | Passo operacional de U05: promoted = pending.shift(); |
| 070 | U05 |         snapshot.pendingBatches = pending; | Manipula a fila FIFO persistida de batches. |
| 071 | U05 |         activateBatchSnapshot(snapshot, promoted); | Passo operacional de U05: activateBatchSnapshot(snapshot, promoted); |
| 072 | U05 |         return snapshot; | Retorno/curto-circuito da unidade U05. |
| 073 | U05 |       }; | Fecha estrutura sintática da unidade U05. |
| 074 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 075 | U05 |       if (typeof state.mutate === 'function') { | Usa mutação serializada do snapshot quando disponível para evitar races. |
| 076 | U05 |         await state.mutate(transition); | Usa mutação serializada do snapshot quando disponível para evitar races. |
| 077 | U05 |       } else { | Passo operacional de U05: } else { |
| 078 | U05 |         transition(state); | Passo operacional de U05: transition(state); |
| 079 | U05 |         await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 080 | U05 |       } | Fecha estrutura sintática da unidade U05. |
| 081 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 082 | U05 |       if (promoted) { | Passo operacional de U05: if (promoted) { |
| 083 | U05 |         log('info', 'bg', 'BATCH_PROMOTED', | Registra promoção FIFO. |
| 084 | U05 |           'Próximo lote da fila FIFO foi promovido para execução.', { | Passo operacional de U05: 'Próximo lote da fila FIFO foi promovido para execução.', { |
| 085 | U05 |             batchId: String(promoted.batchId \|\| '').slice(0, 8), | Passo operacional de U05: batchId: String(promoted.batchId // '').slice(0, 8), |
| 086 | U05 |             pendingCount: Array.isArray(state.pendingBatches) ? state.pendingBatches.length : 0, | Manipula a fila FIFO persistida de batches. |
| 087 | U05 |             totalJobs: Array.isArray(promoted.images) ? promoted.images.length : 0, | Passo operacional de U05: totalJobs: Array.isArray(promoted.images) ? promoted.images.length : 0, |
| 088 | U05 |           }); | Fecha estrutura sintática da unidade U05. |
| 089 | U05 |         sendProgress(promoted.mangaTabId, '▶️ INICIANDO LOTE DA FILA...'); | Passo operacional de U05: sendProgress(promoted.mangaTabId, '▶️ INICIANDO LOTE DA FILA...'); |
| 090 | U05 |       } | Fecha estrutura sintática da unidade U05. |
| 091 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 092 | U05 |       return promoted; | Retorno/curto-circuito da unidade U05. |
| 093 | U05 |     } | Fecha estrutura sintática da unidade U05. |
| 094 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 095 | U05 |     // chrome.storage não oferece transação entre a marca e o snapshot. O índice | Comentário arquitetural: chrome.storage não oferece transação entre a marca e o snapshot. O índice. |
| 096 | U05 |     // persistido funciona como journal: enquanto accountingApplied é falso, o | Comentário arquitetural: persistido funciona como journal: enquanto accountingApplied é falso, o. |
| 097 | U05 |     // job fica no índice. Se o worker cair nesse intervalo, a reconciliação o | Comentário arquitetural: job fica no índice. Se o worker cair nesse intervalo, a reconciliação o. |
| 098 | U05 |     // encontra e aplica a transição exatamente uma vez. | Comentário arquitetural: encontra e aplica a transição exatamente uma vez.. |
| 099 | U06 |     async function applyFinalizationAccounting(geminiTabId, job, marker, { recovery = false } = {}) { | Declara função da unidade U06: async function applyFinalizationAccounting(geminiTabId, job, marker, { recovery = false } = {}) { |
| 100 | U06 |       let skippedForeignBatchAccounting = false; | Passo operacional de U06: let skippedForeignBatchAccounting = false; |
| 101 | U06 |       const transition = snapshot => { | Declara helper/closure local da unidade U06. |
| 102 | U06 |         const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []; | Passo operacional de U06: const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []; |
| 103 | U06 |         const belongsToJob = entry => entry && entry.geminiTabId === geminiTabId && | Declara helper/closure local da unidade U06. |
| 104 | U06 |           (!job.jobId \|\| !entry.jobId \|\| entry.jobId === job.jobId); | Passo operacional de U06: (!job.jobId // !entry.jobId // entry.jobId === job.jobId); |
| 105 | U06 |         const wasIndexed = indexed.some(belongsToJob); | Passo operacional de U06: const wasIndexed = indexed.some(belongsToJob); |
| 106 | U06 |         // Em recovery, um índice já removido prova que o snapshot com a | Comentário arquitetural: Em recovery, um índice já removido prova que o snapshot com a. |
| 107 | U06 |         // contabilidade foi salvo antes da suspensão; repetir seria duplicar. | Comentário arquitetural: contabilidade foi salvo antes da suspensão; repetir seria duplicar.. |
| 108 | U06 |         if (recovery && !wasIndexed) return snapshot; | Retorno/curto-circuito da unidade U06. |
| 109 | U06 |         snapshot.jobIndex = indexed.filter(entry => !belongsToJob(entry)); | Passo operacional de U06: snapshot.jobIndex = indexed.filter(entry => !belongsToJob(entry)); |
| 110 | U06 | ␠ [linha vazia] | Separador visual dentro de U06. |
| 111 | U06 |         const jobBatchId = job.batchId \|\| null; | Passo operacional de U06: const jobBatchId = job.batchId // null; |
| 112 | U06 |         const belongsToCurrentBatch = !jobBatchId \|\| | Passo operacional de U06: const belongsToCurrentBatch = !jobBatchId // |
| 113 | U06 |           jobBatchId === snapshot.currentBatchId; | Consulta ou altera identidade do batch atualmente ativo. |
| 114 | U06 | ␠ [linha vazia] | Separador visual dentro de U06. |
| 115 | U06 |         if (belongsToCurrentBatch) { | Passo operacional de U06: if (belongsToCurrentBatch) { |
| 116 | U06 |           if (!marker.fromError) snapshot.completedJobs = (Number(snapshot.completedJobs) \|\| 0) + 1; | Atualiza/consulta contagem de jobs concluídos com sucesso. |
| 117 | U06 |           snapshot.activeJobsCount = Math.max(0, (Number(snapshot.activeJobsCount) \|\| 0) - 1); | Atualiza/consulta contador de slots ativos. |
| 118 | U06 |         } else { | Passo operacional de U06: } else { |
| 119 | U06 |           skippedForeignBatchAccounting = true; | Passo operacional de U06: skippedForeignBatchAccounting = true; |
| 120 | U06 |         } | Fecha estrutura sintática da unidade U06. |
| 121 | U06 |         return snapshot; | Retorno/curto-circuito da unidade U06. |
| 122 | U06 |       }; | Fecha estrutura sintática da unidade U06. |
| 123 | U06 | ␠ [linha vazia] | Separador visual dentro de U06. |
| 124 | U06 |       if (typeof state.mutate === 'function') { | Usa mutação serializada do snapshot quando disponível para evitar races. |
| 125 | U06 |         await state.mutate(transition); | Usa mutação serializada do snapshot quando disponível para evitar races. |
| 126 | U06 |         if (skippedForeignBatchAccounting) { | Passo operacional de U06: if (skippedForeignBatchAccounting) { |
| 127 | U06 |           log('warn', 'bg', 'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED', | Registra finalização tardia que não pode alterar contadores do batch novo. |
| 128 | U06 |             'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', { | Passo operacional de U06: 'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', { |
| 129 | U06 |               jobId: String(job.jobId \|\| '').slice(0, 8), | Passo operacional de U06: jobId: String(job.jobId // '').slice(0, 8), |
| 130 | U06 |               jobBatchId: String(job.batchId \|\| '').slice(0, 8), | Passo operacional de U06: jobBatchId: String(job.batchId // '').slice(0, 8), |
| 131 | U06 |               currentBatchId: String(state.currentBatchId \|\| '').slice(0, 8), | Consulta ou altera identidade do batch atualmente ativo. |
| 132 | U06 |             }); | Fecha estrutura sintática da unidade U06. |
| 133 | U06 |         } | Fecha estrutura sintática da unidade U06. |
| 134 | U06 |         return; | Retorno/curto-circuito da unidade U06. |
| 135 | U06 |       } | Fecha estrutura sintática da unidade U06. |
| 136 | U06 | ␠ [linha vazia] | Separador visual dentro de U06. |
| 137 | U06 |       // Ponte para versões que ainda usam a fachada de estado do background. | Comentário arquitetural: Ponte para versões que ainda usam a fachada de estado do background.. |
| 138 | U06 |       const wasIndexed = indexJobsOfBatch(null).some(entry => entry && entry.geminiTabId === geminiTabId && | Declara helper/closure local da unidade U06. |
| 139 | U06 |         (!job.jobId \|\| !entry.jobId \|\| entry.jobId === job.jobId)); | Passo operacional de U06: (!job.jobId // !entry.jobId // entry.jobId === job.jobId)); |
| 140 | U06 |       if (recovery && !wasIndexed) return; | Retorno/curto-circuito da unidade U06. |
| 141 | U06 |       indexRemoveJob(geminiTabId); | Remove job do índice após abort/finalização. |
| 142 | U06 |       const belongsToCurrentBatch = !job.batchId \|\| job.batchId === state.currentBatchId; | Consulta ou altera identidade do batch atualmente ativo. |
| 143 | U06 |       if (belongsToCurrentBatch) { | Passo operacional de U06: if (belongsToCurrentBatch) { |
| 144 | U06 |         if (!marker.fromError) state.completedJobs = (Number(state.completedJobs) \|\| 0) + 1; | Atualiza/consulta contagem de jobs concluídos com sucesso. |
| 145 | U06 |         state.activeJobsCount = Math.max(0, (Number(state.activeJobsCount) \|\| 0) - 1); | Atualiza/consulta contador de slots ativos. |
| 146 | U06 |       } else { | Passo operacional de U06: } else { |
| 147 | U06 |         log('warn', 'bg', 'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED', | Registra finalização tardia que não pode alterar contadores do batch novo. |
| 148 | U06 |           'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', { | Passo operacional de U06: 'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', { |
| 149 | U06 |             jobId: String(job.jobId \|\| '').slice(0, 8), | Passo operacional de U06: jobId: String(job.jobId // '').slice(0, 8), |
| 150 | U06 |             jobBatchId: String(job.batchId \|\| '').slice(0, 8), | Passo operacional de U06: jobBatchId: String(job.batchId // '').slice(0, 8), |
| 151 | U06 |             currentBatchId: String(state.currentBatchId \|\| '').slice(0, 8), | Consulta ou altera identidade do batch atualmente ativo. |
| 152 | U06 |           }); | Fecha estrutura sintática da unidade U06. |
| 153 | U06 |       } | Fecha estrutura sintática da unidade U06. |
| 154 | U06 |       await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 155 | U06 |     } | Fecha estrutura sintática da unidade U06. |
| 156 | U06 | ␠ [linha vazia] | Separador visual dentro de U06. |
| 157 | U07 |     async function recoverPendingFinalization(entry) { | Declara função da unidade U07: async function recoverPendingFinalization(entry) { |
| 158 | U07 |       if (!entry \|\| entry.geminiTabId === null \|\| entry.geminiTabId === undefined) return false; | Retorno/curto-circuito da unidade U07. |
| 159 | U07 |       const geminiTabId = entry.geminiTabId; | Passo operacional de U07: const geminiTabId = entry.geminiTabId; |
| 160 | U07 |       const key = markerKey(geminiTabId); | Passo operacional de U07: const key = markerKey(geminiTabId); |
| 161 | U07 |       const jobKey = `gemini_job_${geminiTabId}`; | Passo operacional de U07: const jobKey = `gemini_job_${geminiTabId}`; |
| 162 | U07 |       const data = await chrome.storage.local.get([key, jobKey]); | Consulta storage local durável. |
| 163 | U07 |       const marker = data && data[key]; | Passo operacional de U07: const marker = data && data[key]; |
| 164 | U07 |       if (!marker \|\| marker.expiresAt <= Date.now()) return false; | Retorno/curto-circuito da unidade U07. |
| 165 | U07 |       const job = (data && data[jobKey]) \|\| entry; | Passo operacional de U07: const job = (data && data[jobKey]) // entry; |
| 166 | U07 |       if (marker.jobId && job.jobId && marker.jobId !== job.jobId) return false; | Retorno/curto-circuito da unidade U07. |
| 167 | U07 | ␠ [linha vazia] | Separador visual dentro de U07. |
| 168 | U07 |       markFinalized(geminiTabId); | Passo operacional de U07: markFinalized(geminiTabId); |
| 169 | U07 |       if (!marker.accountingApplied) { | Passo operacional de U07: if (!marker.accountingApplied) { |
| 170 | U07 |         await applyFinalizationAccounting(geminiTabId, job, marker, { recovery: true }); | Passo operacional de U07: await applyFinalizationAccounting(geminiTabId, job, marker, { recovery: true }); |
| 171 | U07 |         await chrome.storage.local.set({ [key]: { ...marker, accountingApplied: true, accountingRecoveredAt: Date.now() } }); | Persiste estado/journal no storage local. |
| 172 | U07 |       } | Fecha estrutura sintática da unidade U07. |
| 173 | U07 |       clearWatchdog(geminiTabId, job.jobId \|\| entry.jobId); | Limpa watchdog do job. |
| 174 | U07 |       await chrome.storage.local.remove([jobKey, `wd_data_${geminiTabId}`]); | Remove chave durável depois de cleanup/recovery. |
| 175 | U07 |       return true; | Retorno/curto-circuito da unidade U07. |
| 176 | U07 |     } | Fecha estrutura sintática da unidade U07. |
| 177 | U07 | ␠ [linha vazia] | Separador visual dentro de U07. |
| 178 | U08 |     async function recoverPersistedResult(entry) { | Declara função da unidade U08: async function recoverPersistedResult(entry) { |
| 179 | U08 |       if (!entry \|\| entry.geminiTabId === null \|\| entry.geminiTabId === undefined) return false; | Retorno/curto-circuito da unidade U08. |
| 180 | U08 |       const canonicalTabId = await resolveCanonicalTabId(entry.geminiTabId); | Resolve tabId através da identidade canônica/aliases. |
| 181 | U08 |       const jobKey = `gemini_job_${canonicalTabId}`; | Passo operacional de U08: const jobKey = `gemini_job_${canonicalTabId}`; |
| 182 | U08 |       const data = await chrome.storage.local.get([jobKey]); | Consulta storage local durável. |
| 183 | U08 |       const job = data && data[jobKey]; | Passo operacional de U08: const job = data && data[jobKey]; |
| 184 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 185 | U08 |       if (!job \|\| (job.resultPersisted !== true && job.state !== 'dom_applied' && job.state !== 'result_committed')) { | Passo operacional de U08: if (!job // (job.resultPersisted !== true && job.state !== 'dom_applied' && job.state !== 'result_committed')) { |
| 186 | U08 |         return false; | Retorno/curto-circuito da unidade U08. |
| 187 | U08 |       } | Fecha estrutura sintática da unidade U08. |
| 188 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 189 | U08 |       log('warn', 'bg', 'JOB_RECONCILE_PERSISTED_RESULT', | Registra recovery de resultado já persistido. |
| 190 | U08 |         'Job reidratado já possui resultado persistido; pulando nova geração e finalizando com segurança.', { | Passo operacional de U08: 'Job reidratado já possui resultado persistido; pulando nova geração e finalizando com segurança.', { |
| 191 | U08 |           jobId: String(job.jobId \|\| entry.jobId \|\| '').slice(0, 8), | Passo operacional de U08: jobId: String(job.jobId // entry.jobId // '').slice(0, 8), |
| 192 | U08 |           batchId: String(job.batchId \|\| entry.batchId \|\| '').slice(0, 8), | Passo operacional de U08: batchId: String(job.batchId // entry.batchId // '').slice(0, 8), |
| 193 | U08 |           geminiTabId: canonicalTabId, | Passo operacional de U08: geminiTabId: canonicalTabId, |
| 194 | U08 |           state: job.state \|\| null, | Passo operacional de U08: state: job.state // null, |
| 195 | U08 |         }); | Fecha estrutura sintática da unidade U08. |
| 196 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 197 | U08 |       await finalizeJob( | Passo operacional de U08: await finalizeJob( |
| 198 | U08 |         canonicalTabId, | Passo operacional de U08: canonicalTabId, |
| 199 | U08 |         job.mangaTabId \|\| entry.mangaTabId \|\| null, | Passo operacional de U08: job.mangaTabId // entry.mangaTabId // null, |
| 200 | U08 |         false | Passo operacional de U08: false |
| 201 | U08 |       ); | Fecha estrutura sintática da unidade U08. |
| 202 | U08 |       return true; | Retorno/curto-circuito da unidade U08. |
| 203 | U08 |     } | Fecha estrutura sintática da unidade U08. |
| 204 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 205 | U09 |     async function updateJobState(geminiTabId, patch = {}) { | Declara função da unidade U09: async function updateJobState(geminiTabId, patch = {}) { |
| 206 | U09 |       if (geminiTabId === null \|\| geminiTabId === undefined) return null; | Retorno/curto-circuito da unidade U09. |
| 207 | U09 |       const canonicalTabId = await resolveCanonicalTabId(geminiTabId); | Resolve tabId através da identidade canônica/aliases. |
| 208 | U09 |       const jobKey = `gemini_job_${canonicalTabId}`; | Passo operacional de U09: const jobKey = `gemini_job_${canonicalTabId}`; |
| 209 | U09 |       const data = await chrome.storage.local.get([jobKey]); | Consulta storage local durável. |
| 210 | U09 |       const job = data && data[jobKey]; | Passo operacional de U09: const job = data && data[jobKey]; |
| 211 | U09 |       if (!job) return null; | Retorno/curto-circuito da unidade U09. |
| 212 | U09 |       const next = { ...job, ...patch, geminiTabId: canonicalTabId, canonicalTabId, updatedAt: Date.now() }; | Passo operacional de U09: const next = { ...job, ...patch, geminiTabId: canonicalTabId, canonicalTabId, updatedAt: Date.now() }; |
| 213 | U09 |       await chrome.storage.local.set({ [jobKey]: next }); | Persiste estado/journal no storage local. |
| 214 | U09 |       return next; | Retorno/curto-circuito da unidade U09. |
| 215 | U09 |     } | Fecha estrutura sintática da unidade U09. |
| 216 | U09 | ␠ [linha vazia] | Separador visual dentro de U09. |
| 217 | U10 |     async function assertJobOwnership(sender, jobId) { | Declara função da unidade U10: async function assertJobOwnership(sender, jobId) { |
| 218 | U10 |       const senderTabId = sender && sender.tab ? sender.tab.id : null; | Passo operacional de U10: const senderTabId = sender && sender.tab ? sender.tab.id : null; |
| 219 | U10 |       if (!jobId \|\| senderTabId === null) return { owns: false, tabId: senderTabId, job: null }; | Retorno/curto-circuito da unidade U10. |
| 220 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 221 | U10 |       // Caminho comum sem replacement: uma leitura apenas, preservando a | Comentário arquitetural: Caminho comum sem replacement: uma leitura apenas, preservando a. |
| 222 | U10 |       // latência original. Só consultamos aliases se a chave física não existe. | Comentário arquitetural: latência original. Só consultamos aliases se a chave física não existe.. |
| 223 | U10 |       let tabId = senderTabId; | Passo operacional de U10: let tabId = senderTabId; |
| 224 | U10 |       let data = await chrome.storage.local.get([`gemini_job_${tabId}`]); | Consulta storage local durável. |
| 225 | U10 |       let job = data && data[`gemini_job_${tabId}`]; | Passo operacional de U10: let job = data && data[`gemini_job_${tabId}`]; |
| 226 | U10 |       if (job) return { owns: job.jobId === jobId, tabId, job }; | Retorno/curto-circuito da unidade U10. |
| 227 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 228 | U10 |       tabId = await resolveCanonicalTabId(senderTabId); | Resolve tabId através da identidade canônica/aliases. |
| 229 | U10 |       if (tabId !== senderTabId) { | Passo operacional de U10: if (tabId !== senderTabId) { |
| 230 | U10 |         data = await chrome.storage.local.get([`gemini_job_${tabId}`]); | Consulta storage local durável. |
| 231 | U10 |         job = data && data[`gemini_job_${tabId}`]; | Passo operacional de U10: job = data && data[`gemini_job_${tabId}`]; |
| 232 | U10 |         if (job) return { owns: job.jobId === jobId, tabId, job }; | Retorno/curto-circuito da unidade U10. |
| 233 | U10 |       } | Fecha estrutura sintática da unidade U10. |
| 234 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 235 | U10 |       // Durante a pequena janela entre TAB_REPLACED e o término do rekey, o | Comentário arquitetural: Durante a pequena janela entre TAB_REPLACED e o término do rekey, o. |
| 236 | U10 |       // sender já é a aba nova enquanto o índice ainda aponta para a antiga. | Comentário arquitetural: sender já é a aba nova enquanto o índice ainda aponta para a antiga.. |
| 237 | U10 |       const indexed = indexJobsOfBatch(null).find(entry => entry && entry.jobId === jobId); | Declara helper/closure local da unidade U10. |
| 238 | U10 |       if (indexed) { | Passo operacional de U10: if (indexed) { |
| 239 | U10 |         const indexedCanonical = await resolveCanonicalTabId(indexed.geminiTabId); | Resolve tabId através da identidade canônica/aliases. |
| 240 | U10 |         if (indexedCanonical === senderTabId) { | Passo operacional de U10: if (indexedCanonical === senderTabId) { |
| 241 | U10 |           tabId = await migrateTabIdentity(indexed.geminiTabId, senderTabId, { jobId }); | Migra registros quando o Chrome substituiu a aba. |
| 242 | U10 |           data = await chrome.storage.local.get([`gemini_job_${tabId}`]); | Consulta storage local durável. |
| 243 | U10 |           job = data && data[`gemini_job_${tabId}`]; | Passo operacional de U10: job = data && data[`gemini_job_${tabId}`]; |
| 244 | U10 |         } | Fecha estrutura sintática da unidade U10. |
| 245 | U10 |       } | Fecha estrutura sintática da unidade U10. |
| 246 | U10 |       return { owns: Boolean(job && job.jobId === jobId), tabId, job: job \|\| null }; | Retorno/curto-circuito da unidade U10. |
| 247 | U10 |     } | Fecha estrutura sintática da unidade U10. |
| 248 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 249 | U11 |     function buildGeminiJobUrl(baseUrl, jobIndex, jobId) { | Declara função da unidade U11: function buildGeminiJobUrl(baseUrl, jobIndex, jobId) { |
| 250 | U11 |       try { | Passo operacional de U11: try { |
| 251 | U11 |         const parsed = new URL(baseUrl); | Passo operacional de U11: const parsed = new URL(baseUrl); |
| 252 | U11 |         parsed.searchParams.set('mangatranslator', 'true'); | Passo operacional de U11: parsed.searchParams.set('mangatranslator', 'true'); |
| 253 | U11 |         parsed.searchParams.set('jobId', jobId); | Passo operacional de U11: parsed.searchParams.set('jobId', jobId); |
| 254 | U11 |         if (parsed.hostname === '127.0.0.1' \|\| parsed.hostname === 'localhost') { | Passo operacional de U11: if (parsed.hostname === '127.0.0.1' // parsed.hostname === 'localhost') { |
| 255 | U11 |           parsed.searchParams.set('jobIndex', String(jobIndex)); | Passo operacional de U11: parsed.searchParams.set('jobIndex', String(jobIndex)); |
| 256 | U11 |         } | Fecha estrutura sintática da unidade U11. |
| 257 | U11 |         return parsed.toString(); | Retorno/curto-circuito da unidade U11. |
| 258 | U11 |       } catch (_error) { | Passo operacional de U11: } catch (_error) { |
| 259 | U11 |         return baseUrl; | Retorno/curto-circuito da unidade U11. |
| 260 | U11 |       } | Fecha estrutura sintática da unidade U11. |
| 261 | U11 |     } | Fecha estrutura sintática da unidade U11. |
| 262 | U11 | ␠ [linha vazia] | Separador visual dentro de U11. |
| 263 | U12 |     async function refreshMaxConcurrency() { | Declara função da unidade U12: async function refreshMaxConcurrency() { |
| 264 | U12 |       const data = await chrome.storage.local.get('maxConcurrentJobs'); | Consulta storage local durável. |
| 265 | U12 |       state._cachedMaxCon = parseInt(data && data.maxConcurrentJobs, 10) \|\| 1; | Passo operacional de U12: state._cachedMaxCon = parseInt(data && data.maxConcurrentJobs, 10) // 1; |
| 266 | U12 |       return state._cachedMaxCon; | Retorno/curto-circuito da unidade U12. |
| 267 | U12 |     } | Fecha estrutura sintática da unidade U12. |
| 268 | U12 | ␠ [linha vazia] | Separador visual dentro de U12. |
| 269 | U13 |     async function openGeminiTab(url, executionMode) { | Declara função da unidade U13: async function openGeminiTab(url, executionMode) { |
| 270 | U13 |       if (executionMode === 'minimized_window') { | Passo operacional de U13: if (executionMode === 'minimized_window') { |
| 271 | U13 |         let createdWindowId = null; | Passo operacional de U13: let createdWindowId = null; |
| 272 | U13 |         try { | Passo operacional de U13: try { |
| 273 | U13 |           // IMPORTANTE: chrome.windows.create() já recebe state=minimized. | Comentário arquitetural: IMPORTANTE: chrome.windows.create() já recebe state=minimized.. |
| 274 | U13 |           // Não bloqueie a persistência do job em windows.update/get: o | Comentário arquitetural: Não bloqueie a persistência do job em windows.update/get: o. |
| 275 | U13 |           // content script pode chegar a CLAIM_GEMINI_JOB imediatamente e a | Comentário arquitetural: content script pode chegar a CLAIM_GEMINI_JOB imediatamente e a. |
| 276 | U13 |           // janela minimizada é justamente o caso mais sujeito a scheduling | Comentário arquitetural: janela minimizada é justamente o caso mais sujeito a scheduling. |
| 277 | U13 |           // lento. O estado físico é verificado somente DEPOIS de gemini_job_* | Comentário arquitetural: lento. O estado físico é verificado somente DEPOIS de gemini_job_*. |
| 278 | U13 |           // + jobIndex estarem duráveis. | Comentário arquitetural: + jobIndex estarem duráveis.. |
| 279 | U13 |           const window = await chrome.windows.create({ url, focused: false, state: 'minimized' }); | Cria janela dedicada minimizada. |
| 280 | U13 |           createdWindowId = window.id; | Passo operacional de U13: createdWindowId = window.id; |
| 281 | U13 |           let tab = (window.tabs && window.tabs[0]) \|\| null; | Passo operacional de U13: let tab = (window.tabs && window.tabs[0]) // null; |
| 282 | U13 |           if (!tab) tab = (await chrome.tabs.query({ windowId: window.id }))[0]; | Passo operacional de U13: if (!tab) tab = (await chrome.tabs.query({ windowId: window.id }))[0]; |
| 283 | U13 |           if (tab) { | Passo operacional de U13: if (tab) { |
| 284 | U13 |             return { | Retorno/curto-circuito da unidade U13. |
| 285 | U13 |               tab, | Passo operacional de U13: tab, |
| 286 | U13 |               windowId: window.id, | Passo operacional de U13: windowId: window.id, |
| 287 | U13 |               dedicatedWindow: true, | Passo operacional de U13: dedicatedWindow: true, |
| 288 | U13 |               ensureWindowState: async () => { | Passo operacional de U13: ensureWindowState: async () => { |
| 289 | U13 |                 try { | Passo operacional de U13: try { |
| 290 | U13 |                   await chrome.windows.update(window.id, { state: 'minimized', focused: false }); | Passo operacional de U13: await chrome.windows.update(window.id, { state: 'minimized', focused: false }); |
| 291 | U13 |                   const actualWindow = await chrome.windows.get(window.id); | Passo operacional de U13: const actualWindow = await chrome.windows.get(window.id); |
| 292 | U13 |                   log(actualWindow.state === 'minimized' ? 'info' : 'warn', 'bg', 'GEMINI_WINDOW_STATE', | Registra estado/fallback da janela Gemini. |
| 293 | U13 |                     'Estado físico da janela do job', { | Passo operacional de U13: 'Estado físico da janela do job', { |
| 294 | U13 |                       state: actualWindow.state, | Passo operacional de U13: state: actualWindow.state, |
| 295 | U13 |                       focused: actualWindow.focused, | Passo operacional de U13: focused: actualWindow.focused, |
| 296 | U13 |                     }); | Fecha estrutura sintática da unidade U13. |
| 297 | U13 |                   if (actualWindow.state !== 'minimized') { | Passo operacional de U13: if (actualWindow.state !== 'minimized') { |
| 298 | U13 |                     log('warn', 'bg', 'GEMINI_WINDOW_MINIMIZE_DEGRADED', | Registra estado/fallback da janela Gemini. |
| 299 | U13 |                       'Job preservado, mas a janela não confirmou estado minimizado após persistência.', { | Passo operacional de U13: 'Job preservado, mas a janela não confirmou estado minimizado após persistência.', { |
| 300 | U13 |                         windowId: window.id, | Passo operacional de U13: windowId: window.id, |
| 301 | U13 |                         state: actualWindow.state, | Passo operacional de U13: state: actualWindow.state, |
| 302 | U13 |                       }); | Fecha estrutura sintática da unidade U13. |
| 303 | U13 |                   } | Fecha estrutura sintática da unidade U13. |
| 304 | U13 |                 } catch (error) { | Passo operacional de U13: } catch (error) { |
| 305 | U13 |                   // Neste ponto o job já pode ter sido reivindicado. Nunca | Comentário arquitetural: Neste ponto o job já pode ter sido reivindicado. Nunca. |
| 306 | U13 |                   // destrua a superfície só porque a verificação física falhou. | Comentário arquitetural: destrua a superfície só porque a verificação física falhou.. |
| 307 | U13 |                   log('warn', 'bg', 'GEMINI_WINDOW_MINIMIZE_DEGRADED', | Registra estado/fallback da janela Gemini. |
| 308 | U13 |                     'Job preservado; falhou apenas a confirmação do estado minimizado.', { | Passo operacional de U13: 'Job preservado; falhou apenas a confirmação do estado minimizado.', { |
| 309 | U13 |                       windowId: window.id, | Passo operacional de U13: windowId: window.id, |
| 310 | U13 |                       error: error && error.message ? error.message : 'window_state_error', | Passo operacional de U13: error: error && error.message ? error.message : 'window_state_error', |
| 311 | U13 |                     }); | Fecha estrutura sintática da unidade U13. |
| 312 | U13 |                 } | Fecha estrutura sintática da unidade U13. |
| 313 | U13 |               }, | Fecha estrutura sintática da unidade U13. |
| 314 | U13 |             }; | Fecha estrutura sintática da unidade U13. |
| 315 | U13 |           } | Fecha estrutura sintática da unidade U13. |
| 316 | U13 |         } catch (_error) { | Passo operacional de U13: } catch (_error) { |
| 317 | U13 |           if (createdWindowId !== null) { | Passo operacional de U13: if (createdWindowId !== null) { |
| 318 | U13 |             try { await chrome.windows.remove(createdWindowId); } catch (_e) {} | Solicita fechamento de janela dedicada. |
| 319 | U13 |           } | Fecha estrutura sintática da unidade U13. |
| 320 | U13 |           log('warn', 'bg', 'GEMINI_WINDOW_MINIMIZE_FAILED', 'Janela minimizada indisponível; usando aba inativa', {}); | Registra estado/fallback da janela Gemini. |
| 321 | U13 |         } | Fecha estrutura sintática da unidade U13. |
| 322 | U13 |       } | Fecha estrutura sintática da unidade U13. |
| 323 | U13 |       const tab = await chrome.tabs.create({ url, active: false }); | Cria aba Gemini inativa. |
| 324 | U13 |       return { tab, windowId: tab.windowId, dedicatedWindow: false, ensureWindowState: null }; | Retorno/curto-circuito da unidade U13. |
| 325 | U13 |     } | Fecha estrutura sintática da unidade U13. |
| 326 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 327 | U13 |     // Tombstone apenas em memória: uma Promise de tabs/windows não sobrevive | Comentário arquitetural: Tombstone apenas em memória: uma Promise de tabs/windows não sobrevive. |
| 328 | U13 |     // ao restart do Service Worker, então não há motivo para persistir isso. | Comentário arquitetural: ao restart do Service Worker, então não há motivo para persistir isso.. |
| 329 | U13 |     // Ele serve para distinguir "currentBatchId=null porque A foi cancelado" | Comentário arquitetural: Ele serve para distinguir "currentBatchId=null porque A foi cancelado". |
| 330 | U13 |     // de "currentBatchId=null em um fixture/recovery ainda válido". | Comentário arquitetural: de "currentBatchId=null em um fixture/recovery ainda válido".. |
| 331 | U13 |     const invalidatedLaunchBatchIds = new Set(); | Opera tombstones em memória para promises de abertura tardias. |
| 332 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 333 | U14 |     function invalidateBatchLaunches(batchId) { | Declara função da unidade U14: function invalidateBatchLaunches(batchId) { |
| 334 | U14 |       if (!batchId) return false; | Retorno/curto-circuito da unidade U14. |
| 335 | U14 |       invalidatedLaunchBatchIds.add(batchId); | Opera tombstones em memória para promises de abertura tardias. |
| 336 | U14 |       // Evita crescimento ilimitado durante uma sessão muito longa do worker. | Comentário arquitetural: Evita crescimento ilimitado durante uma sessão muito longa do worker.. |
| 337 | U14 |       while (invalidatedLaunchBatchIds.size > 128) { | Opera tombstones em memória para promises de abertura tardias. |
| 338 | U14 |         const oldest = invalidatedLaunchBatchIds.values().next().value; | Opera tombstones em memória para promises de abertura tardias. |
| 339 | U14 |         invalidatedLaunchBatchIds.delete(oldest); | Opera tombstones em memória para promises de abertura tardias. |
| 340 | U14 |       } | Fecha estrutura sintática da unidade U14. |
| 341 | U14 |       return true; | Retorno/curto-circuito da unidade U14. |
| 342 | U14 |     } | Fecha estrutura sintática da unidade U14. |
| 343 | U14 | ␠ [linha vazia] | Separador visual dentro de U14. |
| 344 | U15 |     function allowBatchLaunches(batchId) { | Declara função da unidade U15: function allowBatchLaunches(batchId) { |
| 345 | U15 |       if (!batchId) return false; | Retorno/curto-circuito da unidade U15. |
| 346 | U15 |       return invalidatedLaunchBatchIds.delete(batchId); | Opera tombstones em memória para promises de abertura tardias. |
| 347 | U15 |     } | Fecha estrutura sintática da unidade U15. |
| 348 | U15 | ␠ [linha vazia] | Separador visual dentro de U15. |
| 349 | U16 |     function launchWasInvalidated(batchId) { | Declara função da unidade U16: function launchWasInvalidated(batchId) { |
| 350 | U16 |       return Boolean( | Retorno/curto-circuito da unidade U16. |
| 351 | U16 |         state.stopRequested \|\| | Respeita gate de cancelamento do lote. |
| 352 | U16 |         (batchId && invalidatedLaunchBatchIds.has(batchId)) \|\| | Opera tombstones em memória para promises de abertura tardias. |
| 353 | U16 |         (batchId && state.completionClaimedBatchId === batchId) \|\| | Protege conclusão de batch contra emissão duplicada. |
| 354 | U16 |         (batchId && state.currentBatchId && batchId !== state.currentBatchId) | Consulta ou altera identidade do batch atualmente ativo. |
| 355 | U16 |       ); | Fecha estrutura sintática da unidade U16. |
| 356 | U16 |     } | Fecha estrutura sintática da unidade U16. |
| 357 | U16 | ␠ [linha vazia] | Separador visual dentro de U16. |
| 358 | U17 |     async function abortInvalidatedLaunch({ | Declara função da unidade U17: async function abortInvalidatedLaunch({ |
| 359 | U17 |       batchId, | Passo operacional de U17: batchId, |
| 360 | U17 |       jobId, | Passo operacional de U17: jobId, |
| 361 | U17 |       geminiTabId, | Passo operacional de U17: geminiTabId, |
| 362 | U17 |       opened, | Passo operacional de U17: opened, |
| 363 | U17 |       indexed = false, | Passo operacional de U17: indexed = false, |
| 364 | U17 |       phase = 'unknown', | Passo operacional de U17: phase = 'unknown', |
| 365 | U17 |     }) { | Passo operacional de U17: }) { |
| 366 | U17 |       if (!launchWasInvalidated(batchId)) return false; | Retorno/curto-circuito da unidade U17. |
| 367 | U17 | ␠ [linha vazia] | Separador visual dentro de U17. |
| 368 | U17 |       if (indexed && (geminiTabId \|\| geminiTabId === 0)) { | Passo operacional de U17: if (indexed && (geminiTabId // geminiTabId === 0)) { |
| 369 | U17 |         indexRemoveJob(geminiTabId); | Remove job do índice após abort/finalização. |
| 370 | U17 |       } | Fecha estrutura sintática da unidade U17. |
| 371 | U17 |       if (geminiTabId \|\| geminiTabId === 0) { | Passo operacional de U17: if (geminiTabId // geminiTabId === 0) { |
| 372 | U17 |         try { clearWatchdog(geminiTabId, jobId); } catch (_e) {} | Limpa watchdog do job. |
| 373 | U17 |         try { | Passo operacional de U17: try { |
| 374 | U17 |           await chrome.storage.local.remove([ | Remove chave durável depois de cleanup/recovery. |
| 375 | U17 |             `gemini_job_${geminiTabId}`, | Passo operacional de U17: `gemini_job_${geminiTabId}`, |
| 376 | U17 |             `wd_data_${geminiTabId}`, | Passo operacional de U17: `wd_data_${geminiTabId}`, |
| 377 | U17 |           ]); | Fecha estrutura sintática da unidade U17. |
| 378 | U17 |         } catch (_e) {} | Passo operacional de U17: } catch (_e) {} |
| 379 | U17 |       } | Fecha estrutura sintática da unidade U17. |
| 380 | U17 | ␠ [linha vazia] | Separador visual dentro de U17. |
| 381 | U17 |       const closeTab = tabId => { | Declara helper/closure local da unidade U17. |
| 382 | U17 |         if (tabId === null \|\| tabId === undefined) return; | Retorno/curto-circuito da unidade U17. |
| 383 | U17 |         try { | Passo operacional de U17: try { |
| 384 | U17 |           chrome.tabs.remove(tabId, () => { void chrome.runtime.lastError; }); | Solicita fechamento de aba. |
| 385 | U17 |         } catch (_e) {} | Passo operacional de U17: } catch (_e) {} |
| 386 | U17 |       }; | Fecha estrutura sintática da unidade U17. |
| 387 | U17 |       if (opened?.dedicatedWindow === true && opened.windowId !== null && opened.windowId !== undefined) { | Passo operacional de U17: if (opened?.dedicatedWindow === true && opened.windowId !== null && opened.windowId !== undefined) { |
| 388 | U17 |         try { | Passo operacional de U17: try { |
| 389 | U17 |           chrome.windows.remove(opened.windowId, () => { void chrome.runtime.lastError; }); | Solicita fechamento de janela dedicada. |
| 390 | U17 |         } catch (_e) { | Passo operacional de U17: } catch (_e) { |
| 391 | U17 |           closeTab(geminiTabId); | Passo operacional de U17: closeTab(geminiTabId); |
| 392 | U17 |         } | Fecha estrutura sintática da unidade U17. |
| 393 | U17 |       } else { | Passo operacional de U17: } else { |
| 394 | U17 |         closeTab(geminiTabId); | Passo operacional de U17: closeTab(geminiTabId); |
| 395 | U17 |       } | Fecha estrutura sintática da unidade U17. |
| 396 | U17 | ␠ [linha vazia] | Separador visual dentro de U17. |
| 397 | U17 |       if (!batchId \|\| !state.currentBatchId \|\| state.currentBatchId === batchId) { | Consulta ou altera identidade do batch atualmente ativo. |
| 398 | U17 |         state.activeJobsCount = Math.max(0, (Number(state.activeJobsCount) \|\| 0) - 1); | Atualiza/consulta contador de slots ativos. |
| 399 | U17 |       } | Fecha estrutura sintática da unidade U17. |
| 400 | U17 |       await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 401 | U17 |       log('warn', 'bg', 'JOB_START_ABORTED', | Registra cancelamento de launch tardio. |
| 402 | U17 |         'Abertura de job cancelada porque o lote foi interrompido ou substituído durante o lançamento.', { | Passo operacional de U17: 'Abertura de job cancelada porque o lote foi interrompido ou substituído durante o lançamento.', { |
| 403 | U17 |           jobId: String(jobId \|\| '').slice(0, 8), | Passo operacional de U17: jobId: String(jobId // '').slice(0, 8), |
| 404 | U17 |           batchId: String(batchId \|\| '').slice(0, 8), | Passo operacional de U17: batchId: String(batchId // '').slice(0, 8), |
| 405 | U17 |           geminiTabId, | Passo operacional de U17: geminiTabId, |
| 406 | U17 |           phase, | Passo operacional de U17: phase, |
| 407 | U17 |           stopRequested: Boolean(state.stopRequested), | Respeita gate de cancelamento do lote. |
| 408 | U17 |           currentBatchId: String(state.currentBatchId \|\| '').slice(0, 8), | Consulta ou altera identidade do batch atualmente ativo. |
| 409 | U17 |         }); | Fecha estrutura sintática da unidade U17. |
| 410 | U17 |       return true; | Retorno/curto-circuito da unidade U17. |
| 411 | U17 |     } | Fecha estrutura sintática da unidade U17. |
| 412 | U17 | ␠ [linha vazia] | Separador visual dentro de U17. |
| 413 | U18 |     async function processNextJob() { | Declara função da unidade U18: async function processNextJob() { |
| 414 | U18 |       const currentBatchAlreadyCompleted = Boolean( | Passo operacional de U18: const currentBatchAlreadyCompleted = Boolean( |
| 415 | U18 |         state.currentBatchId && | Consulta ou altera identidade do batch atualmente ativo. |
| 416 | U18 |         state.completionClaimedBatchId === state.currentBatchId | Protege conclusão de batch contra emissão duplicada. |
| 417 | U18 |       ); | Fecha estrutura sintática da unidade U18. |
| 418 | U18 |       if (!state.stopRequested && | Respeita gate de cancelamento do lote. |
| 419 | U18 |           (!state.currentBatchId \|\| currentBatchAlreadyCompleted) && | Consulta ou altera identidade do batch atualmente ativo. |
| 420 | U18 |           state.jobQueue.length === 0 && state.activeJobsCount === 0 && | Atualiza/consulta contador de slots ativos. |
| 421 | U18 |           Array.isArray(state.pendingBatches) && state.pendingBatches.length > 0) { | Manipula a fila FIFO persistida de batches. |
| 422 | U18 |         const promoted = await promotePendingBatchIfIdle(); | Passo operacional de U18: const promoted = await promotePendingBatchIfIdle(); |
| 423 | U18 |         if (promoted) { | Passo operacional de U18: if (promoted) { |
| 424 | U18 |           await refreshMaxConcurrency(); | Passo operacional de U18: await refreshMaxConcurrency(); |
| 425 | U18 |           return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 426 | U18 |         } | Fecha estrutura sintática da unidade U18. |
| 427 | U18 |       } | Fecha estrutura sintática da unidade U18. |
| 428 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 429 | U18 |       if (state.stopRequested \|\| (state.jobQueue.length === 0 && state.activeJobsCount === 0)) { | Atualiza/consulta contador de slots ativos. |
| 430 | U18 |         const stillOpen = !state.stopRequested ? indexJobsOfBatch(state.currentBatchId).length : 0; | Consulta jobs indexados de um batch ou de todos. |
| 431 | U18 |         if (stillOpen > 0) { | Passo operacional de U18: if (stillOpen > 0) { |
| 432 | U18 |           state.activeJobsCount = Math.max(state.activeJobsCount, stillOpen); | Atualiza/consulta contador de slots ativos. |
| 433 | U18 |           await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 434 | U18 |           return; | Retorno/curto-circuito da unidade U18. |
| 435 | U18 |         } | Fecha estrutura sintática da unidade U18. |
| 436 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 437 | U18 |         if (!state.stopRequested && state.jobQueue.length === 0 && state.activeJobsCount === 0) { | Atualiza/consulta contador de slots ativos. |
| 438 | U18 |           let completion = null; | Passo operacional de U18: let completion = null; |
| 439 | U18 |           let promotedAfterCompletion = null; | Passo operacional de U18: let promotedAfterCompletion = null; |
| 440 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 441 | U18 |           const claimCompletion = snapshot => { | Declara helper/closure local da unidade U18. |
| 442 | U18 |             const batchId = snapshot.currentBatchId \|\| null; | Consulta ou altera identidade do batch atualmente ativo. |
| 443 | U18 |             const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : []; | Passo operacional de U18: const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : []; |
| 444 | U18 |             if (!batchId \|\| snapshot.stopRequested \|\| queued.length > 0 \|\| | Respeita gate de cancelamento do lote. |
| 445 | U18 |                 Number(snapshot.activeJobsCount) > 0 \|\| | Atualiza/consulta contador de slots ativos. |
| 446 | U18 |                 snapshot.completionClaimedBatchId === batchId) { | Protege conclusão de batch contra emissão duplicada. |
| 447 | U18 |               return snapshot; | Retorno/curto-circuito da unidade U18. |
| 448 | U18 |             } | Fecha estrutura sintática da unidade U18. |
| 449 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 450 | U18 |             const completed = Number(snapshot.completedJobs) \|\| 0; | Atualiza/consulta contagem de jobs concluídos com sucesso. |
| 451 | U18 |             const total = Number(snapshot.totalJobs) \|\| 0; | Passo operacional de U18: const total = Number(snapshot.totalJobs) // 0; |
| 452 | U18 |             completion = { | Passo operacional de U18: completion = { |
| 453 | U18 |               batchId, | Passo operacional de U18: batchId, |
| 454 | U18 |               mangaTabId: snapshot.activeMangaTabId \|\| null, | Passo operacional de U18: mangaTabId: snapshot.activeMangaTabId // null, |
| 455 | U18 |               completed, | Passo operacional de U18: completed, |
| 456 | U18 |               total, | Passo operacional de U18: total, |
| 457 | U18 |               hasErrors: completed < total, | Passo operacional de U18: hasErrors: completed < total, |
| 458 | U18 |             }; | Fecha estrutura sintática da unidade U18. |
| 459 | U18 |             snapshot.completionClaimedBatchId = batchId; | Protege conclusão de batch contra emissão duplicada. |
| 460 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 461 | U18 |             const pending = clonePendingBatches(snapshot.pendingBatches); | Manipula a fila FIFO persistida de batches. |
| 462 | U18 |             if (pending.length > 0) { | Passo operacional de U18: if (pending.length > 0) { |
| 463 | U18 |               promotedAfterCompletion = pending.shift(); | Passo operacional de U18: promotedAfterCompletion = pending.shift(); |
| 464 | U18 |               snapshot.pendingBatches = pending; | Manipula a fila FIFO persistida de batches. |
| 465 | U18 |               activateBatchSnapshot(snapshot, promotedAfterCompletion); | Passo operacional de U18: activateBatchSnapshot(snapshot, promotedAfterCompletion); |
| 466 | U18 |             } else { | Passo operacional de U18: } else { |
| 467 | U18 |               snapshot.isProcessing = false; | Passo operacional de U18: snapshot.isProcessing = false; |
| 468 | U18 |               snapshot.activeMangaTabId = null; | Passo operacional de U18: snapshot.activeMangaTabId = null; |
| 469 | U18 |             } | Fecha estrutura sintática da unidade U18. |
| 470 | U18 |             return snapshot; | Retorno/curto-circuito da unidade U18. |
| 471 | U18 |           }; | Fecha estrutura sintática da unidade U18. |
| 472 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 473 | U18 |           if (typeof state.mutate === 'function') { | Usa mutação serializada do snapshot quando disponível para evitar races. |
| 474 | U18 |             await state.mutate(claimCompletion); | Usa mutação serializada do snapshot quando disponível para evitar races. |
| 475 | U18 |           } else { | Passo operacional de U18: } else { |
| 476 | U18 |             claimCompletion(state); | Passo operacional de U18: claimCompletion(state); |
| 477 | U18 |             await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 478 | U18 |           } | Fecha estrutura sintática da unidade U18. |
| 479 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 480 | U18 |           if (completion) { | Passo operacional de U18: if (completion) { |
| 481 | U18 |             if (completion.mangaTabId) { | Passo operacional de U18: if (completion.mangaTabId) { |
| 482 | U18 |               chrome.tabs.sendMessage(completion.mangaTabId, { | Envia mensagem IPC a uma aba. |
| 483 | U18 |                 action: 'BATCH_COMPLETE', | Passo operacional de U18: action: 'BATCH_COMPLETE', |
| 484 | U18 |                 batchId: completion.batchId, | Passo operacional de U18: batchId: completion.batchId, |
| 485 | U18 |                 hasErrors: completion.hasErrors, | Passo operacional de U18: hasErrors: completion.hasErrors, |
| 486 | U18 |               }, () => { void chrome.runtime.lastError; }); | Passo operacional de U18: }, () => { void chrome.runtime.lastError; }); |
| 487 | U18 |             } | Fecha estrutura sintática da unidade U18. |
| 488 | U18 |             log(completion.hasErrors ? 'warn' : 'success', 'bg', 'BATCH_DONE', | Registra conclusão única do batch. |
| 489 | U18 |               completion.hasErrors | Passo operacional de U18: completion.hasErrors |
| 490 | U18 |                 ? 'Lote encerrado com falhas; traduções não concluídas.' | Passo operacional de U18: ? 'Lote encerrado com falhas; traduções não concluídas.' |
| 491 | U18 |                 : 'Lote finalizado com sucesso!', | Passo operacional de U18: : 'Lote finalizado com sucesso!', |
| 492 | U18 |               { | Passo operacional de U18: { |
| 493 | U18 |                 batchId: String(completion.batchId).slice(0, 8), | Passo operacional de U18: batchId: String(completion.batchId).slice(0, 8), |
| 494 | U18 |                 completed: completion.completed, | Passo operacional de U18: completed: completion.completed, |
| 495 | U18 |                 total: completion.total, | Passo operacional de U18: total: completion.total, |
| 496 | U18 |                 hasErrors: completion.hasErrors, | Passo operacional de U18: hasErrors: completion.hasErrors, |
| 497 | U18 |               }); | Fecha estrutura sintática da unidade U18. |
| 498 | U18 |           } | Fecha estrutura sintática da unidade U18. |
| 499 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 500 | U18 |           if (promotedAfterCompletion) { | Passo operacional de U18: if (promotedAfterCompletion) { |
| 501 | U18 |             log('info', 'bg', 'BATCH_PROMOTED', | Registra promoção FIFO. |
| 502 | U18 |               'Próximo lote da fila FIFO foi promovido após a conclusão do lote anterior.', { | Passo operacional de U18: 'Próximo lote da fila FIFO foi promovido após a conclusão do lote anterior.', { |
| 503 | U18 |                 previousBatchId: String(completion?.batchId \|\| '').slice(0, 8), | Passo operacional de U18: previousBatchId: String(completion?.batchId // '').slice(0, 8), |
| 504 | U18 |                 batchId: String(promotedAfterCompletion.batchId \|\| '').slice(0, 8), | Passo operacional de U18: batchId: String(promotedAfterCompletion.batchId // '').slice(0, 8), |
| 505 | U18 |                 pendingCount: Array.isArray(state.pendingBatches) ? state.pendingBatches.length : 0, | Manipula a fila FIFO persistida de batches. |
| 506 | U18 |                 totalJobs: Array.isArray(promotedAfterCompletion.images) | Passo operacional de U18: totalJobs: Array.isArray(promotedAfterCompletion.images) |
| 507 | U18 |                   ? promotedAfterCompletion.images.length | Passo operacional de U18: ? promotedAfterCompletion.images.length |
| 508 | U18 |                   : 0, | Passo operacional de U18: : 0, |
| 509 | U18 |               }); | Fecha estrutura sintática da unidade U18. |
| 510 | U18 |             sendProgress(promotedAfterCompletion.mangaTabId, '▶️ INICIANDO LOTE DA FILA...'); | Passo operacional de U18: sendProgress(promotedAfterCompletion.mangaTabId, '▶️ INICIANDO LOTE DA FILA...'); |
| 511 | U18 |             await refreshMaxConcurrency(); | Passo operacional de U18: await refreshMaxConcurrency(); |
| 512 | U18 |             return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 513 | U18 |           } | Fecha estrutura sintática da unidade U18. |
| 514 | U18 |         } | Fecha estrutura sintática da unidade U18. |
| 515 | U18 |         return; | Retorno/curto-circuito da unidade U18. |
| 516 | U18 |       } | Fecha estrutura sintática da unidade U18. |
| 517 | U18 |       if (state.stopRequested \|\| state.jobQueue.length === 0 \|\| state.activeJobsCount >= state._cachedMaxCon) return; | Atualiza/consulta contador de slots ativos. |
| 518 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 519 | U18 |       const job = state.jobQueue.shift(); | Passo operacional de U18: const job = state.jobQueue.shift(); |
| 520 | U18 |       if (!job) return; | Retorno/curto-circuito da unidade U18. |
| 521 | U18 |       state.activeJobsCount += 1; | Atualiza/consulta contador de slots ativos. |
| 522 | U18 |       const { mangaTabId, index, prompt } = job; | Passo operacional de U18: const { mangaTabId, index, prompt } = job; |
| 523 | U18 |       const jobId = generateId(); | Passo operacional de U18: const jobId = generateId(); |
| 524 | U18 |       const batchId = job.batchId \|\| state.currentBatchId; | Consulta ou altera identidade do batch atualmente ativo. |
| 525 | U18 |       state.activeMangaTabId = mangaTabId; | Passo operacional de U18: state.activeMangaTabId = mangaTabId; |
| 526 | U18 |       await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 527 | U18 |       log('info', 'bg', 'JOB_START', 'Iniciando imagem', { index, completedJobs: state.completedJobs, totalJobs: state.totalJobs }); | Atualiza/consulta contagem de jobs concluídos com sucesso. |
| 528 | U18 |       sendProgress(mangaTabId, `🔄 ABRINDO GEMINI (${state.completedJobs + 1}/${state.totalJobs})...`); | Atualiza/consulta contagem de jobs concluídos com sucesso. |
| 529 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 530 | U18 |       try { | Passo operacional de U18: try { |
| 531 | U18 |         const settings = await chrome.storage.local.get(['geminiBaseUrl', 'geminiExecutionMode']); | Consulta storage local durável. |
| 532 | U18 |         let baseUrl = settings.geminiBaseUrl \|\| 'https://gemini.google.com/app'; | Passo operacional de U18: let baseUrl = settings.geminiBaseUrl // 'https://gemini.google.com/app'; |
| 533 | U18 |         if (baseUrl === 'https://gemini.google.com/' \|\| baseUrl === 'https://gemini.google.com') baseUrl = 'https://gemini.google.com/app'; | Passo operacional de U18: if (baseUrl === 'https://gemini.google.com/' // baseUrl === 'https://gemini.google.com') baseUrl = 'https://gemini.google.com/app'; |
| 534 | U18 |         const executionMode = settings.geminiExecutionMode \|\| 'temp_chat'; | Passo operacional de U18: const executionMode = settings.geminiExecutionMode // 'temp_chat'; |
| 535 | U18 |         const opened = await openGeminiTab(buildGeminiJobUrl(baseUrl, index, jobId), executionMode); | Passo operacional de U18: const opened = await openGeminiTab(buildGeminiJobUrl(baseUrl, index, jobId), executionMode); |
| 536 | U18 |         if (!opened.tab) throw new Error('Não foi possível obter a aba do Gemini'); | Passo operacional de U18: if (!opened.tab) throw new Error('Não foi possível obter a aba do Gemini'); |
| 537 | U18 |         const openedTabId = opened.tab.id; | Passo operacional de U18: const openedTabId = opened.tab.id; |
| 538 | U18 |         let canonicalTabId = await resolveCanonicalTabId(openedTabId); | Resolve tabId através da identidade canônica/aliases. |
| 539 | U18 |         if (await abortInvalidatedLaunch({ | Passo operacional de U18: if (await abortInvalidatedLaunch({ |
| 540 | U18 |           batchId, jobId, geminiTabId: canonicalTabId, opened, | Passo operacional de U18: batchId, jobId, geminiTabId: canonicalTabId, opened, |
| 541 | U18 |           indexed: false, phase: 'after_tab_create', | Passo operacional de U18: indexed: false, phase: 'after_tab_create', |
| 542 | U18 |         })) return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 543 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 544 | U18 |         let record = { | Passo operacional de U18: let record = { |
| 545 | U18 |           jobId, batchId, mangaTabId, index, prompt, | Passo operacional de U18: jobId, batchId, mangaTabId, index, prompt, |
| 546 | U18 |           geminiTabId: canonicalTabId, | Passo operacional de U18: geminiTabId: canonicalTabId, |
| 547 | U18 |           canonicalTabId, | Passo operacional de U18: canonicalTabId, |
| 548 | U18 |           replacementCount: canonicalTabId === openedTabId ? 0 : 1, | Passo operacional de U18: replacementCount: canonicalTabId === openedTabId ? 0 : 1, |
| 549 | U18 |           windowId: opened.windowId, | Passo operacional de U18: windowId: opened.windowId, |
| 550 | U18 |           dedicatedWindow: opened.dedicatedWindow === true, | Passo operacional de U18: dedicatedWindow: opened.dedicatedWindow === true, |
| 551 | U18 |           executionMode, | Passo operacional de U18: executionMode, |
| 552 | U18 |           state: 'opening', | Passo operacional de U18: state: 'opening', |
| 553 | U18 |           attempt: 1, | Passo operacional de U18: attempt: 1, |
| 554 | U18 |           createdAt: Date.now(), | Passo operacional de U18: createdAt: Date.now(), |
| 555 | U18 |           updatedAt: Date.now(), | Passo operacional de U18: updatedAt: Date.now(), |
| 556 | U18 |         }; | Fecha estrutura sintática da unidade U18. |
| 557 | U18 |         await chrome.storage.local.set({ [`gemini_job_${canonicalTabId}`]: record }); | Persiste estado/journal no storage local. |
| 558 | U18 |         indexAddJob({ geminiTabId: canonicalTabId, jobId, batchId, mangaTabId, index }); | Insere job no índice runtime/durável do lote. |
| 559 | U18 |         await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 560 | U18 |         if (await abortInvalidatedLaunch({ | Passo operacional de U18: if (await abortInvalidatedLaunch({ |
| 561 | U18 |           batchId, jobId, geminiTabId: canonicalTabId, opened, | Passo operacional de U18: batchId, jobId, geminiTabId: canonicalTabId, opened, |
| 562 | U18 |           indexed: true, phase: 'after_job_persist', | Passo operacional de U18: indexed: true, phase: 'after_job_persist', |
| 563 | U18 |         })) return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 564 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 565 | U18 |         // A confirmação física da janela minimizada vem DEPOIS da persistência | Comentário arquitetural: A confirmação física da janela minimizada vem DEPOIS da persistência. |
| 566 | U18 |         // do job. Assim o content script nunca precisa esperar update/get de | Comentário arquitetural: do job. Assim o content script nunca precisa esperar update/get de. |
| 567 | U18 |         // window para conseguir reivindicar seu job. | Comentário arquitetural: window para conseguir reivindicar seu job.. |
| 568 | U18 |         if (typeof opened.ensureWindowState === 'function') { | Passo operacional de U18: if (typeof opened.ensureWindowState === 'function') { |
| 569 | U18 |           await opened.ensureWindowState(); | Passo operacional de U18: await opened.ensureWindowState(); |
| 570 | U18 |         } | Fecha estrutura sintática da unidade U18. |
| 571 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 572 | U18 |         // Fecha a corrida nas duas ordens: | Comentário arquitetural: Fecha a corrida nas duas ordens:. |
| 573 | U18 |         // 1) replacement antes da persistência -> alias já existe e migramos; | Comentário arquitetural: 1) replacement antes da persistência -> alias já existe e migramos;. |
| 574 | U18 |         // 2) replacement depois da persistência -> listener migra os registros. | Comentário arquitetural: 2) replacement depois da persistência -> listener migra os registros.. |
| 575 | U18 |         // O recheck só ocorre DEPOIS de job + índice existirem, de modo que um | Comentário arquitetural: O recheck só ocorre DEPOIS de job + índice existirem, de modo que um. |
| 576 | U18 |         // listener concorrente sempre veja tudo ou o recheck repare o que faltou. | Comentário arquitetural: listener concorrente sempre veja tudo ou o recheck repare o que faltou.. |
| 577 | U18 |         const latestCanonicalTabId = await resolveCanonicalTabId(openedTabId); | Resolve tabId através da identidade canônica/aliases. |
| 578 | U18 |         if (latestCanonicalTabId !== canonicalTabId) { | Passo operacional de U18: if (latestCanonicalTabId !== canonicalTabId) { |
| 579 | U18 |           canonicalTabId = await migrateTabIdentity(canonicalTabId, latestCanonicalTabId, { jobId }); | Migra registros quando o Chrome substituiu a aba. |
| 580 | U18 |           const migrated = await chrome.storage.local.get([`gemini_job_${canonicalTabId}`]); | Consulta storage local durável. |
| 581 | U18 |           record = migrated[`gemini_job_${canonicalTabId}`] \|\| { ...record, geminiTabId: canonicalTabId, canonicalTabId }; | Passo operacional de U18: record = migrated[`gemini_job_${canonicalTabId}`] // { ...record, geminiTabId: canonicalTabId, canonicalTabId }; |
| 582 | U18 |         } | Fecha estrutura sintática da unidade U18. |
| 583 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 584 | U18 |         canonicalTabId = await resolveCanonicalTabId(openedTabId); | Resolve tabId através da identidade canônica/aliases. |
| 585 | U18 |         if (await abortInvalidatedLaunch({ | Passo operacional de U18: if (await abortInvalidatedLaunch({ |
| 586 | U18 |           batchId, jobId, geminiTabId: canonicalTabId, opened, | Passo operacional de U18: batchId, jobId, geminiTabId: canonicalTabId, opened, |
| 587 | U18 |           indexed: true, phase: 'after_tab_identity', | Passo operacional de U18: indexed: true, phase: 'after_tab_identity', |
| 588 | U18 |         })) return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 589 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 590 | U18 |         log('info', 'bg', 'TAB_CREATED_FOR_JOB', 'Aba Gemini associada ao job', { | Registra vínculo final entre job e tab canônica. |
| 591 | U18 |           oldTabId: openedTabId, | Passo operacional de U18: oldTabId: openedTabId, |
| 592 | U18 |           newTabId: canonicalTabId, | Passo operacional de U18: newTabId: canonicalTabId, |
| 593 | U18 |           jobIdPrefix: String(jobId).slice(0, 8), | Passo operacional de U18: jobIdPrefix: String(jobId).slice(0, 8), |
| 594 | U18 |           index, | Passo operacional de U18: index, |
| 595 | U18 |         }); | Fecha estrutura sintática da unidade U18. |
| 596 | U18 |         await armWatchdog(mangaTabId, index, canonicalTabId, jobId); | Arma watchdog do job. |
| 597 | U18 |         if (await abortInvalidatedLaunch({ | Passo operacional de U18: if (await abortInvalidatedLaunch({ |
| 598 | U18 |           batchId, jobId, geminiTabId: canonicalTabId, opened, | Passo operacional de U18: batchId, jobId, geminiTabId: canonicalTabId, opened, |
| 599 | U18 |           indexed: true, phase: 'after_watchdog_arm', | Passo operacional de U18: indexed: true, phase: 'after_watchdog_arm', |
| 600 | U18 |         })) return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 601 | U18 |         return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 602 | U18 |       } catch (error) { | Passo operacional de U18: } catch (error) { |
| 603 | U18 |         const message = error && error.message ? error.message : 'Falha ao abrir Gemini'; | Passo operacional de U18: const message = error && error.message ? error.message : 'Falha ao abrir Gemini'; |
| 604 | U18 |         const belongsToCurrentBatch = !state.currentBatchId \|\| state.currentBatchId === batchId; | Consulta ou altera identidade do batch atualmente ativo. |
| 605 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 606 | U18 |         if (belongsToCurrentBatch) { | Passo operacional de U18: if (belongsToCurrentBatch) { |
| 607 | U18 |           state.activeJobsCount = Math.max(0, state.activeJobsCount - 1); | Atualiza/consulta contador de slots ativos. |
| 608 | U18 |           log('error', 'bg', 'JOB_ERROR', 'Erro ao abrir Gemini', { | Passo operacional de U18: log('error', 'bg', 'JOB_ERROR', 'Erro ao abrir Gemini', { |
| 609 | U18 |             index, | Passo operacional de U18: index, |
| 610 | U18 |             error: message, | Passo operacional de U18: error: message, |
| 611 | U18 |             batchId: String(batchId \|\| '').slice(0, 8), | Passo operacional de U18: batchId: String(batchId // '').slice(0, 8), |
| 612 | U18 |           }); | Fecha estrutura sintática da unidade U18. |
| 613 | U18 |           chrome.tabs.sendMessage(mangaTabId, { | Envia mensagem IPC a uma aba. |
| 614 | U18 |             action: 'SHOW_ERROR_INTEGRATED', | Passo operacional de U18: action: 'SHOW_ERROR_INTEGRATED', |
| 615 | U18 |             errorMsg: `Erro ao abrir: ${message}`, | Passo operacional de U18: errorMsg: `Erro ao abrir: ${message}`, |
| 616 | U18 |             imgIndex: index, | Passo operacional de U18: imgIndex: index, |
| 617 | U18 |             isDebug: false, | Passo operacional de U18: isDebug: false, |
| 618 | U18 |             batchId, | Passo operacional de U18: batchId, |
| 619 | U18 |           }, () => { void chrome.runtime.lastError; }); | Passo operacional de U18: }, () => { void chrome.runtime.lastError; }); |
| 620 | U18 |         } else { | Passo operacional de U18: } else { |
| 621 | U18 |           // A/B/C/... podem trocar de posição enquanto uma API de tabs/windows | Comentário arquitetural: A/B/C/... podem trocar de posição enquanto uma API de tabs/windows. |
| 622 | U18 |           // ainda está pendente. Um erro tardio de A não pertence à contabilidade | Comentário arquitetural: ainda está pendente. Um erro tardio de A não pertence à contabilidade. |
| 623 | U18 |           // de B e não pode consumir/devolver slots do lote promovido. | Comentário arquitetural: de B e não pode consumir/devolver slots do lote promovido.. |
| 624 | U18 |           log('warn', 'bg', 'JOB_ERROR_FOREIGN_BATCH_IGNORED', | Passo operacional de U18: log('warn', 'bg', 'JOB_ERROR_FOREIGN_BATCH_IGNORED', |
| 625 | U18 |             'Falha tardia de abertura pertence a lote anterior; contadores do lote atual foram preservados.', { | Passo operacional de U18: 'Falha tardia de abertura pertence a lote anterior; contadores do lote atual foram preservados.', { |
| 626 | U18 |               index, | Passo operacional de U18: index, |
| 627 | U18 |               error: message, | Passo operacional de U18: error: message, |
| 628 | U18 |               batchId: String(batchId \|\| '').slice(0, 8), | Passo operacional de U18: batchId: String(batchId // '').slice(0, 8), |
| 629 | U18 |               currentBatchId: String(state.currentBatchId \|\| '').slice(0, 8), | Consulta ou altera identidade do batch atualmente ativo. |
| 630 | U18 |             }); | Fecha estrutura sintática da unidade U18. |
| 631 | U18 |         } | Fecha estrutura sintática da unidade U18. |
| 632 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 633 | U18 |         await syncState(); | Sincroniza estado durável após mutação fora de state.mutate. |
| 634 | U18 |         return processNextJob(); | Retorno/curto-circuito da unidade U18. |
| 635 | U18 |       } | Fecha estrutura sintática da unidade U18. |
| 636 | U18 |     } | Fecha estrutura sintática da unidade U18. |
| 637 | U18 | ␠ [linha vazia] | Separador visual dentro de U18. |
| 638 | U19 |     async function finalizeJob(geminiTabId, mangaTabId, fromError = false) { | Declara função da unidade U19: async function finalizeJob(geminiTabId, mangaTabId, fromError = false) { |
| 639 | U19 |       if (isFinalized(geminiTabId)) return false; | Retorno/curto-circuito da unidade U19. |
| 640 | U19 | ␠ [linha vazia] | Separador visual dentro de U19. |
| 641 | U19 |       // Leitura direta primeiro: no caminho normal isso mantém exatamente uma | Comentário arquitetural: Leitura direta primeiro: no caminho normal isso mantém exatamente uma. |
| 642 | U19 |       // ida ao storage. Se a chave física já foi movida, então resolvemos alias. | Comentário arquitetural: ida ao storage. Se a chave física já foi movida, então resolvemos alias.. |
| 643 | U19 |       let jobKey = `gemini_job_${geminiTabId}`; | Passo operacional de U19: let jobKey = `gemini_job_${geminiTabId}`; |
| 644 | U19 |       let key = markerKey(geminiTabId); | Passo operacional de U19: let key = markerKey(geminiTabId); |
| 645 | U19 |       let data = await chrome.storage.local.get([jobKey, key, 'geminiExecutionMode', 'debugMode']); | Consulta storage local durável. |
| 646 | U19 |       if (!data[jobKey]) { | Passo operacional de U19: if (!data[jobKey]) { |
| 647 | U19 |         const canonicalTabId = await resolveCanonicalTabId(geminiTabId); | Resolve tabId através da identidade canônica/aliases. |
| 648 | U19 |         if (canonicalTabId !== geminiTabId) { | Passo operacional de U19: if (canonicalTabId !== geminiTabId) { |
| 649 | U19 |           geminiTabId = canonicalTabId; | Passo operacional de U19: geminiTabId = canonicalTabId; |
| 650 | U19 |           if (isFinalized(geminiTabId)) return false; | Retorno/curto-circuito da unidade U19. |
| 651 | U19 |           jobKey = `gemini_job_${geminiTabId}`; | Passo operacional de U19: jobKey = `gemini_job_${geminiTabId}`; |
| 652 | U19 |           key = markerKey(geminiTabId); | Passo operacional de U19: key = markerKey(geminiTabId); |
| 653 | U19 |           data = await chrome.storage.local.get([jobKey, key, 'geminiExecutionMode', 'debugMode']); | Consulta storage local durável. |
| 654 | U19 |         } | Fecha estrutura sintática da unidade U19. |
| 655 | U19 |       } | Fecha estrutura sintática da unidade U19. |
| 656 | U19 |       const job = data[jobKey] \|\| {}; | Passo operacional de U19: const job = data[jobKey] // {}; |
| 657 | U19 |       const prior = data[key]; | Passo operacional de U19: const prior = data[key]; |
| 658 | U19 |       if (prior && prior.expiresAt > Date.now() && (!job.jobId \|\| prior.jobId === job.jobId)) { | Passo operacional de U19: if (prior && prior.expiresAt > Date.now() && (!job.jobId // prior.jobId === job.jobId)) { |
| 659 | U19 |         markFinalized(geminiTabId); | Passo operacional de U19: markFinalized(geminiTabId); |
| 660 | U19 |         return false; | Retorno/curto-circuito da unidade U19. |
| 661 | U19 |       } | Fecha estrutura sintática da unidade U19. |
| 662 | U19 |       markFinalized(geminiTabId); | Passo operacional de U19: markFinalized(geminiTabId); |
| 663 | U19 |       const marker = { jobId: job.jobId \|\| null, fromError: Boolean(fromError), finalizedAt: Date.now(), expiresAt: Date.now() + finalizedMarkerTtlMinutes * 60_000, accountingApplied: false }; | Passo operacional de U19: const marker = { jobId: job.jobId // null, fromError: Boolean(fromError), finalizedAt: Date.now(), expiresAt: Date.now() + finalizedMarkerTtlMinutes * 60_000, accountingApplied: false }; |
| 664 | U19 |       // A marca é escrita antes de qualquer efeito. No restart, a reconciliação | Comentário arquitetural: A marca é escrita antes de qualquer efeito. No restart, a reconciliação. |
| 665 | U19 |       // pode finalizar a contabilidade pendente usando este registro. | Comentário arquitetural: pode finalizar a contabilidade pendente usando este registro.. |
| 666 | U19 |       await chrome.storage.local.set({ [key]: marker }); | Persiste estado/journal no storage local. |
| 667 | U19 |       chrome.alarms.create(markerAlarm(geminiTabId), { delayInMinutes: finalizedMarkerTtlMinutes }); | Cria alarme durável do marcador de finalização. |
| 668 | U19 |       await applyFinalizationAccounting(geminiTabId, job, marker); | Passo operacional de U19: await applyFinalizationAccounting(geminiTabId, job, marker); |
| 669 | U19 |       await chrome.storage.local.set({ [key]: { ...marker, accountingApplied: true } }); | Persiste estado/journal no storage local. |
| 670 | U19 |       clearWatchdog(geminiTabId, job.jobId); | Limpa watchdog do job. |
| 671 | U19 |       await chrome.storage.local.remove(jobKey); | Remove chave durável depois de cleanup/recovery. |
| 672 | U19 | ␠ [linha vazia] | Separador visual dentro de U19. |
| 673 | U19 |       if (data.debugMode === true) { processNextJob(); return true; } | Retorno/curto-circuito da unidade U19. |
| 674 | U19 |       const executionMode = job.executionMode \|\| data.geminiExecutionMode \|\| 'temp_chat'; | Passo operacional de U19: const executionMode = job.executionMode // data.geminiExecutionMode // 'temp_chat'; |
| 675 | U19 |       const closeGeminiSurface = tab => { | Declara helper/closure local da unidade U19. |
| 676 | U19 |         if (job.dedicatedWindow === true && tab?.windowId) { | Passo operacional de U19: if (job.dedicatedWindow === true && tab?.windowId) { |
| 677 | U19 |           chrome.windows.remove(tab.windowId, () => { void chrome.runtime.lastError; }); | Solicita fechamento de janela dedicada. |
| 678 | U19 |           return; | Retorno/curto-circuito da unidade U19. |
| 679 | U19 |         } | Fecha estrutura sintática da unidade U19. |
| 680 | U19 |         chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; }); | Solicita fechamento de aba. |
| 681 | U19 |       }; | Fecha estrutura sintática da unidade U19. |
| 682 | U19 |       if (executionMode === 'temp_chat') { | Passo operacional de U19: if (executionMode === 'temp_chat') { |
| 683 | U19 |         setTimeout(() => chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; }), 600); | Solicita fechamento de aba. |
| 684 | U19 |         processNextJob(); | Passo operacional de U19: processNextJob(); |
| 685 | U19 |         return true; | Retorno/curto-circuito da unidade U19. |
| 686 | U19 |       } | Fecha estrutura sintática da unidade U19. |
| 687 | U19 |       chrome.tabs.get(geminiTabId, async tab => { | Obtém metadados atuais da aba Gemini. |
| 688 | U19 |         if (chrome.runtime.lastError \|\| !tab) { | Passo operacional de U19: if (chrome.runtime.lastError // !tab) { |
| 689 | U19 |           chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; }); | Solicita fechamento de aba. |
| 690 | U19 |           processNextJob(); | Passo operacional de U19: processNextJob(); |
| 691 | U19 |           return; | Retorno/curto-circuito da unidade U19. |
| 692 | U19 |         } | Fecha estrutura sintática da unidade U19. |
| 693 | U19 |         const shouldDeleteConversation = executionMode === 'minimized_window' \|\| executionMode === 'background_delete'; | Passo operacional de U19: const shouldDeleteConversation = executionMode === 'minimized_window' // executionMode === 'background_delete'; |
| 694 | U19 |         if (!shouldDeleteConversation) { | Passo operacional de U19: if (!shouldDeleteConversation) { |
| 695 | U19 |           chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; }); | Solicita fechamento de aba. |
| 696 | U19 |           processNextJob(); | Passo operacional de U19: processNextJob(); |
| 697 | U19 |           return; | Retorno/curto-circuito da unidade U19. |
| 698 | U19 |         } | Fecha estrutura sintática da unidade U19. |
| 699 | U19 |         // Resultado já foi persistido no leitor. Agora a conversa pode ser | Comentário arquitetural: Resultado já foi persistido no leitor. Agora a conversa pode ser. |
| 700 | U19 |         // excluída sem risco de perder os bytes traduzidos. | Comentário arquitetural: excluída sem risco de perder os bytes traduzidos.. |
| 701 | U19 |         const activeUrl = tab.url \|\| ''; | Passo operacional de U19: const activeUrl = tab.url // ''; |
| 702 | U19 |         if (fromError && !/\/app\/[^/?#]+/.test(activeUrl)) { | Passo operacional de U19: if (fromError && !/\/app\/[^/?#]+/.test(activeUrl)) { |
| 703 | U19 |           log('info', 'bg', 'DELETE_SKIPPED_NO_CONVERSATION', 'Job falhou antes de criar conversa; não há ID para apagar', {}); | Implementa/loga exclusão pós-persistência da conversa. |
| 704 | U19 |           closeGeminiSurface(tab); | Passo operacional de U19: closeGeminiSurface(tab); |
| 705 | U19 |           processNextJob(); | Passo operacional de U19: processNextJob(); |
| 706 | U19 |           return; | Retorno/curto-circuito da unidade U19. |
| 707 | U19 |         } | Fecha estrutura sintática da unidade U19. |
| 708 | U19 |         const stored = await chrome.storage.local.get(['deleting_urls']); | Consulta storage local durável. |
| 709 | U19 |         const deletingUrls = Array.isArray(stored.deleting_urls) ? stored.deleting_urls : []; | Passo operacional de U19: const deletingUrls = Array.isArray(stored.deleting_urls) ? stored.deleting_urls : []; |
| 710 | U19 |         if (activeUrl && !deletingUrls.includes(activeUrl)) deletingUrls.push(activeUrl); | Passo operacional de U19: if (activeUrl && !deletingUrls.includes(activeUrl)) deletingUrls.push(activeUrl); |
| 711 | U19 |         await chrome.storage.local.set({ deleting_urls: deletingUrls }); | Persiste estado/journal no storage local. |
| 712 | U19 |         chrome.tabs.sendMessage(geminiTabId, { action: 'DELETE_CONVERSATION' }, response => { | Envia mensagem IPC a uma aba. |
| 713 | U19 |           const deleteError = chrome.runtime.lastError; | Passo operacional de U19: const deleteError = chrome.runtime.lastError; |
| 714 | U19 |           log(deleteError \|\| response?.ok === false ? 'warn' : 'success', 'bg', | Passo operacional de U19: log(deleteError // response?.ok === false ? 'warn' : 'success', 'bg', |
| 715 | U19 |             deleteError \|\| response?.ok === false ? 'POST_PERSIST_DELETE_DEFERRED' : 'POST_PERSIST_DELETE_OK', | Implementa/loga exclusão pós-persistência da conversa. |
| 716 | U19 |             deleteError \|\| response?.ok === false | Passo operacional de U19: deleteError // response?.ok === false |
| 717 | U19 |               ? 'Resultado já persistido; exclusão da conversa não confirmou imediatamente.' | Passo operacional de U19: ? 'Resultado já persistido; exclusão da conversa não confirmou imediatamente.' |
| 718 | U19 |               : 'Conversa excluída depois da persistência confirmada do resultado.', | Passo operacional de U19: : 'Conversa excluída depois da persistência confirmada do resultado.', |
| 719 | U19 |             { jobId: String(job.jobId \|\| '').slice(0, 8), batchId: String(job.batchId \|\| '').slice(0, 8) }); | Passo operacional de U19: { jobId: String(job.jobId // '').slice(0, 8), batchId: String(job.batchId // '').slice(0, 8) }); |
| 720 | U19 |         }); | Fecha estrutura sintática da unidade U19. |
| 721 | U19 |         processNextJob(); | Passo operacional de U19: processNextJob(); |
| 722 | U19 |         setTimeout(() => { | Passo operacional de U19: setTimeout(() => { |
| 723 | U19 |           chrome.storage.local.get(['deleting_urls']).then(next => { | Consulta storage local durável. |
| 724 | U19 |             const urls = (next.deleting_urls \|\| []).filter(url => url !== activeUrl); | Declara helper/closure local da unidade U19. |
| 725 | U19 |             return chrome.storage.local.set({ deleting_urls: urls }); | Persiste estado/journal no storage local. |
| 726 | U19 |           }).catch(() => {}); | Passo operacional de U19: }).catch(() => {}); |
| 727 | U19 |           closeGeminiSurface(tab); | Passo operacional de U19: closeGeminiSurface(tab); |
| 728 | U19 |         }, 18_000); | Passo operacional de U19: }, 18_000); |
| 729 | U19 |       }); | Fecha estrutura sintática da unidade U19. |
| 730 | U19 |       return true; | Retorno/curto-circuito da unidade U19. |
| 731 | U19 |     } | Fecha estrutura sintática da unidade U19. |
| 732 | U19 | ␠ [linha vazia] | Separador visual dentro de U19. |
| 733 | U20 |     return { | Retorno/curto-circuito da unidade U20. |
| 734 | U20 |       updateJobState, | Passo operacional de U20: updateJobState, |
| 735 | U20 |       assertJobOwnership, | Passo operacional de U20: assertJobOwnership, |
| 736 | U20 |       refreshMaxConcurrency, | Passo operacional de U20: refreshMaxConcurrency, |
| 737 | U20 |       processNextJob, | Passo operacional de U20: processNextJob, |
| 738 | U20 |       finalizeJob, | Passo operacional de U20: finalizeJob, |
| 739 | U20 |       recoverPendingFinalization, | Passo operacional de U20: recoverPendingFinalization, |
| 740 | U20 |       recoverPersistedResult, | Passo operacional de U20: recoverPersistedResult, |
| 741 | U20 |       invalidateBatchLaunches, | Passo operacional de U20: invalidateBatchLaunches, |
| 742 | U20 |       allowBatchLaunches, | Passo operacional de U20: allowBatchLaunches, |
| 743 | U20 |     }; | Fecha estrutura sintática da unidade U20. |
| 744 | U20 |   } | Fecha estrutura sintática da unidade U20. |
| 745 | U20 |   scope.MangaTranslatorJobsLifecycle = { createLifecycle }; | Passo operacional de U20: scope.MangaTranslatorJobsLifecycle = { createLifecycle }; |
| 746 | U20 | })(typeof self !== 'undefined' ? self : globalThis); | Passo operacional de U20: })(typeof self !== 'undefined' ? self : globalThis); |
| 747 | U21 | ⏎ [newline final] | Newline terminal editorial. |

## Auditoria final

- [x] SHA e fonte integral conferidos;
- [x] 746 linhas + newline = 747/747 posições;
- [x] todas as funções/exportações mapeadas;
- [x] scheduler, FIFO, ownership, tab replacement, watchdog e finalização explicados;
- [x] MV3/recovery/journal detalhados;
- [x] suítes diretas separadas de integração e simulação;
- [x] riscos de concorrência, timers, settings e fallback de janela explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `e4ab9f6c54725a5a8e3f5f3c0e1cbd7a0e1c87e5`.

# Bíblia técnica — tests/unit/content-manga/audio-synthesis-full.test.js

> **Estado documental:** correções 191-001 a 191-024 aplicadas e validadas; revisão técnica pronta para novo par independente PRIMARY + ADVERSARIAL  
> **SHA auditado:** `92722a127b1068fd4d4ac20d5ccd12f7e9a1f971`  
> **Índice do corpus:** 191  
> **Tipo:** integração Jest real da síntese/lifecycle Web Audio de `content_manga.js`  
> **Linhas textuais:** **2357**  
> **Posições documentais:** **2358**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte #191 carrega o bundle Manga real via `loadContentScript()` e dispara os caminhos públicos que entram nas funções de áudio encapsuladas em `content_manga.js`.

Não há mirror local de `playErrorSound`/`playSuccessSound` como prova principal. O teste controla apenas a Web Audio API e as fronteiras Chrome necessárias para observar o runtime verdadeiro.

## 2. Dependências revalidadas

- `extension/content/content_manga.js`: `893a03442cddb9e32487d7c7599be13ba8dc349c`.
- `tests/unit/content-manga/replacement-and-completion-real.test.js`: `9dcd26cf4a963ab22c11f8535421603d83260572`.
- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `.github/workflows/audio-synthesis-selftest.yml`: `eb1bdf727d6dde90a8b8c3634fe0d724b0f09b6f`.

## 3. Cobertura funcional atual — 41 casos

1. `SHOW_ERROR_INTEGRATED executa playErrorSound real com dois nós independentes`
2. `erros consecutivos reutilizam um único AudioContext de notificação`
3. `erro com contexto suspended só agenda após resume concluir`
4. `erro registra falha de resume sem criar notas`
5. `BATCH_COMPLETE executa arpejo real por nota e reutiliza o mesmo AudioContext`
6. `clique real desbloqueia AudioContext suspended antes do lote`
7. `clique real registra falha de unlock sem impedir o início do lote`
8. `clique com contexto já running registra unlock sem chamar resume`
9. `clique com resume resolvido sem running registra unlock incompleto e inicia lote`
10. `clique com estado intermediário não chama resume e registra unlock incompleto`
11. `clique sem AudioContext registra indisponibilidade e ainda inicia o lote`
12. `falha síncrona do construtor no clique registra unlock failed e não bloqueia o lote`
13. `tradução individual por TRANSLATE_CONTEXT_IMAGE também executa unlock real`
14. `BATCH_COMPLETE stale não toca sucesso e o lote atual ainda conclui`
15. `SHOW_ERROR_INTEGRATED stale não toca erro nem contamina o lote atual`
16. `BATCH_COMPLETE duplicado do lote concluído não toca sucesso novamente`
17. `SHOW_ERROR_INTEGRATED tardio do lote concluído não toca erro nem altera UI`
18. `UPDATE_IMAGE tardio sem histórico persistido é rejeitado sem substituir a imagem`
19. `replay idêntico após conclusão recupera ACK perdido sem novo save`
20. `replay persistido do lote anterior continua confirmável depois que novo lote começa`
21. `persistência tardia de UPDATE_IMAGE do lote cancelado não conclui o lote seguinte`
22. `UPDATE_IMAGE duplicado enquanto persistência está pendente compartilha o primeiro commit`
23. `UPDATE_IMAGE conflitante enquanto persistência está pendente não recebe persisted true`
24. `UPDATE_IMAGE duplicado durante lote ativo não é confundido com retry de persistência`
25. `UPDATE_IMAGE conflitante após persistência do índice é rejeitado`
26. `falha de persistência não conclui o lote e retry bem-sucedido conclui`
27. `unlock, erro e sucesso reutilizam o mesmo AudioContext entre lotes`
28. `contexto closed é descartado e substituído no próximo BATCH_COMPLETE`
29. `BATCH_COMPLETE em estado interrupted registra skip sem tentar resume`
30. `falha do construtor no BATCH_COMPLETE registra AUDIO_SUCCESS_FAILED sem escapar`
31. `BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas`
32. `erro em estado interrupted registra skip sem tentar resume`
33. `AudioContext indisponível registra AUDIO_UNAVAILABLE sem agendar som`
34. `resume resolvido sem estado running não agenda som e registra skip`
35. `falha ao criar oscillator no sucesso é observável e não escapa do handler`
36. `contexto suspended só agenda sucesso depois de resume real completar`
37. `erro com resume resolvido sem running registra skip e não cria notas`
38. `erro sem AudioContext registra indisponibilidade e preserva a UI`
39. `falha síncrona ao agendar som de erro é observável sem escapar do handler`
40. `playErrorSound real usa webkitAudioContext quando AudioContext não existe`
41. `falha ao criar AudioContext no erro é observável e não interrompe a UI`

A matriz cobre lifecycle Web Audio, unlock pelos dois call sites reais, estados de `AudioContext`, falhas síncronas/assíncronas, mensagens stale/duplicadas/tardias, reuso de contexto e o handshake exatamente-once de `UPDATE_IMAGE`.

O bloco de persistência agora distingue: callback stale, duplicata idêntica em voo, conflito de payload em voo, duplicata já persistida, conflito após persistência, `PERSIST_FAIL` + retry, ACK perdido após conclusão e ACK perdido atravessando a fronteira A→B. A identidade durável inclui `batchId:index:dataUrl`; replay idêntico pode recuperar confirmação sem novo save, enquanto payload divergente recebe `payload_conflict`.

## 4. 191-001 — TEST_AUTHENTICITY — RESOLVED

Os mirrors foram removidos. A suíte executa `playErrorSound()`, `playSuccessSound()`, unlock e lifecycle dentro da closure real do content script.

## 5. 191-002 — STALE_TEST_CONTRACT — RESOLVED

A descrição e a prova incluem contexto reutilizável, estados relevantes, `resume()`, unlock por gesto e telemetria.

## 6. 191-003 — TEST_STRENGTH_REVIEW — RESOLVED

Cada chamada de `createOscillator()`/`createGain()` cria objeto distinto. Frequência, type, envelope, conexões, start e stop são validados por instância.

## 7. 191-004 — AUDIO_LIFECYCLE_BRANCH_GAP — RESOLVED

Foram adicionados casos reais para unlock, falha de unlock, substituição de contexto `closed`, API indisponível, resume incompleto e falha de scheduling.

## 8. 191-005 — AUDIO_CONTEXT_LEAK — RESOLVED COM RED→GREEN

A regressão provou que dois erros consecutivos criavam dois `AudioContext`. O runtime foi corrigido para compartilhar `notificationAudioContext` também no caminho de erro.

Evidência histórica:
- PR draft #72, run `36954506306`: falha esperada em Node 20/22.
- PR draft #76, run `36955506902`: regressão corrigida e verde.

## 9. 191-006 — ERROR_OBSERVABILITY — RESOLVED COM RED→GREEN

Falhas síncronas de preparação/agendamento do áudio de erro agora emitem `AUDIO_ERROR_FAILED` com `errorName`, `errorMessage` e origem, sem escapar para a UI.

Evidência histórica:
- PR draft #74, run `36955075188`: os dois regressions novos falharam como esperado.
- PR draft #76, run `36955506902`: ambos passaram.

## 10. 191-007 — AUDIO_UNLOCK_BRANCH_GAP — RESOLVED COM VALIDAÇÃO EXECUTÁVEL

Foram adicionadas regressões pelo clique real para contexto já `running`, resume incompleto, estado `interrupted`, API ausente e falha síncrona do construtor. O caso `suspended → running` também passou a exigir `START_BATCH`.

## 11. 191-008 — AUDIO_UNLOCK_SECOND_CALLSITE_GAP — RESOLVED COM VALIDAÇÃO EXECUTÁVEL

A tradução individual via `TRANSLATE_CONTEXT_IMAGE → startSingleImageTranslation()` agora possui regressão própria que exige `resume()`, `AUDIO_UNLOCKED` e `START_BATCH`. Remover esse segundo call site de `unlockNotificationAudio()` passa a quebrar a suíte focal.

## 12. 191-009 — AUDIO_STATE_BRANCH_GAP — RESOLVED COM VALIDAÇÃO EXECUTÁVEL

A passagem adversarial identificou três branches restantes:
- `playSuccessSound()` com contexto em estado `interrupted`;
- `playErrorSound()` com contexto em estado `interrupted`;
- falha síncrona do construtor no caminho `BATCH_COMPLETE → playSuccessSound()`.

A revisão atual adiciona regressões que exigem:
- `AUDIO_SUCCESS_SKIPPED` sem `resume()`/notas no success interrupted;
- `AUDIO_ERROR_SKIPPED` sem `resume()`/notas no error interrupted, preservando a UI;
- `AUDIO_SUCCESS_FAILED` com nome/mensagem/origem quando o construtor falha, sem exceção escapar do handler.

## 13. 191-010 — AUDIO_SUCCESS_RESUME_REJECTION_GAP — RESOLVED COM VALIDAÇÃO EXECUTÁVEL

A matriz ainda não protegia o branch próprio de `playSuccessSound()` em que o contexto está `suspended` e `resume()` rejeita.

A revisão atual adiciona `BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas`, que exige:

- `resume()` chamado exatamente uma vez;
- zero osciladores agendados;
- `AUDIO_SUCCESS_FAILED` com `originTabId`;
- preservação de `errorName=NotAllowedError` e da mensagem `success-resume-blocked`;
- nenhuma exceção escapando do handler público.

Isso fecha a assimetria entre rejeição de resume no unlock, erro e sucesso.

## 14. 191-011 — AUDIO_CONTEXT_CROSS_PATH_REUSE_GAP — RESOLVED COM VALIDAÇÃO EXECUTÁVEL

O contrato de produção afirma um único `notificationAudioContext` por página, mas as provas anteriores verificavam reuso apenas dentro de um mesmo tipo de fluxo.

A revisão atual adiciona `unlock, erro e sucesso reutilizam o mesmo AudioContext entre lotes`, que executa uma sequência real:

1. clique do botão principal cria e desbloqueia um contexto suspenso;
2. `SHOW_ERROR_INTEGRATED` agenda duas notas de erro nesse mesmo contexto;
3. o lote com erro é concluído;
4. um novo lote sem erro é iniciado e concluído;
5. o som de sucesso agenda três notas no mesmo contexto.

A regressão exige:

- construtor `AudioContext` chamado uma única vez;
- exatamente um `resume()` no contexto desbloqueado;
- cinco osciladores e cinco gains no primeiro contexto;
- zero nós no segundo contexto de sentinela;
- um único `AUDIO_CONTEXT_CREATED`, originado pelo `reader_button`.

Assim, separar silenciosamente contextos de unlock/erro/sucesso passa a quebrar a suíte.

## 15. 191-012 — STALE_AUDIO_MESSAGE_GUARD_GAP — RESOLVED COM VALIDAÇÃO EXECUTÁVEL

A produção já rejeita mensagens stale antes de executar os caminhos de áudio, mas não havia prova executável de que lotes antigos não interferem no lote atual.

Foram adicionadas duas regressões:

- `BATCH_COMPLETE stale não toca sucesso e o lote atual ainda conclui`:
  - captura o `batchId` real do lote atual;
  - envia conclusão com `batchId` antigo;
  - exige zero criação de `AudioContext`/zero notas;
  - exige `STALE_COMPLETE`;
  - envia a conclusão correta e exige o arpejo de sucesso.

- `SHOW_ERROR_INTEGRATED stale não toca erro nem contamina o lote atual`:
  - envia erro com `batchId` antigo e exige zero áudio/zero `BATCH_ERROR` correspondente;
  - envia erro com `batchId` atual e exige duas notas + `BATCH_ERROR`;
  - conclui o lote atual e confirma que, após o erro verdadeiro, nenhum som de sucesso é agendado.

Isso protege diretamente respostas fora de ordem e interferência A/B/C/... no gatilho de áudio.

## 16. 191-013 — POST_COMPLETION_DUPLICATE_MESSAGE_GAP — RESOLVED COM RED→GREEN

A passagem de duplicidade revelou uma assimetria no guard de mensagens:

- enquanto `_currentBatchId` existia, IDs antigos eram rejeitados;
- após a conclusão, `checkIfComplete()` zerava `_currentBatchId`;
- um `SHOW_ERROR_INTEGRATED` tardio com o batchId recém-concluído atravessava o guard, tocava duas notas de erro e reabria a UI;
- um `BATCH_COMPLETE` duplicado não repetia o som graças a `isTranslating=false`, mas também deixava de ser reconhecido/registrado como stale.

Foram adicionadas regressões para os dois casos.

### Prova pré-correção

Workflow **Audio Synthesis Selftest**, run `36958049293`, commit de teste `cc2042f833d7353f95af8afec62bbea3d73f9f4c`:

- Node 20 job `110685347718`: **2 falhas, 39 passes**;
- Node 22 job `110685347973`: **2 falhas, 39 passes**;
- as duas falhas foram exatamente:
  - `BATCH_COMPLETE duplicado do lote concluído não toca sucesso novamente`;
  - `SHOW_ERROR_INTEGRATED tardio do lote concluído não toca erro nem altera UI`.
- no erro tardio, a expectativa era manter 3 osciladores do sucesso; o runtime recebeu **5**, provando duas notas sawtooth indevidas.

### Correção

Os guards agora consideram stale qualquer mensagem que traz `batchId` quando:

- não existe mais lote ativo; ou
- o ID recebido difere do lote ativo.

O `BATCH_COMPLETE` duplicado passa a emitir `STALE_COMPLETE`; o erro tardio retorna antes de `batchHasErrors`, UI e áudio.

## 17. 191-014 — POST_COMPLETION_STALE_UPDATE_GAP — RESOLVED COM RED→GREEN

O mesmo padrão temporal existia em `UPDATE_IMAGE`: o guard antigo só rejeitava mismatch enquanto `_currentBatchId` estava preenchido. Depois da conclusão, `_currentBatchId=null`, então um resultado tardio com `batchId` do lote encerrado podia voltar a substituir/persistir a imagem.

A revisão adiciona `UPDATE_IMAGE tardio do lote concluído é rejeitado sem substituir a imagem`, que:

- inicia um lote real e captura o `batchId`;
- aplica o primeiro resultado com ACK e conclui o lote;
- envia um segundo `UPDATE_IMAGE` tardio com o mesmo `batchId`;
- exige ACK `{ ok:false, reason:'stale_batch' }`;
- exige que a imagem permaneça com o primeiro resultado;
- exige `STALE_UPDATE`;
- exige apenas um `BATCH_COMPLETE`.

O runtime agora rejeita `UPDATE_IMAGE` identificado quando `_currentBatchId` é nulo ou diferente, preservando compatibilidade para mensagens legadas sem `batchId`.

### Red proof válido

Run pré-fix `36958466821`:
- Node 20 job `110686626267`: **1 falha, 41 passes**;
- Node 22 job `110686626342`: **1 falha, 41 passes**;
- a falha foi exatamente o novo caso 191-014;
- o runtime pré-fix respondeu `{ ok:true, persisted:true, domApplied:false }` ao update tardio em vez de `{ ok:false, reason:'stale_batch' }`.

### Ajuste de harness pós-fix

O primeiro run pós-fix `36958500712` chegou ao guard correto, mas a assertion auxiliar `keepAlive===true` era inválida para ACK síncrono: `dispatchToContent` pode resolver `sendResponse()` antes de capturar o booleano retornado pelo listener. Essa assertion foi removida sem reduzir o contrato principal.

A revisão atual mantém `stale_batch`, DOM intacto, `STALE_UPDATE` e cardinalidade de completion como assertions obrigatórias. Production SHA atual: `e55d6e4785683ab21026e84196497f68a6722b5e`.

## 18. 191-015 — ASYNC_PERSISTENCE_REENTRY_GAP — RESOLVED COM RED→GREEN

Um `UPDATE_IMAGE` podia ser válido no recebimento, aplicar a imagem e iniciar `persistTranslatedPage()`, mas terminar a persistência somente depois que o lote A fosse cancelado e o lote B já estivesse ativo. O callback antigo chamava `checkIfComplete(false, request.index)` contra o estado global atual e podia completar B com o resultado de A.

A correção congela `acceptedBatchId` antes da persistência e só contabiliza o resultado se esse mesmo lote continuar ativo. Caso contrário, o ACK/persistência pode terminar, mas `checkIfComplete()` é suprimido e `STALE_UPDATE_COMPLETION_SKIPPED` é emitido.

### Red → green

- Red canônico: PR draft #77, run `36959334526`.
- Node 20 job `110689297295`: o callback tardio de A fazia B virar `batchStatus=complete` e `batchId=null`.
- Node 22 job `110689297306`: mesma falha.
- Green do mesmo PR após o guard: run `36959724918`.
- A revisão final também revalida o contrato no run `36960711294`.

## 19. 191-016 — PERSISTENCE_FAILURE_RETRY_CONTRACT — RESOLVED COM RED→GREEN

A passagem seguinte mostrou que um `persist_failed` ainda podia contabilizar o índice e concluir o lote. Corrigir apenas o `.catch()` revelou duas exigências adicionais: o retry legítimo deve ocorrer uma única vez, manter os metadados originais de restore e atualizar o DOM somente após a persistência do retry ter sucesso.

A correção final:

- não chama `checkIfComplete()` no `.catch()`;
- registra explicitamente `batchId:index` com persistência falhada;
- permite retry especial apenas para essa chave;
- preserva `cleanUrl/sourceUrl/width/height` em um snapshot associado à falha;
- remove chave/metadados após persistência bem-sucedida;
- sincroniza o `src` do DOM apenas se o mesmo lote ainda estiver ativo;
- só então contabiliza o índice.

### Red → green

- Run `36959749640`: Node 20/22 falharam porque `persist_failed` encerrava o lote prematuramente.
- Run `36959900529`: primeira correção revelou persistência duplicada no retry.
- Run `36960190797`: a prova reforçada mostrou persistência nova com DOM ainda apontando para o resultado antigo.
- Run `36960578236`: o retry por chave corrigiu duplicatas, mas revelou ausência dos metadados originais no segundo `SM_SAVE_PAGE`.
- Green final: run `36960711294`, com metadados preservados e retry consistente.

## 20. 191-017 — ACTIVE_DUPLICATE_IS_NOT_PERSISTENCE_RETRY — RESOLVED COM RED→GREEN

Uma imagem com `data-translated=true` não significa, por si só, que houve falha de persistência. Em lote com múltiplas imagens, uma duplicata do índice já traduzido pode chegar enquanto o lote ainda está ativo. O runtime intermediário confundia essa duplicata com retry, persistia/aplicava o segundo payload e respondia `domApplied:true`.

A regressão `UPDATE_IMAGE duplicado durante lote ativo não é confundido com retry de persistência` mantém duas imagens no lote, envia o índice 0 duas vezes e exige:

- a segunda mensagem não alterar o DOM da imagem 0;
- `domApplied:false` na duplicata;
- lote ainda ativo até o índice 1 concluir;
- zero áudio de sucesso prematuro.

Red canônico: run `36960491357`.

- Node 20 job `110692877679`: **1 falha, 44 passes**; recebeu `domApplied:true`.
- Node 22 job `110692877683`: **1 falha, 44 passes**; mesma falha.

A correção usa `_failedPersistenceUpdateKeys` e `_failedPersistenceUpdateMeta`: somente uma chave criada por `PERSIST_FAIL` habilita o caminho especial de retry.


## 21. 191-018 — ACTIVE_DUPLICATE_STORAGE_DIVERGENCE — RESOLVED COM RED→GREEN

A regressão anterior provava que uma duplicata ativa não mudava o DOM nem a contagem, mas ainda faltava provar idempotência de storage. O branch `translated=true` sem retry fazia `break` com `foundImage=false`; o fallback `!foundImage` persistia o segundo payload.

Consequência pré-fix: DOM permanecia em `FIRST`, porém `SM_SAVE_PAGE` recebia também `SECOND`, com metadados vazios, permitindo restore/storage divergente da UI.

A regressão existente foi fortalecida para exigir:

- exatamente **1** `SM_SAVE_PAGE` para o índice 0;
- esse único save usa `dataUrl=FIRST`;
- duplicata `SECOND` retorna `domApplied:false`;
- DOM continua `FIRST`;
- lote continua ativo até o índice 1.

**Red proof:** run `36961398214`.
- Node 20 job `110695668432`: **1 falha, 44 passes**; recebeu 2 saves para índice 0.
- Node 22 job `110695668642`: mesma falha.
- o segundo save usava `dataUrl=SECOND`, `cleanUrl/originalUrl=""` e dimensões 0.

A correção adiciona ACK idempotente para índice já contabilizado e retorna antes do fallback de persistência.

**Green intermediário:** run `36961537286`, Node 20/22 e full content-scripts verdes.

## 22. 191-019 — INFLIGHT_DUPLICATE_PERSISTENCE_RACE — RESOLVED COM RED→GREEN

Havia uma janela anterior à contabilização: durante um `SM_SAVE_PAGE` lento, o DOM já estava `translated=true`, mas o índice ainda não estava em `_countedJobIndices`. Uma reentrega do mesmo `batchId:index` podia reaplicar `SECOND` e iniciar uma segunda persistência concorrente.

O produtor `jobs-dom-ack.js` aguarda ACK por até 30 segundos, portanto reentrega/timeout durante storage lento é uma condição realista.

A regressão `UPDATE_IMAGE duplicado enquanto persistência está pendente compartilha o primeiro commit`:

- bloqueia o primeiro `SM_SAVE_PAGE`;
- envia `FIRST`;
- antes do ACK envia duplicata `SECOND`;
- exige apenas 1 save e DOM `FIRST` enquanto o commit está pendente;
- libera o primeiro save;
- exige ambos ACKs `persisted:true`, sendo a duplicata `domApplied:false`;
- exige apenas 1 save total e uma única conclusão.

**Red proof:** run `36961746945`.
- Node 20 job `110696733742`: **1 falha, 45 passes**;
- Node 22 job `110696733991`: **1 falha, 45 passes**;
- ambos mostraram 2 `SM_SAVE_PAGE`: `FIRST` e depois `SECOND`.

A correção mantém `_pendingPersistenceUpdates` por `batchId:index`. Duplicatas em voo aguardam o mesmo `Promise` da primeira persistência, não reaplicam DOM e não iniciam outro save. Em falha, ambas recebem `persist_failed` e o mecanismo de retry pós-`PERSIST_FAIL` continua independente.

**Green final:** run `36961793989`.

## 23. 191-020 — RETRY_GTC_FINAL_PAYLOAD_DIVERGENCE — RESOLVED COM RED→GREEN

O retry pós-`PERSIST_FAIL` já conseguia trocar o DOM/storage para um `newSrc` final diferente, mas o GTC era salvo apenas na primeira tentativa, antes de `SM_SAVE_PAGE`. Se a primeira persistência falhasse, o cache global podia continuar apontando para o payload rejeitado enquanto o capítulo terminava com outro payload.

A regressão 191-016 foi fortalecida com fingerprint real no DOM e payloads divergentes `FAIL_FIRST → RETRY_OK`. Ela exige:

- primeiro `GTC_SAVE` com `FAIL_FIRST`;
- segundo `GTC_SAVE` para o mesmo hash com `RETRY_OK`;
- DOM final em `RETRY_OK`;
- persistência final usando o payload do retry.

**Red proof canônico:** workflow `36963842506`.

- Node 20 job `110703156815`: **1 falha, 45 passes**; esperava 2 GTC saves e recebeu 1.
- Node 22 job `110703156879`: **1 falha, 45 passes**; mesma divergência.
- Full content-scripts também falhou pela mesma regressão focal.

A produção agora usa `persistTranslatedUpdateWithSideEffects()` tanto no caminho normal quanto no retry. O GTC continua independente do commit de página — é salvo antes de `SM_SAVE_PAGE` — mas um retry com novo payload grava uma nova entrada coerente antes da persistência final.

## 24. 191-021 — RETRY_AUTODOWNLOAD_SIDE_EFFECT_GAP — RESOLVED COM RED→GREEN

O caminho normal executava `DOWNLOAD_IMAGE` somente no `.then()` ligado diretamente ao `persistTranslatedPage()`. O branch especial de retry chamava `persistTranslatedPage()` sem esse pós-persist, portanto um retry podia concluir o lote e atualizar o capítulo sem respeitar `autoDownload=true`.

A mesma regressão exige agora que, após o retry persistir com sucesso:

- `DOWNLOAD_IMAGE` seja emitido;
- o `url` do download seja exatamente `RETRY_OK`, nunca o payload da tentativa falha;
- o efeito só aconteça depois do commit de página bem-sucedido.

A correção centraliza esse pós-persist em `persistTranslatedUpdateWithSideEffects()`, compartilhado pelos dois caminhos. Assim, GTC, persistência de página e autoDownload convergem para o payload final aceito.

## 25. 191-022 — INFLIGHT_DUPLICATE_PAYLOAD_CONFLICT — RESOLVED COM RED→GREEN

A coalescência introduzida no 191-019 usava apenas `batchId:index`. Isso era suficiente para impedir segundo save, mas ainda mentia no protocolo ACK quando a segunda mensagem carregava um `newSrc` diferente: ela aguardava o commit de `FIRST` e recebia `{ ok:true, persisted:true }`, apesar de `SECOND` nunca ter sido persistido.

O mesmo falso ACK existia depois do primeiro índice já ter sido persistido, enquanto o lote multi-imagem continuava ativo.

A matriz foi separada em contratos distintos:

- duplicata **idêntica** em voo: compartilha o mesmo Promise/commit e recebe sucesso idempotente;
- payload **conflitante** em voo: recebe `{ ok:false, reason:'payload_conflict' }`;
- duplicata idêntica após persistência: recebe sucesso idempotente sem novo `SM_SAVE_PAGE`;
- payload conflitante após persistência: recebe `payload_conflict`, mantendo DOM/storage no payload original.

### Red proof

Run `36964859147`, runtime pré-fix, fonte focal de 39 casos:

- Node 20 job `110706275387`: **2 falhas**, ambas exatamente os conflitos pending/persisted;
- Node 22 job `110706275514`: mesmas **2 falhas**;
- nos dois casos o esperado era `ok:false, reason:'payload_conflict'`, mas o runtime respondeu `ok:true, persisted:true, domApplied:false`.

### Correção

`_pendingPersistenceUpdates` agora guarda `{ promise, dataUrl }` por `batchId:index`, e `_persistedUpdatePayloads` mantém a identidade do payload efetivamente commitado durante o lote.

- mesmo `dataUrl` → coalescência/idempotência;
- `dataUrl` diferente → `DUPLICATE_UPDATE_CONFLICT` + ACK não-ok;
- nenhum segundo save, nenhuma reaplicação de DOM e nenhuma falsa confirmação de persistência.

### Green final

Run `36964902082`:

- Node 20 job `110706407979`: **2/2 suítes, 48/48 testes PASS**;
- Node 22 job `110706407986`: **2/2 suítes, 48/48 testes PASS**;
- full content-scripts job `110706407818`: **40/40 suítes, 467/467 testes PASS** com `--detectOpenHandles`.

## 26. 191-023 — POST_COMMIT_ACK_RETRY_GAP — RESOLVED COM RED→GREEN

Depois que o último índice era persistido, `checkIfComplete()` zerava `_currentBatchId`. Se o ACK se perdesse, o replay idêntico chegava depois do commit durável, mas o guard stale era executado antes da consulta à identidade já persistida.

A correção consulta a identidade persistida por `batchId:index` antes de rejeitar como stale:

- mesmo `dataUrl` → ACK idempotente `persisted:true`, sem novo DOM/save/completion;
- `dataUrl` diferente → `payload_conflict`;
- mensagem antiga sem histórico persistido → `stale_batch`.

**Red proof:** run `36965341539`.
- Node 20 job `110707760634`: falhou somente o replay pós-commit esperado.
- Node 22 job `110707760644`: mesma falha.
- Pré-fix: replay idêntico já persistido era rejeitado como stale.

## 27. 191-024 — LOST_ACK_REPLAY_ACROSS_BATCH_BOUNDARY — RESOLVED COM RED→GREEN

O primeiro fix ainda limpava o histórico persistido ao iniciar o lote seguinte. Assim, ACK perdido de A deixava de ser recuperável se B começasse antes do retry.

A correção mantém um histórico recente/bounded de identidades persistidas além da fronteira de lote. O cenário A→B exige:

- A persiste e conclui;
- B inicia e permanece ativo;
- replay idêntico de A recebe `persisted:true` sem novo save/DOM/completion;
- replay conflitante de A recebe `payload_conflict`;
- B continua ativo e isolado.

**Red proof:** run `36965638722`.
- Node 20 job `110708677430`: falhou o replay A→B.
- Node 22 job `110708677198`: mesma falha.

**Green final:** run `36965852017` no head `3a6581cfbb19b907b1e266e4d8f44208db6b6ca4`.

## 28. Evidência executável

### Revisão final atual

Workflow **Audio Synthesis Selftest**, run `36965852017`, head `3a6581cfbb19b907b1e266e4d8f44208db6b6ca4`:

- fonte #191: `92722a127b1068fd4d4ac20d5ccd12f7e9a1f971`, **41/41 casos**;
- production dependency: `893a03442cddb9e32487d7c7599be13ba8dc349c`;
- Node 20 job `110709321351`: **2/2 suítes, 50/50 testes PASS**;
- Node 22 job `110709321277`: **2/2 suítes, 50/50 testes PASS**;
- full content-scripts job `110709321176`: **40/40 suítes, 469/469 testes PASS**;
- execução focal e full com `--detectOpenHandles`;
- conclusão do workflow: **success**.

### Red proofs finais

- 191-023: run `36965341539`, Node 20 `110707760634`, Node 22 `110707760644`.
- 191-024: run `36965638722`, Node 20 `110708677430`, Node 22 `110708677198`.
- Green intermediário do fix A→B: run `36965779955`, 50/50 em Node 20/22 e 469/469 no full.

A revisão atual não contém `.skip`, `.only`, `xit`, `xdescribe`, TODO ou FIXME na suíte focal.

## 29. Reauditoria adversarial pós-correção

Matriz atualmente protegida:

- lifecycle Web Audio completo e dois call sites de unlock;
- sucesso/erro em estados relevantes e falhas de scheduling/resume;
- contexto único e recriação após `closed`;
- mensagens stale/duplicadas/tardias após conclusão;
- persistência tardia A→B sem contaminação;
- idempotência DOM + storage;
- duplicatas em voo coalescidas;
- conflito de payload nunca recebe `persisted:true`;
- `PERSIST_FAIL` não conclui o lote;
- retry preserva metadados e side effects finais;
- ACK perdido recuperável após commit/conclusão;
- ACK perdido recuperável mesmo depois que outro lote começa;
- replay conflitante continua `payload_conflict`;
- full content-scripts sem open handles detectados.

A camada corretiva fica pronta para **auditoria independente**. A identidade `AGENTE HÍBRIDO`, que realizou correções, não pode assinar o par PRIMARY/ADVERSARIAL desta revisão.

## 30. Fonte integral exata

```javascript
/**
 * audio-synthesis-full.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real da síntese de áudio de content_manga.js.
 *
 * A suíte carrega o bundle Manga pelo manifest e dispara os caminhos públicos
 * que executam playErrorSound()/playSuccessSound() dentro da closure real.
 * Não existe mirror local da síntese nem helper extraído usado como prova.
 */

const crypto = require('crypto');
const { TextEncoder } = require('util');

const { loadContentScript } = require('../../helpers/load-content-script.js');
const {
    getRuntimeMock,
    getStorageMock,
} = require('../../mocks/chrome-api.mock.js');

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando síntese de áudio real');
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
        if (keepAlive !== true && !settled) resolve({ keepAlive, response: undefined });
    });
}

function createOscillatorNode() {
    return {
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        frequency: { setValueAtTime: jest.fn() },
        type: '',
        onended: null,
    };
}

function createGainNode() {
    return {
        connect: jest.fn(),
        gain: {
            setValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
        },
    };
}

function createAudioContext({ state = 'running', currentTime = 0, onResume = null } = {}) {
    const oscillators = [];
    const gains = [];
    const ctx = {
        state,
        currentTime,
        destination: {},
        createOscillator: jest.fn(() => {
            const node = createOscillatorNode();
            oscillators.push(node);
            return node;
        }),
        createGain: jest.fn(() => {
            const node = createGainNode();
            gains.push(node);
            return node;
        }),
        resume: jest.fn(async () => {
            if (onResume) await onResume(ctx);
            else ctx.state = 'running';
        }),
    };
    return { ctx, oscillators, gains };
}

function assertNote({ osc, gain, destination, type, frequency, start, stop }) {
    expect(osc.type).toBe(type);
    expect(osc.connect).toHaveBeenCalledTimes(1);
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledTimes(1);
    expect(gain.connect).toHaveBeenCalledWith(destination);
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledTimes(1);
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(frequency, start);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, start);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, start + 0.04);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, start + 0.28);
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.start).toHaveBeenCalledWith(start);
    expect(osc.stop).toHaveBeenCalledTimes(1);
    expect(osc.stop).toHaveBeenCalledWith(stop);
}

describe('Síntese de áudio procedural — runtime real de content_manga.js', () => {
    let runtimeMock;
    let storageMock;
    let sentMessages;
    let audioContextDescriptor;
    let webkitAudioContextDescriptor;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        sentMessages = [];
        await storageMock.clear();

        audioContextDescriptor = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        webkitAudioContextDescriptor = Object.getOwnPropertyDescriptor(window, 'webkitAudioContext');

        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';

        if (audioContextDescriptor) Object.defineProperty(window, 'AudioContext', audioContextDescriptor);
        else delete window.AudioContext;
        if (webkitAudioContextDescriptor) Object.defineProperty(window, 'webkitAudioContext', webkitAudioContextDescriptor);
        else delete window.webkitAudioContext;
    });

    function installRuntimeResponder({ tabId = 17 } = {}) {
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByHash: {} }), 0);
                return;
            }
            if (message.action === 'START_BATCH') {
                if (callback) setTimeout(() => callback({ ok: true, batchId: message.batchId }), 0);
                return;
            }
            if (message.action === 'GET_TAB_ID') {
                if (callback) setTimeout(() => callback({ tabId }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    async function loadOnePage(overrides = {}) {
        return loadContentScript({
            hostname: 'localhost',
            domImages: [{
                src: 'http://localhost/page-0.png',
                width: 800,
                height: 1200,
            }],
            ...overrides,
        });
    }

    async function startBatch() {
        const previousCount = sentMessages.filter(message => message.action === 'START_BATCH').length;
        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [0],
        });
        await waitFor(() =>
            sentMessages.filter(message => message.action === 'START_BATCH').length === previousCount + 1
        );
    }

    test('SHOW_ERROR_INTEGRATED executa playErrorSound real com dois nós independentes', async () => {
        installRuntimeResponder();
        const { ctx, oscillators, gains } = createAudioContext({ currentTime: 4 });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'falha focal',
            imgIndex: 0,
            isDebug: false,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(2);
        expect(gains).toHaveLength(2);
        expect(oscillators[0]).not.toBe(oscillators[1]);
        expect(gains[0]).not.toBe(gains[1]);

        assertNote({
            osc: oscillators[0], gain: gains[0], destination: ctx.destination,
            type: 'sawtooth', frequency: 300, start: 4, stop: 4.3,
        });
        assertNote({
            osc: oscillators[1], gain: gains[1], destination: ctx.destination,
            type: 'sawtooth', frequency: 150, start: 4.2, stop: 4.5,
        });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'error',
            action_name: 'BATCH_ERROR',
        }));
    });

    test('erros consecutivos reutilizam um único AudioContext de notificação', async () => {
        installRuntimeResponder({ tabId: 74 });
        const first = createAudioContext({ currentTime: 3 });
        const second = createAudioContext({ currentTime: 9 });
        const AudioContextMock = jest.fn()
            .mockImplementationOnce(() => first.ctx)
            .mockImplementationOnce(() => second.ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();

        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro um',
            imgIndex: 0,
            isDebug: false,
        });
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro dois',
            imgIndex: 0,
            isDebug: false,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(first.oscillators).toHaveLength(4);
        expect(first.gains).toHaveLength(4);
        expect(second.oscillators).toHaveLength(0);
        expect(second.gains).toHaveLength(0);
        expect(sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_CONTEXT_CREATED'
        )).toHaveLength(1);
    });

    test('erro com contexto suspended só agenda após resume concluir', async () => {
        installRuntimeResponder({ tabId: 75 });
        let releaseResume;
        const resumeGate = new Promise(resolve => { releaseResume = resolve; });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            currentTime: 7,
            onResume: async (audioCtx) => {
                await resumeGate;
                audioCtx.state = 'running';
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro suspenso',
            imgIndex: 0,
            isDebug: false,
        });

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);

        releaseResume();
        await waitFor(() => oscillators.length === 2);
        expect(ctx.state).toBe('running');
    });

    test('erro registra falha de resume sem criar notas', async () => {
        installRuntimeResponder({ tabId: 76 });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {
                throw Object.assign(new Error('error-resume-blocked'), {
                    name: 'NotAllowedError',
                });
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro sem resume',
            imgIndex: 0,
            isDebug: false,
        });

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_ERROR_FAILED'
        ));
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_FAILED',
            extra: expect.objectContaining({
                originTabId: 76,
                errorName: 'NotAllowedError',
                errorMessage: 'error-resume-blocked',
            }),
        }));
    });

    test('BATCH_COMPLETE executa arpejo real por nota e reutiliza o mesmo AudioContext', async () => {
        installRuntimeResponder({ tabId: 73 });
        const { ctx, oscillators, gains } = createAudioContext({ currentTime: 2 });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(3);
        expect(gains).toHaveLength(3);
        expect(new Set(oscillators).size).toBe(3);
        expect(new Set(gains).size).toBe(3);

        [
            [660, 0],
            [880, 0.18],
            [1100, 0.36],
        ].forEach(([frequency, offset], index) => {
            assertNote({
                osc: oscillators[index],
                gain: gains[index],
                destination: ctx.destination,
                type: 'sine',
                frequency,
                start: 2 + offset,
                stop: 2 + offset + 0.3,
            });
        });

        expect(typeof oscillators[2].onended).toBe('function');
        oscillators[2].onended();
        expect(sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                source: 'audio',
                action_name: 'AUDIO_CONTEXT_CREATED',
                extra: expect.objectContaining({ originTabId: 73 }),
            }),
            expect.objectContaining({
                source: 'audio',
                level: 'success',
                action_name: 'AUDIO_SUCCESS_SCHEDULED',
                extra: expect.objectContaining({ notes: 3, contextState: 'running' }),
            }),
            expect.objectContaining({
                source: 'audio',
                level: 'success',
                action_name: 'AUDIO_SUCCESS_FINISHED',
                extra: expect.objectContaining({ notes: 3 }),
            }),
        ]));

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(6);
        expect(gains).toHaveLength(6);
    });

    test('clique real desbloqueia AudioContext suspended antes do lote', async () => {
        installRuntimeResponder({ tabId: 44 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async (audioCtx) => {
                audioCtx.state = 'running';
            },
        });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => ctx.resume.mock.calls.length === 1);
        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCKED'
            && message.extra?.originTabId === 44
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('running');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_UNLOCKED',
            extra: expect.objectContaining({
                originTabId: 44,
                contextState: 'running',
            }),
        }));
    });

    test('clique real registra falha de unlock sem impedir o início do lote', async () => {
        installRuntimeResponder({ tabId: 45 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async () => {
                throw Object.assign(new Error('gesture-blocked'), {
                    name: 'NotAllowedError',
                });
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_FAILED'
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_UNLOCK_FAILED',
            extra: expect.objectContaining({
                originTabId: 45,
                errorName: 'NotAllowedError',
                errorMessage: 'gesture-blocked',
            }),
        }));
    });

    test('clique com contexto já running registra unlock sem chamar resume', async () => {
        installRuntimeResponder({ tabId: 46 });
        const { ctx } = createAudioContext({ state: 'running' });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCKED'
            && message.extra?.originTabId === 46
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(ctx.resume).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_UNLOCKED',
            extra: expect.objectContaining({
                originTabId: 46,
                contextState: 'running',
            }),
        }));
    });

    test('clique com resume resolvido sem running registra unlock incompleto e inicia lote', async () => {
        installRuntimeResponder({ tabId: 47 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async () => {},
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_INCOMPLETE'
            && message.extra?.originTabId === 47
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('suspended');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_UNLOCK_INCOMPLETE',
            extra: expect.objectContaining({
                originTabId: 47,
                contextState: 'suspended',
            }),
        }));
    });

    test('clique com estado intermediário não chama resume e registra unlock incompleto', async () => {
        installRuntimeResponder({ tabId: 48 });
        const { ctx } = createAudioContext({ state: 'interrupted' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_INCOMPLETE'
            && message.extra?.originTabId === 48
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_UNLOCK_INCOMPLETE',
            extra: expect.objectContaining({
                originTabId: 48,
                contextState: 'interrupted',
            }),
        }));
    });

    test('clique sem AudioContext registra indisponibilidade e ainda inicia o lote', async () => {
        installRuntimeResponder({ tabId: 49 });
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: undefined,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNAVAILABLE'
            && message.extra?.originTabId === 49
            && message.extra?.trigger === 'reader_button'
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNAVAILABLE',
            extra: expect.objectContaining({
                originTabId: 49,
                trigger: 'reader_button',
            }),
        }));
    });

    test('falha síncrona do construtor no clique registra unlock failed e não bloqueia o lote', async () => {
        installRuntimeResponder({ tabId: 50 });
        const AudioContextMock = jest.fn(() => {
            throw new Error('unlock-constructor-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_FAILED'
            && message.extra?.originTabId === 50
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNLOCK_FAILED',
            extra: expect.objectContaining({
                originTabId: 50,
                errorName: 'Error',
                errorMessage: 'unlock-constructor-boom',
            }),
        }));
    });

    test('tradução individual por TRANSLATE_CONTEXT_IMAGE também executa unlock real', async () => {
        installRuntimeResponder({ tabId: 51 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async (audioCtx) => {
                audioCtx.state = 'running';
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage({ clickToTranslateEnabled: true });
        await delay(0);

        const result = await dispatchToContent(runtimeMock, {
            action: 'TRANSLATE_CONTEXT_IMAGE',
            srcUrl: 'http://localhost/page-0.png',
        });

        expect(result.response).toEqual({ ok: true, index: 0 });
        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCKED'
            && message.extra?.originTabId === 51
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('running');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_UNLOCKED',
            extra: expect.objectContaining({
                originTabId: 51,
                contextState: 'running',
            }),
        }));
    });

    test('BATCH_COMPLETE stale não toca sucesso e o lote atual ainda conclui', async () => {
        installRuntimeResponder({ tabId: 86 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        await dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
            batchId: 'stale-audio-batch',
        });

        expect(AudioContextMock).not.toHaveBeenCalled();
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'warn',
            action_name: 'STALE_COMPLETE',
        }));

        await dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
            batchId: liveBatch.batchId,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(3);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_SUCCESS_SCHEDULED',
        }));
    });

    test('SHOW_ERROR_INTEGRATED stale não toca erro nem contamina o lote atual', async () => {
        installRuntimeResponder({ tabId: 87 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            batchId: 'stale-error-batch',
            errorMsg: 'erro stale',
            imgIndex: 0,
            isDebug: false,
        });

        expect(AudioContextMock).not.toHaveBeenCalled();
        expect(oscillators).toHaveLength(0);
        expect(sentMessages.some(message =>
            message.action_name === 'BATCH_ERROR'
            && String(message.detail || '').includes('erro stale')
        )).toBe(false);

        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            batchId: liveBatch.batchId,
            errorMsg: 'erro atual',
            imgIndex: 0,
            isDebug: false,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(2);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'error',
            action_name: 'BATCH_ERROR',
        }));

        await dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
            batchId: liveBatch.batchId,
        });
        expect(oscillators).toHaveLength(2);
        expect(sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_SUCCESS_SCHEDULED'
        )).toHaveLength(0);
    });

    test('BATCH_COMPLETE duplicado do lote concluído não toca sucesso novamente', async () => {
        installRuntimeResponder({ tabId: 88 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        await dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
            batchId: liveBatch.batchId,
        });
        expect(oscillators).toHaveLength(3);

        await dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
            batchId: liveBatch.batchId,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(3);
        expect(sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_SUCCESS_SCHEDULED'
        )).toHaveLength(1);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'warn',
            action_name: 'STALE_COMPLETE',
        }));
    });

    test('SHOW_ERROR_INTEGRATED tardio do lote concluído não toca erro nem altera UI', async () => {
        installRuntimeResponder({ tabId: 89 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        await dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
            batchId: liveBatch.batchId,
        });
        expect(oscillators).toHaveLength(3);

        const errorLine = document.getElementById('manga-error-line');
        const displayBefore = errorLine.style.display;
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            batchId: liveBatch.batchId,
            errorMsg: 'erro tardio',
            imgIndex: 0,
            isDebug: false,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(3);
        expect(errorLine.style.display).toBe(displayBefore);
        expect(sentMessages.some(message =>
            message.action_name === 'BATCH_ERROR'
            && String(message.detail || '').includes('erro tardio')
        )).toBe(false);
    });

    test('UPDATE_IMAGE tardio sem histórico persistido é rejeitado sem substituir a imagem', async () => {
        installRuntimeResponder({ tabId: 90 });
        const { ctx } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        const firstResult = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        expect(firstResult.keepAlive).toBe(true);
        expect(firstResult.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        await waitFor(() =>
            document.querySelector('[data-testid="img-0"]')?.getAttribute('src')
            === 'data:image/png;base64,RklSU1Q='
        );

        const lateResult = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: `${liveBatch.batchId}-stale`,
            index: 0,
            newSrc: 'data:image/png;base64,U0VDT05E',
            expectAck: true,
        });

        // O stale ACK é síncrono: dispatchToContent pode resolver antes de
        // capturar o booleano retornado pelo listener. O contrato relevante é
        // a resposta stale + ausência de mutação, não o valor auxiliar keepAlive.
        expect(lateResult.response).toEqual({
            ok: false,
            reason: 'stale_batch',
        });
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'warn',
            action_name: 'STALE_UPDATE',
        }));
        expect(sentMessages.filter(message =>
            message.action === 'LOG_ENTRY'
            && message.action_name === 'BATCH_COMPLETE'
        )).toHaveLength(1);
    });

    test('replay idêntico após conclusão recupera ACK perdido sem novo save', async () => {
        installRuntimeResponder({ tabId: 97 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        const first = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        expect(first.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        await waitFor(() => oscillators.length === 3);

        const completed = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(completed.response).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'complete',
        }));

        const replay = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        expect(replay.response).toEqual({
            ok: true,
            persisted: true,
            domApplied: false,
        });

        const conflict = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,U0VDT05E',
            expectAck: true,
        });
        expect(conflict.response).toEqual({
            ok: false,
            reason: 'payload_conflict',
        });

        expect(sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        )).toHaveLength(1);
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');
        expect(oscillators).toHaveLength(3);
        expect(sentMessages.filter(message =>
            message.action === 'LOG_ENTRY'
            && message.action_name === 'BATCH_COMPLETE'
        )).toHaveLength(1);
    });

    test('replay persistido do lote anterior continua confirmável depois que novo lote começa', async () => {
        installRuntimeResponder({ tabId: 98 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                {
                    src: 'http://localhost/page-0.png',
                    width: 800,
                    height: 1200,
                },
                {
                    src: 'http://localhost/page-1.png',
                    width: 800,
                    height: 1200,
                },
            ],
        });

        const startsBeforeA = sentMessages.filter(message =>
            message.action === 'START_BATCH'
        ).length;
        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [0],
        });
        await waitFor(() =>
            sentMessages.filter(message => message.action === 'START_BATCH').length
            === startsBeforeA + 1
        );
        const batchA = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(batchA?.batchId).toBeTruthy();

        const first = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: batchA.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,QkFUQ0hfQQ==',
            expectAck: true,
        });
        expect(first.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        await waitFor(() => oscillators.length === 3);

        const startsBeforeB = sentMessages.filter(message =>
            message.action === 'START_BATCH'
        ).length;
        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [1],
        });
        await waitFor(() =>
            sentMessages.filter(message => message.action === 'START_BATCH').length
            === startsBeforeB + 1
        );
        const batchB = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(batchB?.batchId).toBeTruthy();
        expect(batchB.batchId).not.toBe(batchA.batchId);

        const replayA = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: batchA.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,QkFUQ0hfQQ==',
            expectAck: true,
        });
        expect(replayA.response).toEqual({
            ok: true,
            persisted: true,
            domApplied: false,
        });

        const conflictA = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: batchA.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,Q09ORkxJQ1Q=',
            expectAck: true,
        });
        expect(conflictA.response).toEqual({
            ok: false,
            reason: 'payload_conflict',
        });

        expect(sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        )).toHaveLength(1);

        const midStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(midStatus.response).toEqual(expect.objectContaining({
            translating: true,
            batchId: batchB.batchId,
        }));
        expect(oscillators).toHaveLength(3);

        const updateB = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: batchB.batchId,
            index: 1,
            newSrc: 'data:image/png;base64,QkFUQ0hfQg==',
            expectAck: true,
        });
        expect(updateB.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        await waitFor(() => oscillators.length === 6);

        const finalStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(finalStatus.response).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'complete',
        }));
    });

    test('persistência tardia de UPDATE_IMAGE do lote cancelado não conclui o lote seguinte', async () => {
        installRuntimeResponder({ tabId: 91 });
        const baseSendMessage = runtimeMock.sendMessage;
        let releaseFirstSave = null;
        let firstSaveHeld = false;

        runtimeMock.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'SM_SAVE_PAGE' && !firstSaveHeld) {
                firstSaveHeld = true;
                sentMessages.push(message);
                releaseFirstSave = () => {
                    if (callback) setTimeout(() => callback({ ok: true }), 0);
                };
                return;
            }
            return baseSendMessage(message, callback);
        });

        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                {
                    src: 'http://localhost/page-0.png',
                    width: 800,
                    height: 1200,
                },
                {
                    src: 'http://localhost/page-1.png',
                    width: 800,
                    height: 1200,
                },
            ],
        });

        await startBatch();
        const batchA = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(batchA?.batchId).toBeTruthy();

        const updateA = dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: batchA.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,QkFUQ0hfQQ==',
            expectAck: true,
        });
        await waitFor(() => typeof releaseFirstSave === 'function');

        const stopResult = await dispatchToContent(runtimeMock, {
            action: 'STOP_TRANSLATION_FROM_POPUP',
        });
        expect(stopResult.response).toEqual(expect.objectContaining({
            ok: true,
            batchId: batchA.batchId,
        }));

        const previousStartCount = sentMessages.filter(message =>
            message.action === 'START_BATCH'
        ).length;
        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [1],
        });
        await waitFor(() =>
            sentMessages.filter(message => message.action === 'START_BATCH').length
            === previousStartCount + 1
        );

        const batchB = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(batchB?.batchId).toBeTruthy();
        expect(batchB.batchId).not.toBe(batchA.batchId);

        const beforeRelease = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(beforeRelease.response).toEqual(expect.objectContaining({
            translating: true,
            batchId: batchB.batchId,
        }));
        expect(oscillators).toHaveLength(0);

        releaseFirstSave();
        const ackA = await updateA;
        expect(ackA.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
        }));
        await delay(20);

        const afterOldPersistence = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(afterOldPersistence.response).toEqual(expect.objectContaining({
            translating: true,
            batchId: batchB.batchId,
        }));
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'warn',
            action_name: 'STALE_UPDATE_COMPLETION_SKIPPED',
            extra: expect.objectContaining({
                index: 0,
            }),
        }));

        const updateB = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: batchB.batchId,
            index: 1,
            newSrc: 'data:image/png;base64,QkFUQ0hfQg==',
            expectAck: true,
        });
        expect(updateB.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
        }));
        await waitFor(() => oscillators.length === 3);

        const finalStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(finalStatus.response).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'complete',
        }));
    });

    test('UPDATE_IMAGE duplicado enquanto persistência está pendente compartilha o primeiro commit', async () => {
        installRuntimeResponder({ tabId: 94 });
        const baseSendMessage = runtimeMock.sendMessage;
        let releaseFirstSave = null;
        let firstSaveHeld = false;

        runtimeMock.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'SM_SAVE_PAGE' && !firstSaveHeld) {
                firstSaveHeld = true;
                sentMessages.push(message);
                releaseFirstSave = () => {
                    if (callback) setTimeout(() => callback({ ok: true }), 0);
                };
                return;
            }
            return baseSendMessage(message, callback);
        });

        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        const firstUpdate = dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        await waitFor(() => typeof releaseFirstSave === 'function');
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');

        const duplicateUpdate = dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });

        await delay(20);

        const pendingSaves = sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        );
        expect(pendingSaves).toHaveLength(1);
        expect(pendingSaves[0]).toEqual(expect.objectContaining({
            dataUrl: 'data:image/png;base64,RklSU1Q=',
        }));
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');
        expect(oscillators).toHaveLength(0);

        releaseFirstSave();
        const [firstAck, duplicateAck] = await Promise.all([
            firstUpdate,
            duplicateUpdate,
        ]);
        expect(firstAck.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        expect(duplicateAck.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: false,
        }));

        expect(sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        )).toHaveLength(1);
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');

        await waitFor(() => oscillators.length === 3);
        const finalStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(finalStatus.response).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'complete',
        }));
    });

    test('UPDATE_IMAGE conflitante enquanto persistência está pendente não recebe persisted true', async () => {
        installRuntimeResponder({ tabId: 95 });
        const baseSendMessage = runtimeMock.sendMessage;
        let releaseFirstSave = null;
        let firstSaveHeld = false;

        runtimeMock.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'SM_SAVE_PAGE' && !firstSaveHeld) {
                firstSaveHeld = true;
                sentMessages.push(message);
                releaseFirstSave = () => {
                    if (callback) setTimeout(() => callback({ ok: true }), 0);
                };
                return;
            }
            return baseSendMessage(message, callback);
        });

        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        const firstUpdate = dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        await waitFor(() => typeof releaseFirstSave === 'function');

        const conflictUpdate = dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,U0VDT05E',
            expectAck: true,
        });

        await delay(20);

        expect(sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        )).toEqual([
            expect.objectContaining({
                dataUrl: 'data:image/png;base64,RklSU1Q=',
            }),
        ]);
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');
        expect(oscillators).toHaveLength(0);

        releaseFirstSave();

        const firstAck = await firstUpdate;
        expect(firstAck.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));

        const conflictAck = await conflictUpdate;
        expect(conflictAck.response).toEqual({
            ok: false,
            reason: 'payload_conflict',
        });

        expect(sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        )).toHaveLength(1);
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');

        await waitFor(() => oscillators.length === 3);
        const finalStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(finalStatus.response).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'complete',
        }));
    });

    test('UPDATE_IMAGE duplicado durante lote ativo não é confundido com retry de persistência', async () => {
        installRuntimeResponder({ tabId: 93 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                {
                    src: 'http://localhost/page-0.png',
                    width: 800,
                    height: 1200,
                },
                {
                    src: 'http://localhost/page-1.png',
                    width: 800,
                    height: 1200,
                },
            ],
        });

        const previousStartCount = sentMessages.filter(message =>
            message.action === 'START_BATCH'
        ).length;
        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [0, 1],
        });
        await waitFor(() =>
            sentMessages.filter(message => message.action === 'START_BATCH').length
            === previousStartCount + 1
        );

        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        const first = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        expect(first.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');

        const duplicate = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        expect(duplicate.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: false,
        }));
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');

        const indexZeroSaves = sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        );
        expect(indexZeroSaves).toHaveLength(1);
        expect(indexZeroSaves[0]).toEqual(expect.objectContaining({
            dataUrl: 'data:image/png;base64,RklSU1Q=',
        }));

        const midStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(midStatus.response).toEqual(expect.objectContaining({
            translating: true,
            batchId: liveBatch.batchId,
        }));
        expect(oscillators).toHaveLength(0);

        const second = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 1,
            newSrc: 'data:image/png;base64,VEhJUkQ=',
            expectAck: true,
        });
        expect(second.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        await waitFor(() => oscillators.length === 3);

        const finalStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(finalStatus.response).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'complete',
        }));
    });

    test('UPDATE_IMAGE conflitante após persistência do índice é rejeitado', async () => {
        installRuntimeResponder({ tabId: 96 });
        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                {
                    src: 'http://localhost/page-0.png',
                    width: 800,
                    height: 1200,
                },
                {
                    src: 'http://localhost/page-1.png',
                    width: 800,
                    height: 1200,
                },
            ],
        });

        const previousStartCount = sentMessages.filter(message =>
            message.action === 'START_BATCH'
        ).length;
        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [0, 1],
        });
        await waitFor(() =>
            sentMessages.filter(message => message.action === 'START_BATCH').length
            === previousStartCount + 1
        );

        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        const first = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
            expectAck: true,
        });
        expect(first.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));

        const conflict = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,U0VDT05E',
            expectAck: true,
        });
        expect(conflict.response).toEqual({
            ok: false,
            reason: 'payload_conflict',
        });

        expect(sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
            && message.pageIndex === 0
        )).toEqual([
            expect.objectContaining({
                dataUrl: 'data:image/png;base64,RklSU1Q=',
            }),
        ]);
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,RklSU1Q=');

        const midStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(midStatus.response).toEqual(expect.objectContaining({
            translating: true,
            batchId: liveBatch.batchId,
        }));
        expect(oscillators).toHaveLength(0);

        const second = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 1,
            newSrc: 'data:image/png;base64,VEhJUkQ=',
            expectAck: true,
        });
        expect(second.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));
        await waitFor(() => oscillators.length === 3);
    });

    test('falha de persistência não conclui o lote e retry bem-sucedido conclui', async () => {
        installRuntimeResponder({ tabId: 92 });
        const baseSendMessage = runtimeMock.sendMessage;
        let saveAttempts = 0;

        runtimeMock.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'SM_SAVE_PAGE') {
                sentMessages.push(message);
                saveAttempts++;
                if (callback) {
                    setTimeout(() => callback(
                        saveAttempts === 1
                            ? { ok: false, error: 'simulated-storage-failure' }
                            : { ok: true }
                    ), 0);
                }
                return;
            }
            return baseSendMessage(message, callback);
        });

        const { ctx, oscillators } = createAudioContext({ state: 'running' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await storageMock.set({ autoDownload: true });
        await loadOnePage();

        await startBatch();
        const liveBatch = [...sentMessages].reverse().find(message =>
            message.action === 'START_BATCH'
        );
        expect(liveBatch?.batchId).toBeTruthy();

        const retryImage = document.querySelector('[data-testid="img-0"]');
        retryImage.dataset.origHash = 'hash-retry-final';

        const failed = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,RkFJTF9GSVJTVC==',
            expectAck: true,
        });
        expect(failed.response).toEqual(expect.objectContaining({
            ok: false,
            reason: 'persist_failed',
        }));
        expect(saveAttempts).toBe(1);
        expect(sentMessages.filter(message =>
            message.action === 'GTC_SAVE'
            && message.hash === 'hash-retry-final'
        )).toEqual([
            expect.objectContaining({
                translatedDataUrl: 'data:image/png;base64,RkFJTF9GSVJTVC==',
            }),
        ]);
        expect(sentMessages.filter(message =>
            message.action === 'DOWNLOAD_IMAGE'
        )).toHaveLength(0);

        const afterFailure = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(afterFailure.response).toEqual(expect.objectContaining({
            translating: true,
            batchId: liveBatch.batchId,
        }));
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'error',
            action_name: 'PERSIST_FAIL',
        }));
        expect(sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_SUCCESS_SCHEDULED'
        )).toHaveLength(0);

        const retried = await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            batchId: liveBatch.batchId,
            index: 0,
            newSrc: 'data:image/png;base64,UkVUUllfT0s=',
            expectAck: true,
        });
        expect(retried.response).toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
        }));
        expect(saveAttempts).toBe(2);
        const saveMessages = sentMessages.filter(message =>
            message.action === 'SM_SAVE_PAGE'
        );
        expect(saveMessages).toHaveLength(2);
        expect(saveMessages[1]).toEqual(expect.objectContaining({
            pageIndex: 0,
            originalUrl: 'http://localhost/page-0.png',
            cleanUrl: 'http://localhost/page-0.png',
            meta: expect.objectContaining({
                width: 800,
                height: 1200,
                sourceUrl: 'http://localhost/page-0.png',
            }),
        }));
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src'))
            .toBe('data:image/png;base64,UkVUUllfT0s=');

        const retryGtcSaves = sentMessages.filter(message =>
            message.action === 'GTC_SAVE'
            && message.hash === 'hash-retry-final'
        );
        expect(retryGtcSaves).toHaveLength(2);
        expect(retryGtcSaves[1]).toEqual(expect.objectContaining({
            translatedDataUrl: 'data:image/png;base64,UkVUUllfT0s=',
        }));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'DOWNLOAD_IMAGE'
            && message.url === 'data:image/png;base64,UkVUUllfT0s='
        ));
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'DOWNLOAD_IMAGE',
            url: 'data:image/png;base64,UkVUUllfT0s=',
        }));

        await waitFor(() => oscillators.length === 3);

        const finalStatus = await dispatchToContent(runtimeMock, {
            action: 'GET_FLOATING_BUTTON_STATUS',
        });
        expect(finalStatus.response).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'complete',
        }));
    });

    test('unlock, erro e sucesso reutilizam o mesmo AudioContext entre lotes', async () => {
        installRuntimeResponder({ tabId: 85 });
        const first = createAudioContext({
            state: 'suspended',
            currentTime: 3,
            onResume: async (audioCtx) => {
                audioCtx.state = 'running';
            },
        });
        const second = createAudioContext({ state: 'running', currentTime: 9 });
        const AudioContextMock = jest.fn()
            .mockImplementationOnce(() => first.ctx)
            .mockImplementationOnce(() => second.ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();
        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCKED'
            && message.extra?.originTabId === 85
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro cruzado',
            imgIndex: 0,
            isDebug: false,
        });
        expect(first.oscillators).toHaveLength(2);

        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(first.ctx.resume).toHaveBeenCalledTimes(1);
        expect(first.oscillators).toHaveLength(5);
        expect(first.gains).toHaveLength(5);
        expect(second.oscillators).toHaveLength(0);
        expect(second.gains).toHaveLength(0);

        const creationLogs = sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_CONTEXT_CREATED'
        );
        expect(creationLogs).toHaveLength(1);
        expect(creationLogs[0]).toEqual(expect.objectContaining({
            extra: expect.objectContaining({
                originTabId: 85,
                trigger: 'reader_button',
            }),
        }));
    });

    test('contexto closed é descartado e substituído no próximo BATCH_COMPLETE', async () => {
        installRuntimeResponder({ tabId: 55 });
        const first = createAudioContext({ currentTime: 1 });
        const second = createAudioContext({ currentTime: 5 });
        const AudioContextMock = jest.fn()
            .mockImplementationOnce(() => first.ctx)
            .mockImplementationOnce(() => second.ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
        expect(first.oscillators).toHaveLength(3);

        first.ctx.state = 'closed';

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(AudioContextMock).toHaveBeenCalledTimes(2);
        expect(second.oscillators).toHaveLength(3);
        expect(second.gains).toHaveLength(3);

        const creationLogs = sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_CONTEXT_CREATED'
        );
        expect(creationLogs).toHaveLength(2);
        expect(creationLogs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                extra: expect.objectContaining({ originTabId: 55 }),
            }),
        ]));
    });

    test('BATCH_COMPLETE em estado interrupted registra skip sem tentar resume', async () => {
        installRuntimeResponder({ tabId: 81 });
        const { ctx, oscillators } = createAudioContext({ state: 'interrupted' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(ctx.resume).not.toHaveBeenCalled();
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_SUCCESS_SKIPPED',
            extra: expect.objectContaining({
                originTabId: 81,
                contextState: 'interrupted',
            }),
        }));
    });

    test('falha do construtor no BATCH_COMPLETE registra AUDIO_SUCCESS_FAILED sem escapar', async () => {
        installRuntimeResponder({ tabId: 82 });
        const AudioContextMock = jest.fn(() => {
            throw new Error('success-constructor-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);
        await startBatch();

        await expect(dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_SUCCESS_FAILED',
            extra: expect.objectContaining({
                originTabId: 82,
                errorName: 'Error',
                errorMessage: 'success-constructor-boom',
            }),
        }));
    });

    test('BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas', async () => {
        installRuntimeResponder({ tabId: 84 });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {
                throw Object.assign(new Error('success-resume-blocked'), {
                    name: 'NotAllowedError',
                });
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_SUCCESS_FAILED'
            && message.extra?.originTabId === 84
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_SUCCESS_FAILED',
            extra: expect.objectContaining({
                originTabId: 84,
                errorName: 'NotAllowedError',
                errorMessage: 'success-resume-blocked',
            }),
        }));
    });

    test('erro em estado interrupted registra skip sem tentar resume', async () => {
        installRuntimeResponder({ tabId: 83 });
        const { ctx, oscillators } = createAudioContext({ state: 'interrupted' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro em estado interrupted',
            imgIndex: 0,
            isDebug: false,
        });

        expect(ctx.resume).not.toHaveBeenCalled();
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_SKIPPED',
            extra: expect.objectContaining({
                originTabId: 83,
                contextState: 'interrupted',
            }),
        }));
        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
    });

    test('AudioContext indisponível registra AUDIO_UNAVAILABLE sem agendar som', async () => {
        installRuntimeResponder({ tabId: 66 });
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: undefined,
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNAVAILABLE',
            extra: expect.objectContaining({
                originTabId: 66,
                trigger: 'batch_complete',
            }),
        }));
        expect(sentMessages.some(message =>
            message.action_name === 'AUDIO_SUCCESS_SCHEDULED'
        )).toBe(false);
    });

    test('resume resolvido sem estado running não agenda som e registra skip', async () => {
        installRuntimeResponder();
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {},
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
        await delay(0);

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('suspended');
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_SUCCESS_SKIPPED',
            extra: expect.objectContaining({ contextState: 'suspended' }),
        }));
    });

    test('falha ao criar oscillator no sucesso é observável e não escapa do handler', async () => {
        installRuntimeResponder();
        const { ctx } = createAudioContext({ state: 'running' });
        ctx.createOscillator = jest.fn(() => {
            throw new Error('oscillator-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();

        await expect(dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_SUCCESS_FAILED',
            extra: expect.objectContaining({
                errorName: 'Error',
                errorMessage: 'oscillator-boom',
            }),
        }));
    });

    test('contexto suspended só agenda sucesso depois de resume real completar', async () => {
        installRuntimeResponder();
        let releaseResume;
        const resumeGate = new Promise(resolve => { releaseResume = resolve; });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            currentTime: 1,
            onResume: async (audioCtx) => {
                await resumeGate;
                audioCtx.state = 'running';
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);

        releaseResume();
        await waitFor(() => oscillators.length === 3);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_SUCCESS_SCHEDULED',
            extra: expect.objectContaining({ contextState: 'running', notes: 3 }),
        }));
    });

    test('erro com resume resolvido sem running registra skip e não cria notas', async () => {
        installRuntimeResponder({ tabId: 77 });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {},
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro ainda suspenso',
            imgIndex: 0,
            isDebug: false,
        });
        await delay(0);

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_SKIPPED',
            extra: expect.objectContaining({
                originTabId: 77,
                contextState: 'suspended',
            }),
        }));
    });

    test('erro sem AudioContext registra indisponibilidade e preserva a UI', async () => {
        installRuntimeResponder({ tabId: 78 });
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: undefined,
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro sem API',
            imgIndex: 0,
            isDebug: false,
        });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNAVAILABLE',
            extra: expect.objectContaining({
                originTabId: 78,
                trigger: 'integrated_error',
            }),
        }));
        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
    });

    test('falha síncrona ao agendar som de erro é observável sem escapar do handler', async () => {
        installRuntimeResponder({ tabId: 79 });
        const { ctx } = createAudioContext({ state: 'running' });
        ctx.createOscillator = jest.fn(() => {
            throw new Error('error-oscillator-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await expect(dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro de oscillator',
            imgIndex: 0,
            isDebug: false,
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_FAILED',
            extra: expect.objectContaining({
                originTabId: 79,
                errorName: 'Error',
                errorMessage: 'error-oscillator-boom',
            }),
        }));
    });

    test('playErrorSound real usa webkitAudioContext quando AudioContext não existe', async () => {
        installRuntimeResponder();
        const { ctx, oscillators } = createAudioContext();
        const WebkitAudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: WebkitAudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'fallback webkit',
            imgIndex: 0,
        });

        expect(WebkitAudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(2);
    });

    test('falha ao criar AudioContext no erro é observável e não interrompe a UI', async () => {
        installRuntimeResponder({ tabId: 80 });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => { throw new Error('Policy violation'); }),
            configurable: true,
        });

        await loadOnePage();
        await expect(dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'sem áudio',
            imgIndex: 0,
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
        expect(document.getElementById('manga-error-collapsible-content').textContent)
            .toContain('sem áudio');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_FAILED',
            extra: expect.objectContaining({
                originTabId: 80,
                errorName: 'Error',
                errorMessage: 'Policy violation',
            }),
        }));
    });
});
```

## 31. Cobertura integral por posições

- **1–25:** cabeçalho/imports/globals.
- **26–39:** delay/wait.
- **40–60:** dispatch ao listener real.
- **61–82:** factories independentes de oscillator/gain.
- **83–107:** factory de AudioContext.
- **108–124:** assertion por nota.
- **125–209:** suíte, setup/cleanup, runtime responder e helpers de lote.
- **210–248:** caso 1 — `SHOW_ERROR_INTEGRATED executa playErrorSound real com dois nós independentes`.
- **249–286:** caso 2 — `erros consecutivos reutilizam um único AudioContext de notificação`.
- **287–319:** caso 3 — `erro com contexto suspended só agenda após resume concluir`.
- **320–358:** caso 4 — `erro registra falha de resume sem criar notas`.
- **359–423:** caso 5 — `BATCH_COMPLETE executa arpejo real por nota e reutiliza o mesmo AudioContext`.
- **424–464:** caso 6 — `clique real desbloqueia AudioContext suspended antes do lote`.
- **465–504:** caso 7 — `clique real registra falha de unlock sem impedir o início do lote`.
- **505–539:** caso 8 — `clique com contexto já running registra unlock sem chamar resume`.
- **540–576:** caso 9 — `clique com resume resolvido sem running registra unlock incompleto e inicia lote`.
- **577–609:** caso 10 — `clique com estado intermediário não chama resume e registra unlock incompleto`.
- **610–645:** caso 11 — `clique sem AudioContext registra indisponibilidade e ainda inicia o lote`.
- **646–681:** caso 12 — `falha síncrona do construtor no clique registra unlock failed e não bloqueia o lote`.
- **682–724:** caso 13 — `tradução individual por TRANSLATE_CONTEXT_IMAGE também executa unlock real`.
- **725–767:** caso 14 — `BATCH_COMPLETE stale não toca sucesso e o lote atual ainda conclui`.
- **768–825:** caso 15 — `SHOW_ERROR_INTEGRATED stale não toca erro nem contamina o lote atual`.
- **826–865:** caso 16 — `BATCH_COMPLETE duplicado do lote concluído não toca sucesso novamente`.
- **866–906:** caso 17 — `SHOW_ERROR_INTEGRATED tardio do lote concluído não toca erro nem altera UI`.
- **907–967:** caso 18 — `UPDATE_IMAGE tardio sem histórico persistido é rejeitado sem substituir a imagem`.
- **968–1043:** caso 19 — `replay idêntico após conclusão recupera ACK perdido sem novo save`.
- **1044–1177:** caso 20 — `replay persistido do lote anterior continua confirmável depois que novo lote começa`.
- **1178–1315:** caso 21 — `persistência tardia de UPDATE_IMAGE do lote cancelado não conclui o lote seguinte`.
- **1316–1413:** caso 22 — `UPDATE_IMAGE duplicado enquanto persistência está pendente compartilha o primeiro commit`.
- **1414–1508:** caso 23 — `UPDATE_IMAGE conflitante enquanto persistência está pendente não recebe persisted true`.
- **1509–1621:** caso 24 — `UPDATE_IMAGE duplicado durante lote ativo não é confundido com retry de persistência`.
- **1622–1722:** caso 25 — `UPDATE_IMAGE conflitante após persistência do índice é rejeitado`.
- **1723–1861:** caso 26 — `falha de persistência não conclui o lote e retry bem-sucedido conclui`.
- **1862–1924:** caso 27 — `unlock, erro e sucesso reutilizam o mesmo AudioContext entre lotes`.
- **1925–1963:** caso 28 — `contexto closed é descartado e substituído no próximo BATCH_COMPLETE`.
- **1964–1989:** caso 29 — `BATCH_COMPLETE em estado interrupted registra skip sem tentar resume`.
- **1990–2020:** caso 30 — `falha do construtor no BATCH_COMPLETE registra AUDIO_SUCCESS_FAILED sem escapar`.
- **2021–2059:** caso 31 — `BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas`.
- **2060–2090:** caso 32 — `erro em estado interrupted registra skip sem tentar resume`.
- **2091–2119:** caso 33 — `AudioContext indisponível registra AUDIO_UNAVAILABLE sem agendar som`.
- **2120–2146:** caso 34 — `resume resolvido sem estado running não agenda som e registra skip`.
- **2147–2175:** caso 35 — `falha ao criar oscillator no sucesso é observável e não escapa do handler`.
- **2176–2209:** caso 36 — `contexto suspended só agenda sucesso depois de resume real completar`.
- **2210–2242:** caso 37 — `erro com resume resolvido sem running registra skip e não cria notas`.
- **2243–2273:** caso 38 — `erro sem AudioContext registra indisponibilidade e preserva a UI`.
- **2274–2304:** caso 39 — `falha síncrona ao agendar som de erro é observável sem escapar do handler`.
- **2305–2328:** caso 40 — `playErrorSound real usa webkitAudioContext quando AudioContext não existe`.
- **2329–2357:** caso 41 — `falha ao criar AudioContext no erro é observável e não interrompe a UI`.
- **2358:** LF terminal.

**Cobertura documental:** **2358/2358 posições**, contíguas e sem overlap.

## 32. Pontuação pós-correção / pré-auditoria distribuída

- Correção funcional: **25/25**
- Robustez adversarial: **20/20**
- Cobertura/testes: **20/20**
- Regressões/compatibilidade: **15/15**
- Tratamento de erros: **10/10**
- Qualidade estrutural: **5/5**
- Documentação/coerência: **3/5**

**TOTAL TÉCNICO PRÉ-AUDITORIA: 98/100.**

Os 2 pontos restantes ficam reservados ao protocolo: novo par **PRIMARY + ADVERSARIAL independente** no binding atual. A identidade corretora não pode autoatribuir 100/100 nem `COMPLETED`.

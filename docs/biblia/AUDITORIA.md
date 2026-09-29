# Auditoria de qualidade — Bíblias técnicas

> Este arquivo é a fonte de verdade da **auditoria de qualidade** das Bíblias individuais.
> Uma Bíblia só pode permanecer `✅ CONCLUÍDO` no `STATUS.md` e `[x]` no `CHECKLIST.md` depois de receber `✅ APROVADO` aqui.

## O que esta auditoria prova

A aprovação significa que, para a versão/SHA auditada:

1. o SHA declarado corresponde ao blob real do arquivo-fonte;
2. a cópia integral do fonte dentro da Bíblia é byte-a-byte equivalente, admitindo apenas a representação editorial do newline final;
3. toda linha/posição do fonte possui cobertura documental rastreável;
4. nenhuma linha comentada aponta para uma linha diferente do fonte;
5. explicações são suficientemente específicas ao comportamento real do projeto;
6. referências a testes/gates apontam para arquivos reais;
7. uma assertion só é chamada de prova direta quando realmente verifica aquele comportamento;
8. execução indireta, mocks, gates estáticos e simulações são diferenciados;
9. código sem prova específica recebe aviso conservador;
10. alegações arquiteturais foram cruzadas com consumidores/dependências reais quando materialmente relevantes.

A auditoria **não é uma prova formal de correção matemática do software**. Ela prova fidelidade documental e honestidade da evidência disponível no repositório.

## Estados

- `✅ APROVADO`: passou no padrão atual.
- `🟣 REVISÃO OBRIGATÓRIA`: a Bíblia existe, mas não pode ser considerada concluída sob o padrão atual.
- `⬜ NÃO AUDITADO`: ainda não passou por auditoria.

## Regras que causam reprovação automática

Uma Bíblia é reprovada se qualquer um destes casos ocorrer:

- SHA do fonte incorreto;
- fonte integral divergente;
- linha do código ausente da auditoria;
- explicação genérica que apenas repete a linha sem explicar sua semântica/contexto;
- `✅ PROVADO` atribuído por seção a linhas que a assertion não verifica;
- ocorrência textual de um símbolo tratada como prova;
- simulação tratada como execução do arquivo real;
- lacuna de teste conhecida sem aviso explícito;
- referência numérica de linha comprovadamente errada;
- conclusão afirmando 100% quando a própria Bíblia contém lacuna estrutural não registrada.

## Auditoria 2026-09-29 — arquivos materializados

| # | Arquivo | Integridade fonte | Cobertura de linhas | Evidência/testes | Especificidade | Resultado |
|---:|---|---|---|---|---|---|
| 1 | `extension/manifest.json` | SHA correto; bloco integral exato | 76/76 posições documentadas | categorias diretas/gate/indiretas/lacunas distinguíveis; referências verificadas | específica ao Manifest e aos consumidores | ✅ APROVADO |
| 2 | `extension/background.js` | SHA `667c05eb2d7a...` reconfirmado; bloco integral exato | 1251 linhas + newline final = 1252/1252 posições | evidência classificada por comportamento/unidade; simulação SM separada de prova direta | 32 unidades específicas + papel local por posição; fallback genérico anterior removido | ✅ APROVADO |
| 3 | `extension/background/actions/calculate-visual-fingerprint.js` | SHA `ea474845cf9c...` reconfirmado; bloco integral exato | 129 linhas + newline final = 130/130 posições | prova direta, background integrado, consumidor e simulação visual separados; gaps de erro/capabilities explícitos | 14 unidades específicas + papel local por posição; fallback genérico removido | ✅ APROVADO |
| 4 | `extension/background/actions/check-extraction-tab.js` | SHA correto; bloco integral exato | corrigido para 26/26 posições | hit/miss e roteamento têm evidência real; lacunas de ordem/sender ausente continuam explícitas | específica ao mapping/ownership da aba | ✅ APROVADO |
| 5 | `extension/background/actions/claim-gemini-job.js` | SHA `f5c4643d2919...` reconfirmado; bloco integral exato | 102 linhas + newline final = 103/103 posições | prova da action, router, TabIdentity e consumidor separadas; gaps de ownership/erro explícitos | 13 unidades específicas + papel local por posição | ✅ APROVADO |
| 6 | `extension/background/actions/commit-result.js` | SHA `32270d1c4ade...` reconfirmado; bloco integral exato | 106 linhas + newline final = 107/107 posições | journal/ownership/batch/persistência/finalize mapeados a assertions; retry do consumidor separado | 10 unidades específicas + papel local por posição | ✅ APROVADO |
| 7 | `extension/background/actions/deliver-result-from-tab.js` | SHA `59543c135966...` reconfirmado; bloco integral exato | 103 linhas + newline final = 104/104 posições | sucesso/retry/mapping/ownership/helper separados; mismatches e falhas de API mantidos como gaps | 11 unidades específicas + papel local por posição; fallback genérico removido | ✅ APROVADO |
| 8 | `extension/background/actions/deliver-result-url.js` | SHA `91c50efe4764...` reconfirmado; bloco integral exato | 93 linhas + newline final = 94/94 posições | ownership/batch/URL/mapping ligados a assertions; blob/data e falhas de API mantidos como gaps | 11 unidades específicas + papel local por posição; fallback genérico removido | ✅ APROVADO |
| 9 | `extension/background/actions/deliver-result.js` | SHA `3653bd10c2a0...` conferido; bloco integral exato | 87 linhas + newline final = 88/88 posições | três mismatches, ownership, staging e falhas ligados a assertions; helper/consumer separados | 10 unidades específicas + papel local por posição; gaps explícitos | ✅ APROVADO |
| 10 | `extension/background/actions/download-chapter.js` | SHA `8636a03c8a20...` conferido; bloco integral exato | 34 linhas + newline final = 35/35 posições | action/reuso/download provados; marker e gaps diferenciados | 6 unidades específicas + papel local por posição; lacunas explícitas | ✅ APROVADO |
| 11 | `extension/background/actions/download-image.js` | SHA `408102f057ab...` conferido; bloco integral exato | 31 linhas + newline final = 32/32 posições | happy path/action + helper/integrado separados; erros mantidos como gaps | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 12 | `extension/background/actions/export-all.js` | SHA `6160a220094d...` conferido; bloco integral exato | 40 linhas + newline final = 41/41 posições | action/integrado/helper/mirror distinguidos; best-effort e erros explícitos | 7 unidades específicas + papel local por posição | ✅ APROVADO |
| 13 | `extension/background/actions/fetch-image-base64.js` | SHA `4a4825c36fdb...` conferido; bloco integral exato | 95 linhas + newline final = 96/96 posições | URL/auth/MIME/size/timeout provados; consumer/mirror/gaps separados | 11 unidades específicas + papel local por posição | ✅ APROVADO |
| 14 | `extension/background/actions/force-send-activation.js` | SHA `cbeea5768301...` conferido; bloco integral exato | 70 linhas + newline final = 71/71 posições | branches minimized/aba provados; router/content/uso atual separados; gaps assíncronos explícitos | 7 unidades específicas + papel local por posição | ✅ APROVADO |
| 15 | `extension/background/actions/get-tab-id.js` | SHA `2f3b26304ac1...` conferido; bloco integral exato | 17 linhas + newline final = 18/18 posições | action/router/compatibilidade integrada/consumidores separados | 5 unidades específicas + papel local por posição; gaps explícitos | ✅ APROVADO |
| 16 | `extension/background/actions/log-entry.js` | SHA `d57e1a25531b...` conferido; bloco integral exato | 50 linhas + newline final = 51/51 posições | happy path direto; validator/logger/emissores separados; gaps explícitos | 7 unidades específicas + papel local por posição | ✅ APROVADO |
| 17 | `extension/background/actions/open-existing-folder.js` | SHA `59ef82cbf960...` conferido; bloco integral exato | 38 linhas + newline final = 39/39 posições | anchor/path/marker separados; regex real provada; assimetria exists explícita | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 18 | `extension/background/actions/open-manga-root.js` | SHA `71c83df253cd...` conferido; bloco integral exato | 19 linhas + newline final = 20/20 posições | wiring direto provado; helper e popup separados; gaps explícitos | 5 unidades específicas + papel local por posição | ✅ APROVADO |
| 19 | `extension/background/actions/refresh-job-watchdog.js` | SHA `25f86a8dba57...` conferido; bloco integral exato | 86 linhas + newline final = 87/87 posições | ownership/jobIndex/canonicalização ligados a assertions; consumer/helpers separados; gaps explícitos | 10 unidades específicas + papel local por posição | ✅ APROVADO |
| 20 | `extension/background/actions/relay-progress.js` | SHA `24e377893c71...` conferido; bloco integral exato | 38 linhas + newline final = 39/39 posições | destino explícito/fallback e transição running provados; ACK/erros/lacunas separados | 6 unidades específicas + papel local por posição | ✅ APROVADO |

## Correções já aplicadas pela auditoria

### `relay-progress.js` — criação e auditoria em 2026-09-29

- relay explícito e fallback `activeMangaTabId` ligados aos testes integrados;
- mutação `gemini_job_<senderTabId>` → `running` ligada à suíte real;
- ACK do router separado da entrega visual fire-and-forget;
- consumers em `content_gemini.js`/`job-runner.js` confirmados;
- gaps de payload, source ampla, sender ausente e falhas de storage/tabs explicitados;
- SHA e 39/39 posições conferidos.

**Veredito:** ✅ APROVADO.

### `refresh-job-watchdog.js` — criação e auditoria em 2026-09-29

- ownership baseada em sender + jobIndex durável documentada;
- ids de manga/index/Gemini enviados pelo request registrados como não-autoritativos;
- consumidor `job-runner` e helper `jobs-watchdog` separados da prova direta da action;
- canonicalização por `TabIdentity` cruzada com a implementação real;
- gaps de validator, job ausente, dependências, aliases e telemetria explicitados;
- SHA e 87/87 posições conferidos.

**Veredito:** ✅ APROVADO.

### `open-manga-root.js` — criação e auditoria em 2026-09-29

- delegação `handleMarkerAndShow(null, resolve)` ligada aos testes diretos da action;
- sucesso e erro do helper são preservados;
- helper real de marker e caller no popup foram verificados separadamente;
- gaps para helper ausente, callback que não chega e source ampla foram explicitados;
- SHA e 20/20 posições conferidos.

**Veredito:** ✅ APROVADO.

### `open-existing-folder.js` — criação e auditoria em 2026-09-29

- branches de anchorId, busca por folderPath e marker documentados separadamente;
- escape de metacaracteres ligado aos testes reais de regex;
- helper de marker separado do wiring da action;
- assimetria entre anchorId (`exists:true`) e busca por path (primeiro resultado sem validar `exists/state`) registrada;
- gaps de payload, APIs Chrome e múltiplos resultados explicitados;
- SHA e 39/39 posições conferidos.

**Veredito:** ✅ APROVADO.

### `log-entry.js` — criação e auditoria em 2026-09-29

- encaminhamento real para o logger central ligado à suíte `actions-low-risk.test.js`;
- validação de tipos foi documentada como código sem prova focal, em vez de receber rótulo verde por herança;
- emissores reais `content_manga.js` e `content_gemini.js` confirmados;
- ACK síncrono foi separado da persistência assíncrona da fila em `background/log.js`;
- gaps de payload, source ampla e falhas de logger/storage explicitados;
- SHA e 51/51 posições conferidos.

**Veredito:** ✅ APROVADO.

### `get-tab-id.js` — criação e auditoria em 2026-09-29

- retorno deriva exclusivamente de `context.sender.tab.id`, sem confiar no payload;
- action real, router isolado e compatibilidade `legacyResponseActions` do background foram diferenciados;
- consumidores reais em `content_gemini.js` e `content_manga.js` confirmados;
- fallback legado do Gemini foi separado do fluxo moderno `CLAIM_GEMINI_JOB`;
- gaps para sender/tab ausentes e source ampla foram explicitados;
- SHA e 18/18 posições conferidos.

**Veredito:** ✅ APROVADO.

### `force-send-activation.js` — criação e auditoria em 2026-09-29

- branches `minimized_window` e ativação por aba ligados às assertions diretas;
- semântica `async:false` confrontada com o router: a resposta `ok:true` ocorre antes dos efeitos assíncronos;
- handler `DO_SEND_NOW` verificado em `content_gemini.js`;
- busca do corpus registrou ausência de caller de produção atual para `FORCE_SEND_ACTIVATION`;
- gaps de IDs, APIs Chrome, timers e erros silenciosos explicitados;
- SHA e 71/71 posições conferidos.

**Veredito:** ✅ APROVADO.

### `fetch-image-base64.js` — criação e auditoria em 2026-09-29

- URL/protocolo, sessão Gemini dupla, MIME, HTTP, tamanho e timeout ligados às assertions reais;
- registrado que 50 MiB é checado após materializar Blob e que FileReader fica fora do timeout de 30 s;
- mirror histórico separado da action real;
- gaps de FileReader/blob/router/redirect/MIME explicitados;
- SHA e 96/96 posições conferidos.

**Veredito:** ✅ APROVADO.

### `export-all.js` — criação e auditoria em 2026-09-29

- guard vazio e prefixos ligados à suíte real;
- `export-guard.test.js` reclassificado como mirror, não prova direta;
- semântica best-effort e `lastCompletedId` documentados;
- gaps para payload/item inválido, falhas, timeout, todos-falham e show;
- SHA e 41/41 posições conferidos.

**Veredito:** ✅ APROVADO.

### `download-image.js` — criação e auditoria em 2026-09-29

- prefixo relativo e filename já prefixado conferidos em testes reais;
- helper `waitForDownload` separado da prova da action;
- gaps explícitos para payload, falha imediata, interrupção/timeout pela action, search vazio/erro e exceções assíncronas;
- SHA e 32/32 posições conferidos.

**Veredito:** ✅ APROVADO.

### `download-chapter.js` — criação e auditoria em 2026-09-29

- aliases `DOWNLOAD_CHAPTER_AND_SHOW`/`OPEN_CHAPTER_FOLDER` confirmados no router;
- reuso de anchor e download normal ligados a assertions diretas;
- helper de marker classificado separadamente da action;
- gaps registrados para `images:{}` via action, anchor inexistente, payload sem validação, falhas de downloads API e eventual rejeição do helper;
- SHA e 35/35 posições conferidos.

**Veredito:** ✅ APROVADO.

### `deliver-result.js` — criação e auditoria em 2026-09-29

- primeira Bíblia criada já sob o padrão pós-reauditoria;
- batch/index/mangaTabId possuem casos diretos separados na suíte da action;
- staging foi separado de commit/finalize e cruzado com `jobs-dom-ack` e `job-runner`;
- `currentBatchId` divergente foi confirmado como não-autoritativo;
- gaps explícitos para formato/tamanho de src, rejeições de dependências, fallbacks nullish, resposta parcial do helper e logs;
- SHA e 88/88 posições conferidos.

**Veredito:** ✅ APROVADO.

### `deliver-result-url.js` — reauditoria aprovada em 2026-09-29

- ownership, identidade, normalização HTTPS, criação da aba, mapping, update e sync foram separados em unidades verificáveis;
- batch mismatch foi mantido como prova direta; index/mangaTabId ficaram explicitamente como gaps;
- `blob:` e `data:image/` deixaram de receber evidência verde por herança;
- foram registrados riscos sem teste: falha de `tabs.create`, `newTab.id`, `updateJobState`, `syncState`, data URL grande e falta de rollback;
- o consumidor real do hash `#manga-translator-extraction` foi confirmado em `content_manga.js`;
- SHA e 94/94 posições foram reconfirmados.

**Veredito:** ✅ APROVADO.

### `deliver-result-from-tab.js` — reauditoria aprovada em 2026-09-29

- sender→mapping, ownership, identidade mapping↔job, staging, retry, cleanup e finalize foram separados em unidades verificáveis;
- prova direta da action foi separada de helper DOM ACK, lifecycle e consumer retry;
- mismatches de batch/index/mangaTabId permaneceram explicitamente sem prova focal;
- foram registrados gaps para ownership negativo, Data URL incompleto/grande, resposta staged parcial, `tabs.remove`/`syncState`/`finalizeJob` falhando e fallbacks nullish;
- foi registrado que `tabs.remove` é best-effort, não awaited, e `lastError` é ignorado;
- SHA e 104/104 posições foram reconfirmados.

**Veredito:** ✅ APROVADO.

### `commit-result.js` — reauditoria aprovada em 2026-09-29

- validação, ownership, journal idempotente, batch, gate de persistência, transição e finalize foram mapeados separadamente;
- RUN-13/RUN-14 do job runner foram classificados como prova do consumidor, não da action;
- foi explicitado que o gate aceita `resultPersisted === true` **ou** `state === 'dom_applied'`;
- gaps registrados: marker inválido/expirado/fromError, falha de storage, batch omitido, fallbacks de ids e rejeições de update/finalize;
- SHA e 107/107 posições foram reconfirmados.

**Veredito:** ✅ APROVADO.

### `claim-gemini-job.js` — reauditoria aprovada em 2026-09-29

- sanitização/allowlist de campos mapeada ao teste que prova ausência de `signedUrl` e `internalOnly`;
- SOURCE_DENIED separado da autorização forte por sender.tab.id + job/index;
- jobId mismatch, aba manual e alias/replacement ligados às assertions específicas;
- tab-identity e consumer tests tratados como evidência de helper/consumidor, não automaticamente como prova da action;
- gaps explícitos para ensureInitialized, sender inválido, whitespace jobId, canonical mismatch, migration/storage failure e logs;
- SHA e 103/103 posições reconfirmados.

**Veredito:** ✅ APROVADO.


### `calculate-visual-fingerprint.js` — reauditoria aprovada em 2026-09-29

- 130/130 posições reconfirmadas contra SHA `ea474845cf9c6a6784e3ceb75298f0ac8df86e06`;
- explicação reorganizada em 14 unidades de comportamento, sem herdar “✅” para delimitadores/declarações;
- `calculate-visual-fingerprint-action.test.js` e `test_bg59.test.js` tratados como prova da implementação real;
- `background-fingerprint.visual.js` reclassificado corretamente como **simulação complementar**;
- lacunas adicionadas para parse inválido, HTTP não-2xx, decode/canvas, API parcial, imagem quadrada, timeout/tamanho e privacidade da URL;
- risco de `allowedSources:any` + fetch HTTP(S), log “visual-v3” stale e ausência de timeout/size guard registrados.

**Veredito:** ✅ APROVADO.


### `background.js` — reauditoria aprovada em 2026-09-29

- 1252 posições agora apontam para **32 unidades estruturais específicas** e possuem papel local concreto;
- evidência passou a ser classificada na unidade/comportamento realmente sustentado pelas assertions;
- o fallback textual genérico anterior e a etiqueta verde repetida por linha foram eliminados;
- `smoke-06-sm-message-routing.js` foi rebaixado corretamente para **simulação complementar**;
- gaps explícitos: bridge SM real, importScripts/order, onReplaced real, `downloadImagesAndShow`, timers longos MV3 e falhas de reconciliação;
- achados: `armFinalizationMarkerCleanup` sem consumidor local e comentário PR0 de replacement desatualizado;
- SHA/fonte/1252 posições reconfirmados.

**Veredito:** ✅ APROVADO para `667c05eb2d7adfca16a79d3e706c39a1e9398b72`.


### `check-extraction-tab.js`

Foram corrigidos dois defeitos objetivos:

- a Bíblia dizia que o argumento da IIFE estava na linha 24; o fonte real mostra a invocação na **linha 25**;
- a posição 26, correspondente ao newline final, não estava documentada; agora está.

Depois dessas correções o arquivo passou na auditoria atual.

### `manifest.json`

A integridade física foi reconfirmada:

- SHA-base confere;
- fonte integral confere;
- 76 posições são cobertas;
- permissões e APIs citadas possuem consumidores reais quando a Bíblia afirma uso;
- ausência de assertions específicas para permissões/atributos não protegidos permanece explicitamente marcada.

## Motivos detalhados das revisões obrigatórias

### `background.js` — histórico resolvido

A reprovação anterior foi resolvida pela reauditoria acima. O arquivo está **✅ APROVADO**.

### `calculate-visual-fingerprint.js` — histórico resolvido

A reprovação anterior foi resolvida pela reauditoria acima. O arquivo está **✅ APROVADO**.

### `claim-gemini-job.js` — histórico resolvido

A classificação genérica anterior foi substituída por evidência por comportamento. O arquivo está **✅ APROVADO**.

### `commit-result.js` — histórico resolvido

A evidência vaga anterior foi substituída por classificação por comportamento. O arquivo está **✅ APROVADO**.

### `deliver-result-from-tab.js` — histórico resolvido

A documentação genérica e os rótulos herdados por faixa foram substituídos por evidência por comportamento. O arquivo está **✅ APROVADO**.

### `deliver-result-url.js` — histórico resolvido

Os comentários genéricos e a evidência por faixa foram substituídos por classificação por comportamento. O arquivo está **✅ APROVADO**.

## Revisões obrigatórias concluídas

As seis Bíblias rebaixadas pela auditoria foram revisadas e aprovadas. A pausa de produção foi encerrada.

A fila normal foi retomada em:

`extension/background/actions/deliver-result.js`.

## Protocolo de reauditoria

Para aprovar uma revisão:

1. buscar novamente o fonte e conferir SHA;
2. comparar bloco integral da Bíblia com o fonte;
3. comparar cada `Linha N` com a linha N real;
4. procurar fallbacks genéricos;
5. abrir os testes citados e ler as assertions;
6. reclassificar toda evidência forte;
7. exigir alerta explícito nos caminhos não provados;
8. verificar consumidores/dependências citados;
9. somente então trocar `🟣 REVISÃO OBRIGATÓRIA` por `✅ APROVADO`;
10. atualizar `STATUS.md` e `CHECKLIST.md`.

# Bíblia técnica — `extension/background/actions/deliver-result-url.js`

> **Estado:** ✅ REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `91c50efe4764f56aac16aec2c91309e06db7d0ac`  
> **Tipo:** action assíncrona — criação/registro de aba auxiliar de extração.  
> **Linhas textuais:** **93**.  
> **Posições documentais:** **94** incluindo newline final.  
> **Teste direto principal:** `tests/unit/background/deliver-result-url-action.test.js` — `09a0f891434bccf30dbc6e0d244e8f18a40a17d9`.

## 1. Papel arquitetural

Quando o resultado do Gemini está disponível como URL em vez de Data URL já extraído, esta action abre uma aba auxiliar inativa, registra seu mapping no estado durável e coloca o job em `awaiting_auxiliary_extraction`. Ela **não finaliza** o job.

A aba auxiliar será reconhecida por `CHECK_IF_EXTRACTION_TAB`; `content_manga.js` extrai a imagem e envia `IMAGE_READY_FROM_NEW_TAB`, tratado por `deliver-result-from-tab.js`.

## 2. Autoridade e independência de currentBatchId

O request fornece jobId/batchId/mangaTabId/index, mas o job retornado por `assertJobOwnership` é a autoridade final. A action deliberadamente não compara com `state.currentBatchId`: um job ainda vivo de lote anterior pode terminar legitimamente depois que outro lote virou corrente.

Isso é provado pelo teste `currentBatchId diferente não invalida fallback de job real`.

## 3. URL auxiliar e marcador de extração

HTTP(S) recebe o fragmento `#manga-translator-extraction`. `content_manga.js` verifica exatamente esse hash e, quando presente, trata a página como candidata a extração mesmo fora dos hosts legados googleusercontent/google.com.

`blob:` e `data:image/` são aceitos pelo validator, mas não recebem hash. A Bíblia anterior tratava esses caminhos como se fossem provados; não são. A possibilidade prática de navegação/carregamento em cada ambiente Chrome também não é demonstrada pela suíte atual.

## 4. Segurança e robustez

- `javascript:` é bloqueado antes de abrir aba.
- Ownership do sender é obrigatório.
- Batch/index/mangaTabId são cruzados com o job persistido.
- URL HTTP(S) preserva path/query e substitui somente o fragmento.
- `data:image/` não possui limite de tamanho.
- `tabs.create` não verifica `runtime.lastError` nem valida `newTab.id`; falha pode resultar em exceção ao registrar o mapping.
- Se `updateJobState` ou `syncState` falhar depois da aba abrir, não há rollback/fechamento automático dessa aba nesta action.

## 5. Matriz de evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `deliver-result-url-action.test.js` | ✅ PROVADO DIRETAMENTE | Payload inválido, ownership negativo, batch forjado, URL HTTPS marcada, `active:false`, mapping, updateJobState, syncState, resposta e independência de currentBatchId. |
| `batch-lifecycle-real.test.js` — `1368df4b1fdb85d8ad1f593f78decd16a3175c98` | ✅ PROVADO DIRETAMENTE EM BACKGROUND COMPLETO | `GEMINI_RESULT_URL` cria aba; depois `CHECK_IF_EXTRACTION_TAB` recupera mangaTabId/index/geminiTabId/jobId/batchId pelo mapping real. |
| `content_manga.js` + `extraction-and-handlers-real.test.js` | 🟨 PROVA DO CONSUMIDOR | O fragmento `#manga-translator-extraction` ativa o modo de extração e o fluxo consulta o mapping. Não substitui a prova desta action. |

## 6. Lacunas de teste

### `blob:` e `data:image/`
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para os dois esquemas que o validator aceita.

### Index e mangaTabId forjados
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para os dois outros ramos de `identityMismatch`; somente batch divergente é testado.

### URL existente com fragmento/catch
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para substituição de hash existente, query preservation e o catch de `new URL()`.

### Falha de `tabs.create`
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `runtime.lastError`, callback sem aba/id, exceção ou criação que nunca chama callback.

### Falha depois da aba criada
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `updateJobState()` ou `syncState()` rejeitando. Não existe rollback local que feche a aba/mapping parcial.

### Fallbacks nullish
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para mangaTabId/index/batchId ausentes no job e herdados do request.

### Data URL grande
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** e sem limite funcional para tamanho de `data:image/`.

### Telemetria
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `AUXILIARY_EXTRACTION_REGISTERED` e seus campos.

## 7. Análise crítica

1. **Ownership + job persistido é a defesa principal**, não `allowedSources:any`.
2. **O marcador por hash é uma integração explícita com `content_manga.js`** e é provado no caminho HTTPS.
3. **A criação da aba não é transacional com state/storage.** Uma falha de update/sync depois de `tabs.create` pode deixar recurso órfão.
4. **A action não finaliza por design.** O job só será concluído depois da extração/staging do arquivo seguinte.
5. **A allowlist de URL é mais ampla que os testes.** `blob:`/`data:image/` precisam permanecer classificados como não provados.
6. **`currentBatchId` diferente não é erro**, desde que ownership e identidade do próprio job estejam corretos.

## 8. Invariantes

1. jobId inválido ou URL fora da allowlist falham antes de efeitos.
2. Sender precisa possuir o jobId.
3. Batch/index/mangaTabId divergentes do job persistido devem bloquear a criação.
4. `currentBatchId` global não deve invalidar job real por si só.
5. HTTP(S) deve receber `#manga-translator-extraction`.
6. A aba auxiliar deve abrir inativa.
7. Mapping usa `newTab.id` real.
8. Valores persistidos do job prevalecem sobre request quando presentes.
9. Mapping precisa conter mangaTabId, index, geminiTabId, jobId e batchId.
10. Job deve passar a `awaiting_auxiliary_extraction` com auxiliaryTabId.
11. `syncState` deve concluir antes da resposta positiva.
12. Esta action não deve chamar finalizeJob.
13. Logs não devem incluir a URL completa se ela puder conter dados sensíveis; o código atual não inclui URL no log.

## 9. Fonte integral

~~~javascript
'use strict';
// background/actions/deliver-result-url.js -- Abre aba temporária preservando a identidade real do job.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'deliver-result-url',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      if (typeof request.url !== 'string' || request.url.length === 0 ||
          !/^(https?:|blob:|data:image\/)/i.test(request.url)) {
        return { code: 'INVALID_PAYLOAD', message: 'url de resultado inválida' };
      }
      return null;
    },

    async execute(request, context) {
      const { mangaTabId, index, url, jobId, batchId } = request;
      await context.ensureInitialized();

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'URL de resultado descartada: aba remetente não é dona de um job ativo.', {
            jobId: String(jobId || '').slice(0, 8),
          });
        return { ok: false, reason: 'sender_mismatch' };
      }

      const job = ownership.job;
      const identityMismatch =
        (batchId && job.batchId && batchId !== job.batchId) ||
        (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) ||
        (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId);

      if (identityMismatch) {
        context.log('error', 'bg', 'AUX_URL_JOB_IDENTITY_MISMATCH',
          'Fallback por URL rejeitado: identidade não corresponde ao job persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      let auxiliaryUrl = url;
      try {
        const parsedAuxiliaryUrl = new URL(url);
        if (parsedAuxiliaryUrl.protocol === 'http:' || parsedAuxiliaryUrl.protocol === 'https:') {
          parsedAuxiliaryUrl.hash = 'manga-translator-extraction';
          auxiliaryUrl = parsedAuxiliaryUrl.toString();
        }
      } catch (_error) {
        // A validação anterior já garantiu uma URL aceita. Se URL() não puder
        // normalizá-la (ex.: blob/data), mantenha o valor original.
      }

      const newTab = await new Promise(resolve => {
        chrome.tabs.create({ url: auxiliaryUrl, active: false }, resolve);
      });

      context.state.extractionTabs[newTab.id] = {
        mangaTabId: job.mangaTabId ?? mangaTabId,
        index: job.index ?? index,
        geminiTabId: ownership.tabId,
        jobId,
        batchId: job.batchId ?? batchId,
      };
      await context.updateJobState(ownership.tabId, {
        state: 'awaiting_auxiliary_extraction',
        auxiliaryTabId: newTab.id,
      });
      await context.syncState();

      context.log('info', 'bg', 'AUXILIARY_EXTRACTION_REGISTERED',
        'Aba auxiliar registrada sem finalizar o job Gemini.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(job.batchId || batchId || '').slice(0, 8),
          extractionTabId: newTab.id,
        });

      return { extractionRegistered: true };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## 10. Rastreabilidade 94/94

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode para a action. |
| 002 | U01 | // background/actions/deliver-result-url.js -- Abre aba temporária preservando a identidade real do job. | Comentário de U01: “background/actions/deliver-result-url.js -- Abre aba temporária preservando a identidade real do job.”; registra intenção/fallback sem executar. |
| 003 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho e intenção); sem efeito runtime. |
| 004 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`, fornecendo parte do objeto/condição/chamada contígua. |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a definição no MangaTranslatorRouter. |
| 006 | U02 |     name: 'deliver-result-url', | Define o nome canônico do alias `GEMINI_RESULT_URL`. |
| 007 | U02 |     meta: { allowedSources: ['any'] }, | Permite qualquer source classificada; a autorização forte ocorre por ownership. |
| 008 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro e validação do request); sem efeito runtime. |
| 009 | U02 |     validate(request) { | Abre a validação pré-efeitos. |
| 010 | U02 |       if (typeof request.jobId !== 'string' \|\| request.jobId.trim().length === 0) { | Exige jobId string não vazia após trim. |
| 011 | U02 |         return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' }; | Retorna INVALID_PAYLOAD para jobId inválido. |
| 012 | U02 |       } | Fecha a estrutura sintática da unidade U02. |
| 013 | U02 |       if (typeof request.url !== 'string' \|\| request.url.length === 0 \|\| | Começa a guarda de URL string não vazia. |
| 014 | U02 |           !/^(https?:\|blob:\|data:image\/)/i.test(request.url)) { | Aplica allowlist de prefixos http/https/blob/data:image. |
| 015 | U02 |         return { code: 'INVALID_PAYLOAD', message: 'url de resultado inválida' }; | Retorna INVALID_PAYLOAD para URL fora da allowlist. |
| 016 | U02 |       } | Fecha a estrutura sintática da unidade U02. |
| 017 | U02 |       return null; | Indica ao router que o payload passou na validação. |
| 018 | U02 |     }, | Fecha a estrutura sintática da unidade U02. |
| 019 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro e validação do request); sem efeito runtime. |
| 020 | U03 |     async execute(request, context) { | Abre o executor assíncrono do fallback por URL. |
| 021 | U03 |       const { mangaTabId, index, url, jobId, batchId } = request; | Extrai metadados do request; eles ainda serão cruzados com o job persistido. |
| 022 | U03 |       await context.ensureInitialized(); | Reidrata/reconcilia o background antes de ownership. |
| 023 | U03 | ␠ [linha vazia] | Separador visual de U03 (Reidratação e ownership); sem efeito runtime. |
| 024 | U03 |       const ownership = await new Promise(resolve => { | Adapta `assertJobOwnership` callback-based para `await`. |
| 025 | U03 |         context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => { | Confirma ownership usando o sender real e o jobId do request. |
| 026 | U03 |           resolve({ owns, tabId, job }); | Materializa owns/tabId/job para as guardas seguintes. |
| 027 | U03 |         }); | Fecha a estrutura sintática da unidade U03. |
| 028 | U03 |       }); | Fecha a estrutura sintática da unidade U03. |
| 029 | U03 | ␠ [linha vazia] | Separador visual de U03 (Reidratação e ownership); sem efeito runtime. |
| 030 | U04 |       if (!ownership.owns \|\| !ownership.job) { | Rejeita sender sem job vivo/owned. |
| 031 | U04 |         context.log('warn', 'bg', 'SENDER_MISMATCH', | Registra rejeição de ownership. |
| 032 | U04 |           'URL de resultado descartada: aba remetente não é dona de um job ativo.', { | Descreve a razão de segurança da rejeição. |
| 033 | U04 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo de oito caracteres do jobId. |
| 034 | U04 |           }); | Fecha a estrutura sintática da unidade U04. |
| 035 | U04 |         return { ok: false, reason: 'sender_mismatch' }; | Retorna falha sem abrir aba auxiliar. |
| 036 | U04 |       } | Fecha a estrutura sintática da unidade U04. |
| 037 | U04 | ␠ [linha vazia] | Separador visual de U04 (Rejeição de sender não proprietário); sem efeito runtime. |
| 038 | U05 |       const job = ownership.job; | Adota o job persistido como autoridade. |
| 039 | U05 |       const identityMismatch = | Inicia as comparações request↔job. |
| 040 | U05 |         (batchId && job.batchId && batchId !== job.batchId) \|\| | Compara batchId quando ambos possuem valor. |
| 041 | U05 |         (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) \|\| | Compara index apenas quando ambos são inteiros. |
| 042 | U05 |         (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId); | Compara mangaTabId quando ambos são truthy. |
| 043 | U05 | ␠ [linha vazia] | Separador visual de U05 (Validação de identidade request ↔ job persistido); sem efeito runtime. |
| 044 | U05 |       if (identityMismatch) { | Entra na rejeição quando qualquer dimensão diverge. |
| 045 | U05 |         context.log('error', 'bg', 'AUX_URL_JOB_IDENTITY_MISMATCH', | Registra mismatch entre payload e job persistido. |
| 046 | U05 |           'Fallback por URL rejeitado: identidade não corresponde ao job persistido.', { | Descreve o erro antes da criação da aba. |
| 047 | U05 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo de oito caracteres do jobId. |
| 048 | U05 |             expectedBatchId: String(job.batchId \|\| '').slice(0, 8), | Loga prefixo do batch persistido. |
| 049 | U05 |             receivedBatchId: String(batchId \|\| '').slice(0, 8), | Loga prefixo do batch recebido. |
| 050 | U05 |           }); | Fecha a estrutura sintática da unidade U05. |
| 051 | U05 |         return { ok: false, reason: 'job_identity_mismatch' }; | Retorna falha sem `tabs.create`. |
| 052 | U05 |       } | Fecha a estrutura sintática da unidade U05. |
| 053 | U05 | ␠ [linha vazia] | Separador visual de U05 (Validação de identidade request ↔ job persistido); sem efeito runtime. |
| 054 | U06 |       let auxiliaryUrl = url; | Inicializa a URL de navegação com o valor validado original. |
| 055 | U06 |       try { | Protege a normalização via `URL()`; a validação anterior já restringiu o esquema. |
| 056 | U06 |         const parsedAuxiliaryUrl = new URL(url); | Parseia a URL para inspecionar protocolo e manipular apenas o fragmento. |
| 057 | U06 |         if (parsedAuxiliaryUrl.protocol === 'http:' \|\| parsedAuxiliaryUrl.protocol === 'https:') { | Limita a marcação por hash aos protocolos HTTP(S). |
| 058 | U06 |           parsedAuxiliaryUrl.hash = 'manga-translator-extraction'; | Substitui o fragmento por `manga-translator-extraction`, gatilho do content script. |
| 059 | U06 |           auxiliaryUrl = parsedAuxiliaryUrl.toString(); | Serializa a URL HTTP(S) marcada para `tabs.create`. |
| 060 | U06 |         } | Fecha a estrutura sintática da unidade U06. |
| 061 | U06 |       } catch (_error) { | Em falha de parse, conserva a string já aceita pelo validator. |
| 062 | U06 |         // A validação anterior já garantiu uma URL aceita. Se URL() não puder | Comentário de U06: “A validação anterior já garantiu uma URL aceita. Se URL() não puder”; registra intenção/fallback sem executar. |
| 063 | U06 |         // normalizá-la (ex.: blob/data), mantenha o valor original. | Comentário de U06: “normalizá-la (ex.: blob/data), mantenha o valor original.”; registra intenção/fallback sem executar. |
| 064 | U06 |       } | Fecha a estrutura sintática da unidade U06. |
| 065 | U06 | ␠ [linha vazia] | Separador visual de U06 (Normalização e marcação da URL auxiliar); sem efeito runtime. |
| 066 | U07 |       const newTab = await new Promise(resolve => { | Aguarda o callback de criação para obter o objeto real da aba. |
| 067 | U07 |         chrome.tabs.create({ url: auxiliaryUrl, active: false }, resolve); | Cria a aba auxiliar inativa com a URL normalizada/marcada. |
| 068 | U07 |       }); | Fecha a estrutura sintática da unidade U07. |
| 069 | U07 | ␠ [linha vazia] | Separador visual de U07 (Criação da aba auxiliar); sem efeito runtime. |
| 070 | U08 |       context.state.extractionTabs[newTab.id] = { | Cria o mapping pelo tabId real retornado pelo Chrome. |
| 071 | U08 |         mangaTabId: job.mangaTabId ?? mangaTabId, | Prefere mangaTabId do job persistido; request é fallback nullish. |
| 072 | U08 |         index: job.index ?? index, | Prefere index do job persistido; request é fallback nullish. |
| 073 | U08 |         geminiTabId: ownership.tabId, | Registra a aba Gemini confirmada pelo ownership. |
| 074 | U08 |         jobId, | Registra o jobId já validado/owned. |
| 075 | U08 |         batchId: job.batchId ?? batchId, | Prefere batchId persistido; request é fallback nullish. |
| 076 | U08 |       }; | Fecha a estrutura sintática da unidade U08. |
| 077 | U08 |       await context.updateJobState(ownership.tabId, { | Persiste no job a transição para espera de extração auxiliar. |
| 078 | U08 |         state: 'awaiting_auxiliary_extraction', | Marca explicitamente a fase do lifecycle. |
| 079 | U08 |         auxiliaryTabId: newTab.id, | Liga o job ao tabId auxiliar recém-criado. |
| 080 | U08 |       }); | Fecha a estrutura sintática da unidade U08. |
| 081 | U08 |       await context.syncState(); | Sincroniza o mapping/estado antes de responder sucesso. |
| 082 | U08 | ␠ [linha vazia] | Separador visual de U08 (Registro durável da extração e estado do job); sem efeito runtime. |
| 083 | U09 |       context.log('info', 'bg', 'AUXILIARY_EXTRACTION_REGISTERED', | Registra sucesso do cadastro da aba auxiliar. |
| 084 | U09 |         'Aba auxiliar registrada sem finalizar o job Gemini.', { | Deixa explícito no log que o job Gemini ainda não foi finalizado. |
| 085 | U09 |           jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo de oito caracteres do jobId. |
| 086 | U09 |           batchId: String(job.batchId \|\| batchId \|\| '').slice(0, 8), | Loga prefixo do batch persistido/fallback. |
| 087 | U09 |           extractionTabId: newTab.id, | Inclui tabId auxiliar no log para correlação. |
| 088 | U09 |         }); | Fecha a estrutura sintática da unidade U09. |
| 089 | U09 | ␠ [linha vazia] | Separador visual de U09 (Telemetria e resposta); sem efeito runtime. |
| 090 | U09 |       return { extractionRegistered: true }; | Responde sucesso somente depois de update+sync. |
| 091 | U10 |     }, | Fecha a estrutura sintática da unidade U10. |
| 092 | U10 |   }); | Fecha a estrutura sintática da unidade U10. |
| 093 | U10 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE usando self no worker e globalThis no harness. |
| 094 | U11 | ⏎ [newline final] | Preserva o newline terminal do blob; posição editorial sem efeito runtime. |

## 11. Análise por unidade

### U01 — linhas/posição 1–3: Cabeçalho e intenção

**O que faz:** Ativa strict mode e declara que a action abre uma aba auxiliar preservando a identidade real do job.

**Como faz:** Diretiva e comentário antecedem a IIFE.

**Por que desta forma:** O fallback por URL é um passo intermediário; não deve finalizar nem trocar identidade do job.

**Por que uma implementação ingênua seria pior:** Abrir URL sem vínculo com o job permitiria perder ownership entre aba Gemini, auxiliar e leitor.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento da action real.

### U02 — linhas/posição 4–19: Registro e validação do request

**O que faz:** Registra `deliver-result-url`, exige jobId e aceita somente strings iniciadas por http:, https:, blob: ou data:image/.

**Como faz:** `validate()` roda antes de reidratação/efeitos; usa trim apenas no jobId e uma allowlist por regex para URL.

**Por que desta forma:** Bloqueia esquemas como javascript: antes de abrir tab, sem impedir os formatos usados pelos resultados temporários.

**Por que uma implementação ingênua seria pior:** Aceitar esquema arbitrário permitiria navegação inesperada; fazer validação depois de `tabs.create` seria tarde demais.

**Evidência:** ✅ PROVADO DIRETAMENTE — jobId ausente e `javascript:` são rejeitados antes de `ensureInitialized`/`tabs.create`. ⚠️ `blob:` e `data:image/` aceitos não têm testes focais; também não há limite de tamanho para data URL.

### U03 — linhas/posição 20–29: Reidratação e ownership

**O que faz:** Extrai os campos do request, reidrata estado e confirma que o sender possui o jobId solicitado.

**Como faz:** `ensureInitialized()` é awaited; `assertJobOwnership(context.sender,jobId,...)` é adaptado para Promise.

**Por que desta forma:** A sender real precisa estar vinculada ao job antes de poder abrir uma aba auxiliar.

**Por que uma implementação ingênua seria pior:** Confiar apenas em jobId/batch do payload permitiria outra aba solicitar fallback para job alheio.

**Evidência:** ✅ PROVADO DIRETAMENTE — caminhos positivo e negativo de ownership são exercitados. ⚠️ Rejeição de `ensureInitialized`/helper não possui teste focal.

### U04 — linhas/posição 30–37: Rejeição de sender não proprietário

**O que faz:** Recusa a URL quando ownership não é válido ou não há job vivo.

**Como faz:** Loga `SENDER_MISMATCH` com prefixo de jobId e retorna `sender_mismatch` antes de `tabs.create`.

**Por que desta forma:** Impede que aba sem job ativo crie recursos auxiliares.

**Por que uma implementação ingênua seria pior:** Criar a aba antes dessa guarda deixa recurso órfão e amplia superfície de navegação.

**Evidência:** ✅ PROVADO DIRETAMENTE — `rejeita job de uma aba que não o possui` verifica zero `tabs.create` e `sender_mismatch`.

### U05 — linhas/posição 38–53: Validação de identidade request ↔ job persistido

**O que faz:** Compara batchId, index e mangaTabId recebidos com o job owned; qualquer divergência aplicável rejeita o fallback.

**Como faz:** Compõe `identityMismatch` com três guardas; no erro loga batch esperado/recebido e retorna `job_identity_mismatch`.

**Por que desta forma:** Mesmo sender legítimo não deve redirecionar o resultado para outro lote/índice/leitor.

**Por que uma implementação ingênua seria pior:** Ownership por jobId sem conferir metadados permitiria payload stale/forjado dentro da mesma aba.

**Evidência:** ✅ PROVADO DIRETAMENTE para **batchId divergente**. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para index divergente e mangaTabId divergente, nem para campos ausentes/falsy que desativam as comparações.

### U06 — linhas/posição 54–65: Normalização e marcação da URL auxiliar

**O que faz:** Para HTTP(S), substitui o fragmento por `#manga-translator-extraction`; para outros formatos aceitos mantém a URL original.

**Como faz:** Tenta `new URL(url)`; somente protocol http/https recebe `hash` e `toString`; catch é fail-open para o valor já aceito pelo validator.

**Por que desta forma:** `content_manga.js` reconhece exatamente esse hash e entra no modo de extração, inclusive em hosts fora da allowlist legada googleusercontent/google.com.

**Por que uma implementação ingênua seria pior:** Sem marcador, página HTTP(S) genérica não acionaria o fluxo de `CHECK_IF_EXTRACTION_TAB`; alterar query/path seria invasivo para o recurso.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste de sucesso exige URL HTTPS com `#manga-translator-extraction`. ✅ Consumidor verifica `window.location.hash === '#manga-translator-extraction'`. ⚠️ `blob:`/`data:image` sem marca, URL já com hash e o catch de `new URL` não têm testes focais.

### U07 — linhas/posição 66–69: Criação da aba auxiliar

**O que faz:** Abre a URL auxiliar em aba inativa e espera o callback para obter o novo tabId.

**Como faz:** Envolve `chrome.tabs.create({url:auxiliaryUrl,active:false}, resolve)` em Promise.

**Por que desta forma:** O mapping persistente precisa do id real criado pelo Chrome antes de ser registrado.

**Por que uma implementação ingênua seria pior:** Inventar/antecipar tabId quebraria lookup do content script; abrir ativa roubaria foco do usuário.

**Evidência:** ✅ PROVADO DIRETAMENTE — sucesso verifica options exatas e usa id 81/82. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `runtime.lastError`, callback sem tab/id ou exceção de `tabs.create`; a action não possui guarda/cleanup para esses casos.

### U08 — linhas/posição 70–82: Registro durável da extração e estado do job

**O que faz:** Registra `extractionTabs[newTab.id]` usando metadados persistidos do job como prioridade, muda o job para `awaiting_auxiliary_extraction` e sincroniza estado.

**Como faz:** Mapping inclui mangaTabId/index/geminiTabId/jobId/batchId; `updateJobState` e `syncState` são awaited em sequência.

**Por que desta forma:** A aba auxiliar precisa conseguir provar seu mapping após carregamento/restart, e o job precisa registrar que aguarda essa etapa.

**Por que uma implementação ingênua seria pior:** Guardar apenas em memória perde mapping sob suspensão MV3; usar request antes do job persistido reintroduz spoof/staleness.

**Evidência:** ✅ PROVADO DIRETAMENTE — mapping, updateJobState e um sync são assertados. ✅ `batch-lifecycle-real.test.js` atravessa o background real e depois `CHECK_IF_EXTRACTION_TAB` recupera exatamente o mapping. ⚠️ Fallbacks nullish e falhas de update/sync não têm testes focais.

### U09 — linhas/posição 83–90: Telemetria e resposta

**O que faz:** Loga o registro da aba auxiliar sem finalizar o job e retorna `extractionRegistered:true`.

**Como faz:** Metadata contém prefixos de job/batch e extractionTabId; só responde depois de `syncState` awaited.

**Por que desta forma:** A resposta positiva deve significar que o mapping já foi sincronizado, não apenas que a aba abriu.

**Por que uma implementação ingênua seria pior:** Responder antes do sync pode levar a aba auxiliar a consultar um mapping ainda não durável.

**Evidência:** ✅ PROVADO DIRETAMENTE para a resposta e efeitos anteriores. 🟨 O log é executado, mas ⚠️ não há assertion focal do evento/metadata.

### U10 — linhas/posição 91–93: Fechamento do registro/IIFE

**O que faz:** Fecha executor, action e IIFE com `self` no worker e `globalThis` no harness.

**Como faz:** Delimitadores encerram as construções abertas.

**Por que desta forma:** Mantém o padrão clássico de scripts globais usado pelo service worker/testes.

**Por que uma implementação ingênua seria pior:** Conversão parcial para módulos quebraria o bootstrap atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento da action real.

### U11 — linhas/posição 94–94: Newline final

**O que faz:** Documenta o newline terminal do blob.

**Como faz:** Posição editorial separada das 93 linhas textuais.

**Por que desta forma:** Mantém equivalência física no padrão de auditoria.

**Por que uma implementação ingênua seria pior:** Ignorar a posição produz falso 100% documental.

**Evidência:** 🟦 GATE DOCUMENTAL.

## 12. Revisão final

- [x] SHA/fonte integral;
- [x] 93 linhas + newline = 94/94;
- [x] 11 unidades específicas sem gaps;
- [x] fallback textual genérico removido;
- [x] prova de ownership/batch/URL/registro ligada às assertions reais;
- [x] `blob:`/`data:image` e erros de APIs mantidos como gaps;
- [x] consumidor do hash verificado;
- [x] nenhum código funcional alterado.

**Veredito documental:** aprovada para `91c50efe4764f56aac16aec2c91309e06db7d0ac`.

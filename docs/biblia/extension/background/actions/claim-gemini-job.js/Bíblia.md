# Bíblia técnica — `extension/background/actions/claim-gemini-job.js`

> **Estado:** ✅ REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `f5c4643d291931f133a791a2deaa6eb94ef4500d`  
> **Tipo:** action de runtime — autorização/claim de job Gemini.  
> **Linhas textuais:** **102**.  
> **Posições documentais:** **103** com newline final.  
> **Teste direto principal:** `tests/unit/background/claim-gemini-job-action.test.js` — `0cb6cb2f100d7493abfdf4038546e8be747289f1`.

## 1. Papel arquitetural

Esta action é a ponte de bootstrap entre a aba Gemini e o job persistido no background. Ela **não procura um job qualquer**: o claim precisa estar ancorado no sender real, no tabId canônico e, quando fornecido, no jobId esperado que veio da URL gerenciada.

Há dois caminhos válidos:

1. **direto** — existe `gemini_job_<canonicalSenderTabId>`;
2. **alias/replacement** — a chave direta falta, mas o jobId está no índice e o serviço de identidade prova que o tab antigo e o sender atual representam a mesma aba lógica; então a identidade é migrada e relida.

A resposta é deliberadamente sanitizada por `safeJob`.

## 2. Trust boundary e segurança

### Origem
O router só permite source `gemini`. No router atual, essa classificação vem do URL do sender (Gemini e também o caminho local de desenvolvimento previsto pelo router).

### Ownership forte
A origem sozinha não autoriza o job. O claim combina:
- sender.tab.id fornecido pelo runtime;
- canonicalização por TabIdentity;
- chave durável ou índice;
- jobId esperado quando existe.

### Minimização de dados
`safeJob` é uma allowlist. O teste injeta `signedUrl` e `internalOnly` no storage e prova que ambos não aparecem na resposta.

### Sem full scan
Quando a chave direta falta, o fallback exige jobId e `state.jobIndex`; a action não faz `storage.get(null)`.

## 3. Lifecycle MV3 e tab replacement

`ensureInitialized` é chamado no contexto real para reidratar/reconciliar estado. Replacement de aba é resolvido por `resolveCanonicalTabId`. Se o índice ainda aponta para o tab antigo, `migrateTabIdentity` move a identidade durável e a action faz **read-after-write** da chave canônica antes de responder.

### Wiring runtime que materializa esse contrato

- `extension/background.js` carrega `background/actions/claim-gemini-job.js` no bootstrap e encaminha mensagens registradas pelo router.
- No caminho real de `routeRegisteredAction`, o `contextFactory` injeta `state`, `log`, `ensureInitialized` e `tabIdentity` proveniente de `initializeTabIdentity()`; por isso essas dependências não nascem dentro da action.
- `extension/background/jobs-lifecycle.js` cria/persiste o job Gemini, compõe a URL gerenciada com `jobId`, grava `gemini_job_<canonicalTabId>` e mantém o índice usado pelo fallback de claim.
- `extension/content/content_gemini.js` lê o `jobId` da URL, faz trim do valor gerenciado e envia `CLAIM_GEMINI_JOB`; depois abre keep-alive somente após claim válido.

Essas relações são **wiring de produção** e devem ser separadas da prova focal dos testes: `claim-gemini-job-action.test.js` prova a action em harness controlado; `claim-bootstrap-keepalive.test.js` prova o consumer com responder mockado.

Isso evita devolver um job “virtualmente migrado” enquanto storage/índice ainda estão inconsistentes.

## 4. Consumidor

`extension/content/content_gemini.js`:
- lê jobId da URL;
- envia `CLAIM_GEMINI_JOB`;
- faz retry limitado quando há jobId gerenciado;
- se recebe `{ok:true, job:null}` em aba manual, fica inerte;
- abre keep-alive somente depois de claim válido.

`tests/unit/content-gemini/claim-bootstrap-keepalive.test.js` prova esse comportamento do consumidor, mas não a implementação desta action.

## 5. Matriz de evidência

| Fonte | Classificação | O que prova |
|---|---|---|
| `claim-gemini-job-action.test.js` | ✅ PROVADO DIRETAMENTE | Action real + router/state/tab-identity: sanitização/allowlist, jobId mismatch, aba manual, SOURCE_DENIED e alias/replacement com migração de storage/índice. |
| `router.test.js` — `d7c33bc525e1683acabff44389c5d51471cc7037` | ✅ PROVADO DIRETAMENTE DO ROUTER | identifySource e bloqueio de origem antes de execute; complementa a prova SOURCE_DENIED específica da action. |
| `tab-identity.test.js` — `1f2dd52513037f061613d04453a961fbaeddef84` | ✅ PROVADO DIRETAMENTE DO HELPER | chains, journal, recovery, alias expirado e migração; não substitui teste da action. |
| `claim-bootstrap-keepalive.test.js` — `6e6adc2747b0974feec368fedb3652da79dc49b5` | 🟨 PROVA DO CONSUMIDOR | claim null mantém aba manual inerte; claim válido abre keep-alive; retry limitado por jobId. Runtime responder é mockado, então não prova esta action. |

## 6. Lacunas de teste

### ensureInitialized
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** de que a action chama/aguarda `ensureInitialized` no contexto real nem de sua rejeição.

### sender inválido
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para sender sem tab, tab.id null/string/NaN.

### jobId vazio/whitespace
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO**. A action trata string whitespace como expectedJobId truthy; o consumidor normal trimma o valor da URL, mas callers alternativos poderiam enviar espaços.

### fallback sem TabIdentity
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `context.tabIdentity` ausente.

### índice sem match
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para expectedJobId presente + jobIndex válido, porém sem entry correspondente.

### ownership canônico divergente
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** do ramo em que o índice encontra o jobId, mas a identidade canônica do entry pertence a outra aba.

### falha/resultado incompleto da migração
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `migrateTabIdentity` rejeitando, chave pós-migração ausente ou jobId diferente após a migração.

### storage failure
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `context.storage.get` rejeitando. O router converteria rejeição da action em INTERNAL_ERROR, mas essa propriedade específica não é focalmente testada.

### logs
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para TAB_CLAIM_DIRECT/TAB_CLAIM_ALIAS e truncamento de jobId.

## 7. Análise crítica

1. **Minimização está correta e comprovada:** allowlist de campos evita vazamento futuro acidental.
2. **jobId whitespace:** a action não aplica trim, embora o consumidor normal aplique. Endurecer isso exigiria mudança funcional separada.
3. **allowedSources protege pouco sozinho:** URL do sender classifica origem; o ownership tab-scoped é a defesa principal.
4. **Read-after-write pós-migração é robusto:** não confia apenas na Promise de migrate.
5. **Falhas de storage/identity propagam:** não há catch local; o router responde INTERNAL_ERROR. Isso evita falso claim, mas observabilidade específica é limitada.
6. **Aba manual sem job fica inerte:** não existe full scan para “achar algo para fazer”.

## 8. Invariantes

1. Source não-Gemini deve ser bloqueada antes de execute.
2. sender.tab.id deve continuar vindo do runtime, nunca do payload.
3. Claim direto só pode ler a chave do sender canônico.
4. expectedJobId divergente deve falhar mesmo na aba correta.
5. Miss direto sem jobId não pode virar full scan.
6. Fallback por índice deve exigir jobId explícito.
7. jobId encontrado no índice não basta; identidade canônica também deve coincidir.
8. Replacement legítimo deve poder migrar oldTabId → newTabId.
9. Após migração, storage canônico deve ser relido/revalidado.
10. Resposta deve passar por safeJob/allowlist.
11. Campos internos futuros não podem vazar automaticamente.
12. Aba manual sem job deve continuar recebendo job:null.
13. Logs não devem carregar prompt/signedUrl/internal payload.
14. Alterar a política de origem do router exige reavaliar esta fronteira.

## 9. Fonte integral

~~~javascript
'use strict';
// background/actions/claim-gemini-job.js — Claim seguro de job pela aba Gemini.

(function(scope) {
  function safeJob(job, canonicalTabId) {
    if (!job) return null;
    return {
      jobId: job.jobId,
      batchId: job.batchId,
      mangaTabId: job.mangaTabId,
      index: job.index,
      prompt: job.prompt,
      executionMode: job.executionMode,
      geminiTabId: canonicalTabId,
      windowId: job.windowId,
    };
  }

  scope.MangaTranslatorRouter.registerAction({
    name: 'claim-gemini-job',
    meta: {
      allowedSources: ['gemini'],
    },

    async execute(request, context) {
      if (context && typeof context.ensureInitialized === 'function') {
        await context.ensureInitialized();
      }

      const senderTabId = context && context.sender && context.sender.tab
        ? context.sender.tab.id
        : null;
      if (!Number.isInteger(senderTabId)) return { job: null };

      const expectedJobId = typeof request.jobId === 'string' && request.jobId
        ? request.jobId
        : null;
      const tabIdentity = context.tabIdentity;
      const canonicalSenderTabId = tabIdentity
        ? await tabIdentity.resolveCanonicalTabId(senderTabId)
        : senderTabId;

      const directKey = `gemini_job_${canonicalSenderTabId}`;
      const directData = await context.storage.get([directKey]);
      const directJob = directData && directData[directKey];
      if (directJob) {
        if (expectedJobId && directJob.jobId !== expectedJobId) {
          context.log('warn', 'bg', 'TAB_CLAIM_REJECTED', 'Claim rejeitado por jobId divergente', {
            tabId: canonicalSenderTabId,
          });
          return { job: null };
        }
        context.log('info', 'bg', 'TAB_CLAIM_DIRECT', 'Job reivindicado por chave direta', {
          tabId: canonicalSenderTabId,
          jobIdPrefix: String(directJob.jobId || '').slice(0, 8),
        });
        return { job: safeJob(directJob, canonicalSenderTabId) };
      }

      if (!expectedJobId || !context.state || !Array.isArray(context.state.jobIndex)) {
        context.log('info', 'bg', 'TAB_CLAIM_REJECTED', 'Nenhum job elegível para claim', {
          tabId: canonicalSenderTabId,
        });
        return { job: null };
      }

      const indexed = context.state.jobIndex.find(entry =>
        entry && entry.jobId === expectedJobId
      );
      if (!indexed) return { job: null };

      const canonicalIndexedTabId = tabIdentity
        ? await tabIdentity.resolveCanonicalTabId(indexed.geminiTabId)
        : indexed.geminiTabId;

      if (canonicalIndexedTabId !== canonicalSenderTabId) {
        context.log('warn', 'bg', 'TAB_CLAIM_REJECTED', 'Claim rejeitado por ownership de aba', {
          tabId: canonicalSenderTabId,
          indexedTabId: canonicalIndexedTabId,
        });
        return { job: null };
      }

      if (tabIdentity && indexed.geminiTabId !== canonicalSenderTabId) {
        await tabIdentity.migrateTabIdentity(indexed.geminiTabId, canonicalSenderTabId, {
          jobId: expectedJobId,
        });
      }

      const migratedKey = `gemini_job_${canonicalSenderTabId}`;
      const migratedData = await context.storage.get([migratedKey]);
      const migratedJob = migratedData && migratedData[migratedKey];
      if (!migratedJob || migratedJob.jobId !== expectedJobId) return { job: null };

      context.log('info', 'bg', 'TAB_CLAIM_ALIAS', 'Job reivindicado após resolver alias', {
        tabId: canonicalSenderTabId,
        jobIdPrefix: expectedJobId.slice(0, 8),
      });
      return { job: safeJob(migratedJob, canonicalSenderTabId) };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## 10. Rastreabilidade 103/103

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode para a action. |
| 002 | U01 | // background/actions/claim-gemini-job.js — Claim seguro de job pela aba Gemini. | Comentário de U01: “background/actions/claim-gemini-job.js — Claim seguro de job pela aba Gemini.”; registra intenção sem executar. |
| 003 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho); sem alteração de estado/controle. |
| 004 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`, fornecendo parte concreta do contrato/condição iniciado nas linhas adjacentes. |
| 005 | U02 |   function safeJob(job, canonicalTabId) { | Declara o sanitizador que transforma registro interno em contrato IPC mínimo. |
| 006 | U02 |     if (!job) return null; | Retorna null imediatamente quando não há registro, evitando dereference. |
| 007 | U02 |     return { | Abre objeto de retorno de U02. |
| 008 | U02 |       jobId: job.jobId, | Expõe jobId necessário para correlacionar mensagens/retries do job. |
| 009 | U02 |       batchId: job.batchId, | Expõe batchId necessário para manter identidade do lote. |
| 010 | U02 |       mangaTabId: job.mangaTabId, | Expõe a aba do leitor que receberá progresso/resultado. |
| 011 | U02 |       index: job.index, | Expõe o índice da página dentro do lote. |
| 012 | U02 |       prompt: job.prompt, | Expõe o prompt necessário ao runner Gemini. |
| 013 | U02 |       executionMode: job.executionMode, | Expõe o modo de execução usado pelo runner/cleanup. |
| 014 | U02 |       geminiTabId: canonicalTabId, | Substitui qualquer tabId interno pelo canonicalTabId já verificado. |
| 015 | U02 |       windowId: job.windowId, | Expõe windowId quando necessário ao modo de janela, sem campos internos adicionais. |
| 016 | U02 |     }; | Fecha a estrutura sintática da unidade U02. |
| 017 | U02 |   } | Fecha a estrutura sintática da unidade U02. |
| 018 | U02 | ␠ [linha vazia] | Separador visual de U02 (safeJob e minimização de dados); sem alteração de estado/controle. |
| 019 | U03 |   scope.MangaTranslatorRouter.registerAction({ | Registra a definição no MangaTranslatorRouter. |
| 020 | U03 |     name: 'claim-gemini-job', | Define o nome canônico resolvido do alias CLAIM_GEMINI_JOB. |
| 021 | U03 |     meta: { | Completa a expressão de U03 com `meta: {`, fornecendo parte concreta do contrato/condição iniciado nas linhas adjacentes. |
| 022 | U03 |       allowedSources: ['gemini'], | Restringe o router a origem classificada como Gemini antes de execute. |
| 023 | U03 |     }, | Fecha a estrutura sintática da unidade U03. |
| 024 | U03 | ␠ [linha vazia] | Separador visual de U03 (Registro e allowlist de origem); sem alteração de estado/controle. |
| 025 | U04 |     async execute(request, context) { | Abre executor assíncrono de claim. |
| 026 | U04 |       if (context && typeof context.ensureInitialized === 'function') { | Checa se o contexto real oferece reidratação antes de usá-la; mantém harness parcial compatível. |
| 027 | U04 |         await context.ensureInitialized(); | Reidrata/reconcilia estado durável antes do claim no background real. |
| 028 | U04 |       } | Fecha a estrutura sintática da unidade U04. |
| 029 | U04 | ␠ [linha vazia] | Separador visual de U04 (Inicialização e identidade do sender); sem alteração de estado/controle. |
| 030 | U04 |       const senderTabId = context && context.sender && context.sender.tab | Começa extração defensiva do tabId vindo de context.sender. |
| 031 | U04 |         ? context.sender.tab.id | Seleciona sender.tab.id fornecido pelo runtime como identidade de aba. |
| 032 | U04 |         : null; | Usa null quando sender/tab não existe, levando à rejeição inteira logo abaixo. |
| 033 | U04 |       if (!Number.isInteger(senderTabId)) return { job: null }; | Exige tabId inteiro; sender sem identidade válida recebe job:null. |
| 034 | U05 | ␠ [linha vazia] | Separador visual de U05 (jobId esperado e canonicalização do sender); sem alteração de estado/controle. |
| 035 | U05 |       const expectedJobId = typeof request.jobId === 'string' && request.jobId | Normaliza request.jobId somente quando é string truthy. |
| 036 | U05 |         ? request.jobId | Seleciona o jobId recebido como restrição adicional do claim. |
| 037 | U05 |         : null; | Usa `null` quando `request.jobId` não é uma string truthy; esta condição é independente da existência de `sender.tab`, já validada nas posições 30–33. |
| 038 | U05 |       const tabIdentity = context.tabIdentity; | Obtém serviço de canonicalização/migração injetado pelo background. |
| 039 | U05 |       const canonicalSenderTabId = tabIdentity | Começa resolução da identidade canônica do sender. |
| 040 | U05 |         ? await tabIdentity.resolveCanonicalTabId(senderTabId) | Resolve alias/replacement do sender para o tabId canônico. |
| 041 | U05 |         : senderTabId; | Sem TabIdentity, mantém o tabId original como fallback compatível. |
| 042 | U06 | ␠ [linha vazia] | Separador visual de U06 (Claim direto por chave durável); sem alteração de estado/controle. |
| 043 | U06 |       const directKey = `gemini_job_${canonicalSenderTabId}`; | Constrói a única chave durável direta `gemini_job_<tab canônico>`. |
| 044 | U06 |       const directData = await context.storage.get([directKey]); | Busca somente a chave do sender canônico em storage. |
| 045 | U06 |       const directJob = directData && directData[directKey]; | Extrai o registro direto retornado para decisão de ownership. |
| 046 | U06 |       if (directJob) { | Entra no caminho rápido somente quando existe job persistido exatamente para essa aba. |
| 047 | U06 |         if (expectedJobId && directJob.jobId !== expectedJobId) { | Rejeita URL/request que exige job diferente do registro dessa aba. |
| 048 | U06 |           context.log('warn', 'bg', 'TAB_CLAIM_REJECTED', 'Claim rejeitado por jobId divergente', { | Registra rejeição de claim sem expor conteúdo completo do job. |
| 049 | U06 |             tabId: canonicalSenderTabId, | Associa o log ao tabId canônico que tentou o claim. |
| 050 | U06 |           }); | Fecha a estrutura sintática da unidade U06. |
| 051 | U06 |           return { job: null }; | Retorna claim nulo; o router envolverá o resultado em ok:true quando execute conclui normalmente. |
| 052 | U06 |         } | Fecha a estrutura sintática da unidade U06. |
| 053 | U06 |         context.log('info', 'bg', 'TAB_CLAIM_DIRECT', 'Job reivindicado por chave direta', { | Registra que a autorização veio da chave direta do sender. |
| 054 | U06 |           tabId: canonicalSenderTabId, | Associa o log ao tabId canônico que tentou o claim. |
| 055 | U06 |           jobIdPrefix: String(directJob.jobId \|\| '').slice(0, 8), | Loga somente prefixo de oito caracteres do jobId para correlação minimizada. |
| 056 | U07 |         }); | Fecha a estrutura sintática da unidade U07. |
| 057 | U07 |         return { job: safeJob(directJob, canonicalSenderTabId) }; | Sanitiza o registro direto antes de atravessar IPC. |
| 058 | U07 |       } | Fecha a estrutura sintática da unidade U07. |
| 059 | U08 | ␠ [linha vazia] | Separador visual de U07 (Sucesso direto e observabilidade); sem alteração de estado/controle. |
| 060 | U08 |       if (!expectedJobId \|\| !context.state \|\| !Array.isArray(context.state.jobIndex)) { | Bloqueia fallback por índice sem jobId esperado ou sem índice de estado válido. |
| 061 | U08 |         context.log('info', 'bg', 'TAB_CLAIM_REJECTED', 'Nenhum job elegível para claim', { | Registra rejeição de claim sem expor conteúdo completo do job. |
| 062 | U08 |           tabId: canonicalSenderTabId, | Associa o log ao tabId canônico que tentou o claim. |
| 063 | U08 |         }); | Fecha a estrutura sintática da unidade U07. |
| 064 | U08 |         return { job: null }; | Retorna claim nulo; o router envolverá o resultado em ok:true quando execute conclui normalmente. |
| 065 | U08 |       } | Fecha a estrutura sintática da unidade U08. |
| 066 | U09 | ␠ [linha vazia] | Separador visual de U08 (Pré-condições do fallback por índice); sem alteração de estado/controle. |
| 067 | U09 |       const indexed = context.state.jobIndex.find(entry => | Procura no jobIndex o entry cujo jobId coincide estritamente com expectedJobId. |
| 068 | U09 |         entry && entry.jobId === expectedJobId | Filtra entries nulos e exige igualdade estrita de jobId. |
| 069 | U09 |       ); | Fecha a estrutura sintática da unidade U08. |
| 070 | U09 |       if (!indexed) return { job: null }; | Retorna claim nulo; o router envolverá o resultado em ok:true quando execute conclui normalmente. |
| 071 | U09 | ␠ [linha vazia] | Separador visual de U08 (Pré-condições do fallback por índice); sem alteração de estado/controle. |
| 072 | U09 |       const canonicalIndexedTabId = tabIdentity | Começa canonicalização do tabId armazenado no índice. |
| 073 | U09 |         ? await tabIdentity.resolveCanonicalTabId(indexed.geminiTabId) | Resolve aliases do tabId indexado antes de comparar ownership. |
| 074 | U09 |         : indexed.geminiTabId; | Sem serviço de identidade, usa o tabId original do índice. |
| 075 | U09 | ␠ [linha vazia] | Separador visual de U09 (Busca indexada e canonicalização do job); sem alteração de estado/controle. |
| 076 | U10 |       if (canonicalIndexedTabId !== canonicalSenderTabId) { | Exige igualdade entre identidade canônica do job e do sender. |
| 077 | U10 |         context.log('warn', 'bg', 'TAB_CLAIM_REJECTED', 'Claim rejeitado por ownership de aba', { | Registra rejeição de claim sem expor conteúdo completo do job. |
| 078 | U10 |           tabId: canonicalSenderTabId, | Associa o log ao tabId canônico que tentou o claim. |
| 079 | U10 |           indexedTabId: canonicalIndexedTabId, | Registra no warning o tabId canônico esperado pelo índice para diagnóstico. |
| 080 | U10 |         }); | Fecha a estrutura sintática da unidade U09. |
| 081 | U10 |         return { job: null }; | Retorna claim nulo; o router envolverá o resultado em ok:true quando execute conclui normalmente. |
| 082 | U10 |       } | Fecha a estrutura sintática da unidade U10. |
| 083 | U11 | ␠ [linha vazia] | Separador visual de U10 (Verificação de ownership canônico); sem alteração de estado/controle. |
| 084 | U11 |       if (tabIdentity && indexed.geminiTabId !== canonicalSenderTabId) { | Detecta que o índice ainda usa id antigo embora ambos resolvam para o sender canônico. |
| 085 | U11 |         await tabIdentity.migrateTabIdentity(indexed.geminiTabId, canonicalSenderTabId, { | Executa migração durável do id antigo para o id canônico novo antes de responder. |
| 086 | U11 |           jobId: expectedJobId, | Expõe jobId necessário para correlacionar mensagens/retries do job. |
| 087 | U11 |         }); | Fecha a estrutura sintática da unidade U10. |
| 088 | U11 |       } | Fecha a estrutura sintática da unidade U10. |
| 089 | U12 | ␠ [linha vazia] | Separador visual de U11 (Migração após alias); sem alteração de estado/controle. |
| 090 | U12 |       const migratedKey = `gemini_job_${canonicalSenderTabId}`; | Reconstrói a chave durável esperada após a migração. |
| 091 | U12 |       const migratedData = await context.storage.get([migratedKey]); | Relê storage no tabId canônico para validar o efeito persistido. |
| 092 | U12 |       const migratedJob = migratedData && migratedData[migratedKey]; | Extrai o job pós-migração para revalidação. |
| 093 | U12 |       if (!migratedJob \|\| migratedJob.jobId !== expectedJobId) return { job: null }; | Retorna claim nulo; o router envolverá o resultado em ok:true quando execute conclui normalmente. |
| 094 | U12 | ␠ [linha vazia] | Separador visual de U11 (Migração após alias); sem alteração de estado/controle. |
| 095 | U13 |       context.log('info', 'bg', 'TAB_CLAIM_ALIAS', 'Job reivindicado após resolver alias', { | Registra sucesso obtido após resolução/migração de alias. |
| 096 | U13 |         tabId: canonicalSenderTabId, | Associa o log ao tabId canônico que tentou o claim. |
| 097 | U13 |         jobIdPrefix: expectedJobId.slice(0, 8), | Loga somente prefixo de oito caracteres do jobId para correlação minimizada. |
| 098 | U13 |       }); | Fecha a estrutura sintática da unidade U12. |
| 099 | U13 |       return { job: safeJob(migratedJob, canonicalSenderTabId) }; | Sanitiza o registro migrado antes de devolvê-lo. |
| 100 | U13 |     }, | Fecha a estrutura sintática da unidade U12. |
| 101 | U13 |   }); | Fecha a estrutura sintática da unidade U12. |
| 102 | U13 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE escolhendo self no worker e globalThis no fallback de testes. |
| 103 | U14 | ⏎ [newline final] | Preserva o newline terminal do blob; sem efeito runtime. |

## 11. Análise por unidade

### U01 — linhas/posição 1–3: Cabeçalho

**O que faz:** Ativa strict mode e registra a intenção: claim seguro de job por uma aba Gemini.

**Como faz:** Diretiva + comentário antes da IIFE.

**Por que desta forma:** A action é uma fronteira de ownership e merece contrato explícito.

**Por que uma implementação ingênua seria pior:** Sem contexto, uma refatoração pode confundir claim com busca global de jobs.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento da action real; sem assertion isolada.

### U02 — linhas/posição 4–18: safeJob e minimização de dados

**O que faz:** Constrói o único shape de job que pode atravessar o IPC para content_gemini.

**Como faz:** Copia apenas jobId, batchId, mangaTabId, index, prompt, executionMode, canonical geminiTabId e windowId; retorna null para job ausente.

**Por que desta forma:** O registro durável pode conter campos internos/URLs/tokens que o content script não precisa conhecer.

**Por que uma implementação ingênua seria pior:** Retornar `{...job}` vaza novos campos internos automaticamente e aumenta acoplamento/risco de segredo.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste de claim direto exige exatamente o contrato e verifica ausência de `signedUrl`/`internalOnly`. ⚠️ safeJob(null) não tem caso focal.

### U03 — linhas/posição 19–24: Registro e allowlist de origem

**O que faz:** Registra `claim-gemini-job` e limita execução a fontes classificadas como `gemini` pelo router.

**Como faz:** meta.allowedSources=['gemini']; o router bloqueia antes de execute quando identifySource não classifica o sender como Gemini.

**Por que desta forma:** Reduz superfície: popup/content/external não devem sequer tentar reivindicar jobs Gemini.

**Por que uma implementação ingênua seria pior:** allowedSources:any exporia endpoint de claim para todos os contexts; fazer a checagem só dentro da action duplicaria lógica do router.

**Evidência:** ✅ PROVADO DIRETAMENTE — origem reader recebe SOURCE_DENIED, keepAlive=false e execute não produz job. Router.test prova genericamente bloqueio pré-execução.

### U04 — linhas/posição 25–33: Inicialização e identidade do sender

**O que faz:** Reidrata o background quando a dependência existe e extrai sender.tab.id, rejeitando sender sem tabId inteiro.

**Como faz:** ensureInitialized é opcional para compatibilidade de testes; senderTabId usa cadeia defensiva e Number.isInteger.

**Por que desta forma:** No MV3, índice/aliases precisam estar reconciliados antes do claim; tabId fornecido pelo Chrome é a âncora de ownership.

**Por que uma implementação ingênua seria pior:** Confiar em tabId do request permitiria spoofing; aceitar null/string abriria chaves storage ambíguas.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para ensureInitialized, sender sem tab, tab.id string/null. Os testes diretos sempre usam tabId inteiro e context de teste sem ensureInitialized.

### U05 — linhas/posição 34–41: jobId esperado e canonicalização do sender

**O que faz:** Obtém jobId opcional do request e resolve o tabId do sender para a identidade canônica quando TabIdentity existe.

**Como faz:** expectedJobId só aceita string truthy; resolveCanonicalTabId acompanha aliases/replacements; sem serviço usa senderTabId.

**Por que desta forma:** jobId na URL protege contra aba correta com job antigo; canonicalização mantém ownership após chrome.tabs.onReplaced.

**Por que uma implementação ingênua seria pior:** Usar tabId antigo literalmente perderia job após replacement; usar jobId sem vínculo com sender permitiria takeover por outra aba.

**Evidência:** ✅ PROVADO DIRETAMENTE no cenário TAB-06 para canonicalização por alias; ⚠️ fallback sem tabIdentity e jobId vazio/whitespace não têm caso focal.

### U06 — linhas/posição 42–55: Claim direto por chave durável

**O que faz:** Procura `gemini_job_<canonicalSenderTabId>` e, se existir, opcionalmente exige correspondência do expectedJobId.

**Como faz:** storage.get lê uma única chave; mismatch loga TAB_CLAIM_REJECTED e retorna null; match segue para sucesso direto.

**Por que desta forma:** Chave tab-scoped é o caminho mais barato e forte: liga metadata de sender a um registro persistido sem full scan.

**Por que uma implementação ingênua seria pior:** Varrer storage por jobId aumenta custo e permitiria encontrar job de outra aba; ignorar expectedJobId permite que URL stale reivindique job diferente.

**Evidência:** ✅ PROVADO DIRETAMENTE — claim direto retorna job sanitizado; TAB-10 rejeita jobId divergente na mesma aba. ⚠️ storage.get rejeitando/retornando shape inválido não tem teste.

### U07 — linhas/posição 56–58: Fechamento do sucesso direto

**O que faz:** Fecha o log `TAB_CLAIM_DIRECT`, retorna `safeJob(directJob, canonicalSenderTabId)` e encerra o ramo do claim direto.

**Como faz:** A telemetria foi aberta nas posições 53–55; esta unidade contém o fechamento do log, o retorno sanitizado e o fechamento do `if (directJob)`.

**Por que desta forma:** Telemetria distingue caminho direto do caminho alias e minimiza ID nos logs.

**Por que uma implementação ingênua seria pior:** Retornar directJob cru quebraria minimização; logar jobId completo aumenta exposição desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE para o objeto retornado/sanitização. ⚠️ Log TAB_CLAIM_DIRECT e truncamento não têm assertion focal.

### U08 — linhas/posição 59–65: Pré-condições do fallback por índice

**O que faz:** Após o miss do caminho direto, só permite o fallback por índice quando há `expectedJobId`, `context.state` e `state.jobIndex` array; caso contrário loga rejeição e retorna `job:null`.

**Como faz:** Guarda combinada loga TAB_CLAIM_REJECTED e retorna job:null.

**Por que desta forma:** Sem jobId explícito não há identidade suficiente para procurar em índice após miss da chave direta; isso impede full scan/claim oportunista de aba manual.

**Por que uma implementação ingênua seria pior:** Escolher primeiro job do índice para aba manual poderia sequestrar trabalho; iterar storage sem jobId aumenta superfície e custo.

**Evidência:** ✅ PROVADO DIRETAMENTE — TAB-11, aba Gemini manual sem job, recebe job:null. ⚠️ state ausente/jobIndex não-array com expectedJobId não tem caso focal.

### U09 — linhas/posição 66–75: Busca indexada e canonicalização do job

**O que faz:** Busca o entry estritamente pelo `expectedJobId`, rejeita miss e resolve o `geminiTabId` encontrado para a identidade canônica antes da checagem de ownership.

**Como faz:** Array.find é estrito em jobId; miss retorna null; resolveCanonicalTabId é aplicado ao tabId do entry.

**Por que desta forma:** O índice é o journal leve que permite recuperar job cuja chave ainda está no tabId antigo sem ler todo storage.

**Por que uma implementação ingênua seria pior:** Comparação frouxa pode colidir IDs; pular canonicalização trataria alias legítimo como ownership divergente.

**Evidência:** ✅ PROVADO DIRETAMENTE pelo cenário TAB-06, que parte de jobIndex no tabId antigo. ⚠️ expectedJobId não encontrado no índice não tem cenário focal separado.

### U10 — linhas/posição 76–82: Verificação de ownership canônico

**O que faz:** Recusa o claim se o tabId canônico do job indexado não coincide com o tabId canônico do sender.

**Como faz:** Comparação estrita; mismatch loga sender/indexed ids e retorna null.

**Por que desta forma:** jobId sozinho não é segredo/autorização suficiente; ownership exige vínculo entre job e aba.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer aba que saiba jobId permitiria uma aba Gemini paralela reivindicar trabalho alheio.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo de mismatch canônico. O teste de jobId mismatch é no caminho direto e não substitui esta propriedade.

### U11 — linhas/posição 83–88: Migração após alias

**O que faz:** Quando TabIdentity existe e o índice ainda aponta para um `geminiTabId` diferente do sender canônico, executa a migração durável `migrateTabIdentity(old,new,{jobId})`.

**Como faz:** migrateTabIdentity(old,new,{jobId}) é awaited antes de reler storage.

**Por que desta forma:** Evita devolver job enquanto storage/índice ainda possuem ownership dividido; a migração tem journal no módulo TabIdentity.

**Por que uma implementação ingênua seria pior:** Só alterar o objeto retornado esconderia inconsistência persistida e quebraria mensagens/finalização posteriores.

**Evidência:** ✅ PROVADO DIRETAMENTE — TAB-06 exige índice migrado para 200, chave antiga removida e `gemini_job_200` criada. tab-identity.test aprofunda journal/chain/recovery.

### U12 — linhas/posição 89–94: Read-after-write pós-migração

**O que faz:** Relê a chave canônica após a eventual migração e exige que o job persistido exista e tenha o mesmo `expectedJobId`.

**Como faz:** constrói `gemini_job_<canonicalSenderTabId>`, faz `storage.get`, extrai o registro e retorna `job:null` quando o read-after-write não confirma a identidade esperada.

**Por que desta forma:** Read-after-write valida que o claim final está ancorado no estado persistido canônico.

**Por que uma implementação ingênua seria pior:** Retornar o entry antigo do índice após migração poderia usar dados stale/incompletos; não revalidar jobId aceitaria migração concorrente para outro job.

**Evidência:** ✅ PROVADO DIRETAMENTE — TAB-06 exige job retornado com geminiTabId novo e storage migrado. ⚠️ migrated key ausente/jobId divergente e falha de migration/storage não têm casos focais.

### U13 — linhas/posição 95–102: Observabilidade e retorno após alias

**O que faz:** Registra `TAB_CLAIM_ALIAS`, minimiza o jobId no log, devolve o `safeJob` migrado/canônico e fecha a action/IIFE.

**Como faz:** o log usa `canonicalSenderTabId` e prefixo de oito caracteres de `expectedJobId`; o retorno passa pelo sanitizador `safeJob`. As posições finais fecham `execute`, `registerAction` e a IIFE.

**Por que desta forma:** mantém telemetria distinta do caminho direto e só responde depois que o read-after-write confirmou o estado persistido.

**Evidência:** ✅ TAB-06 prova o job retornado com `geminiTabId` novo e o storage migrado. ⚠️ O conteúdo exato do log/truncamento não possui assertion focal.

### U14 — linhas/posição 103–103: Newline final

**O que faz:** Documenta o newline terminal do blob.

**Como faz:** Posição separada das 102 linhas textuais.

**Por que desta forma:** Mantém equivalência física no padrão de auditoria.

**Por que uma implementação ingênua seria pior:** Omitir a posição produziria 102/103 disfarçado.

**Evidência:** 🟦 GATE DOCUMENTAL.


## 12. Revisão final

- [x] SHA/fonte integral conferidos;
- [x] 102 linhas + newline = 103/103 posições;
- [x] safeJob/sanitização documentados;
- [x] source allowlist separado de ownership;
- [x] caminho direto e alias separados;
- [x] prova da action, helper e consumidor diferenciadas;
- [x] lacunas explícitas, sem evidência verde genérica;
- [x] invariantes MV3/security definidos;
- [x] nenhum código funcional alterado.

**Veredito documental:** aprovada para `f5c4643d291931f133a791a2deaa6eb94ef4500d`.

> **Correção pós-REAUDIT:** a posição 037 agora descreve `request.jobId`; U07–U14 seguem as fronteiras reais do source, e o wiring de produção entre background/router/contextFactory/jobs-lifecycle/content_gemini foi explicitado sem promovê-lo indevidamente a prova de teste focal.

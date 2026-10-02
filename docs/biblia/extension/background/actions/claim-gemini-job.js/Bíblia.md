# Bíblia técnica — `extension/background/actions/claim-gemini-job.js`

> **Estado documental:** correção validada; decisão distribuída final pendente  
> **SHA auditado:** `a749a2157e1111ffd13bd46ee6fa5480f369c60a`
> **Tipo:** action de autorização/claim de job Gemini  
> **Linhas textuais:** **102**  
> **Posições documentais:** **103**, contando o LF final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`claim-gemini-job` autoriza o bootstrap de uma aba Gemini contra um job persistido. O claim é tab-scoped: o sender real fornece o tabId; quando existe TabIdentity, o sender e o entry indexado são resolvidos para identidades canônicas antes de qualquer liberação do job.

Há dois caminhos legítimos:

1. **direto:** `gemini_job_<canonicalSenderTabId>` já existe;
2. **alias/replacement:** a chave direta falta, o `expectedJobId` existe no `jobIndex`, o entry pertence canonicamente ao mesmo sender, a identidade é migrada e a chave canônica é relida antes da resposta.

A resposta sempre passa por `safeJob`, que funciona como allowlist e evita devolver campos internos adicionados ao registro persistido.

## 1.1 Wiring de produção e consumidores

O fluxo real chega à action por `extension/background/router.js`: o mapa legado converte `CLAIM_GEMINI_JOB` em `claim-gemini-job`, e a action declara `allowedSources: ['gemini']`. `extension/background.js` carrega esse módulo no bootstrap do service worker e `routeRegisteredAction` cria o router real; seu `contextFactory` fornece `state`, `ensureInitialized` e `tabIdentity: initializeTabIdentity()` junto do `sender` e do adaptador `chrome.storage.local` criado pelo router.

O produtor está em `extension/background/jobs-lifecycle.js`. `buildGeminiJobUrl` coloca o `jobId` gerado na URL gerenciada. A inicialização persiste `gemini_job_<canonicalTabId>` e insere o mesmo `jobId` no `state.jobIndex` antes de o content script precisar reivindicar o job. O consumidor de produção, `extension/content/content_gemini.js`, extrai e trimma `jobId` da URL e envia `{ action: 'CLAIM_GEMINI_JOB', jobId }`; para uma aba manual sem identificador, envia `jobId: undefined` e espera uma resposta nula.

`extension/background/tab-identity.js`, inicializado pelo background e passado no contexto, resolve aliases de substituição e migra o registro persistido. A action só pode devolver um registro direto quando o `jobId` esperado da URL está presente e coincide exatamente com o registro; conhecer somente o tabId não autoriza revelar os dados do job.

Os testes focais carregam router/action reais com storage, sender e TabIdentity simulados. O self-test causal carrega a action real com dependências controladas e prova ordenação/falhas; nenhum dos dois substitui evidência de wiring em runtime. Essa distinção separa o contrato isolado da cadeia de produção descrita acima.

## 2. Trust boundary e ownership

`meta.allowedSources = ['gemini']` exige classificação Gemini no router, mas origem por URL não substitui ownership. A defesa principal continua sendo a combinação de:

- `sender.tab.id` fornecido pelo runtime;
- canonicalização do sender;
- chave durável tab-scoped;
- `expectedJobId`, quando fornecido;
- canonicalização independente do entry encontrado no índice;
- comparação estrita entre sender e entry canônicos;
- read-after-write após migração.

O novo self-test causal prova explicitamente que conhecer um `jobId` não basta quando o entry canônico pertence a outra aba.

## 3. Inicialização e sender

`ensureInitialized` é aguardado quando a dependência existe. O self-test segura a Promise de inicialização e prova que nenhuma leitura de storage ocorre antes da resolução; também prova que rejeição de inicialização é propagada sem leitura.

`sender.tab.id` precisa ser inteiro. Sender sem tab, id ausente, `null`, string ou `NaN` retorna `{ job: null }` antes de tocar storage.

A action mantém compatibilidade quando `context.tabIdentity` não existe: nesse caso o próprio sender inteiro é a identidade canônica.

## 4. Caminho direto

O sender é canonicalizado antes de construir `gemini_job_<canonicalSenderTabId>`. Isso agora possui prova causal: o self-test usa sender `100`, resolve `100 → 200` e disponibiliza o job **somente** em `gemini_job_200`; sem canonicalização do sender o cenário falharia.

Quando `expectedJobId` está ausente ou diverge do registro direto, a action retorna `job:null` e não expõe o job. O teste adversarial de registro residual cobre especificamente a ausência do identificador.

`safeJob` devolve apenas `jobId`, `batchId`, `mangaTabId`, `index`, `prompt`, `executionMode`, `geminiTabId` canônico e `windowId`. O self-test injeta `signedUrl` e `internalOnly` e prova que não vazam.

## 5. Fallback por índice e ownership canônico

O fallback só existe após miss direto, exige `expectedJobId` e `state.jobIndex` array, e busca entry por igualdade estrita de `jobId`.

Se não existe entry, a resposta é `job:null`. Se existe, `indexed.geminiTabId` é canonicalizado de forma independente.

Quando `canonicalIndexedTabId !== canonicalSenderTabId`, o claim é rejeitado e `migrateTabIdentity` não é chamado. O self-test cobre esse branch diretamente com sender canônico `200` e entry canônico `300`.

## 6. Migração e read-after-write

Quando sender e entry representam a mesma identidade canônica, mas o índice ainda contém o tab antigo, `migrateTabIdentity(old,new,{jobId})` é **awaited**.

Depois da migração a action relê `gemini_job_<canonicalSenderTabId>` e só aceita o registro se o job existir e `jobId === expectedJobId`.

O self-test grava uma sequência de eventos e exige exatamente:

`resolve sender → get direto → resolve entry → migrate → get pós-migração`.

Isso fecha a lacuna de prova apontada por PRIMARY e ADVERSARIAL: o read-after-write e sua ordem não são mais inferidos apenas do efeito final.

Também há casos focais para:

- `migrateTabIdentity` rejeitando — a rejeição propaga e não há segundo `storage.get`;
- chave pós-migração ausente — `job:null`;
- chave pós-migração com outro `jobId` — `job:null`;
- `storage.get` rejeitando — a action propaga o erro causal, sem convertê-lo em claim negativo silencioso.

## 7. Evidência executável

Self-test: `docs/biblia/.coordination/claim-gemini-job-selftest.js` — SHA `80af4a6a2b923a785b346f5eaf7b4b42e659bbe3`.
Workflow: `.github/workflows/claim-gemini-job-selftest.yml` — SHA `e2fa4093e6f63cdf014152ef22ae9a7b27122161`.

O run `36943278337`, job `110639489841`, é evidência histórica da revisão anterior: executou os blobs acima e o source SHA `f5c4643d291931f133a791a2deaa6eb94ef4500d`. Ele não valida a correção atual. A revisão corrigida é validada pelos testes pós-correção executados neste branch e permanece pendente de nova auditoria independente.

Naquela revisão, a evidência registrada foi:

- self-test causal: **PASS**;
- projeto Jest `background`: **45/45 suites, 225/225 testes**;
- execução relacionada: `--runInBand --detectOpenHandles`;
- conclusão do workflow: **success**.

Na revisão corrigida, o teste focal da action passou em **7/7** (incluindo o teste de registro residual, que falhou antes da guarda), o projeto `background` passou em **45/45 suites e 229/229 testes** com `--detectOpenHandles`, e o self-test causal passou. A suíte de bootstrap `claim-bootstrap-keepalive.test.js` também passou em **5/5**; a regressão específica do fallback legado ainda está sendo acrescentada na unidade #175, então esse resultado isolado não prova tal branch.

## 8. Audit requests históricas

### 005-001 — RESOLVED

A cobertura focal agora prova ownership canônico divergente, migração rejeitando e pós-migração com chave ausente/jobId divergente. A ordem causal do read-after-write também é assertada.

### 005-002 — RESOLVED

A cobertura focal inclui `ensureInitialized` aguardado/rejeitando, sender sem tab/id inteiro, TabIdentity ausente, jobIndex ausente/sem entry e `storage.get` rejeitando.

## 9. Findings PRIMARY + ADVERSARIAL da revisão anterior

Os dois auditores independentes concordaram em três classes de problema:

1. **rastreabilidade stale** — papéis locais U07–U13 ainda citavam unidades antigas depois do remapeamento;
2. **evidência superestimada** — canonicalização do sender e read-after-write eram rotulados como prova direta sem teste causal;
3. **status stale** — a Bíblia corrente dizia `REAUDITADO/APROVÁVEL` apesar de o REAUDIT pertencer a outro `BIBLE_SHA`.

Esta revisão remove os rótulos stale, substitui a antiga tabela remapeada por faixas semânticas contíguas e ancora a força de evidência no self-test causal da revisão atual. Ela **não** declara `DONE`, `COMPLETED`, `aprovada` ou `100/100`; nova PRIMARY + ADVERSARIAL independente é obrigatória para este `BIBLE_SHA`.

## 10. Limites honestos

- A action assume unicidade prática de `jobId` no `jobIndex`; este arquivo não cria nem deduplica o índice.
- O consumidor tem um fallback de compatibilidade que lê `gemini_job_<tabId>` apenas quando o background não responde; ele também exige correspondência exata de um `jobId` esperado, pois o identificador é obrigatório em toda URL gerenciada.
- `expectedJobId` aceita qualquer string truthy, inclusive whitespace; o consumidor gerenciado faz trim antes do envio. Isso não concede job alheio: caminho direto ainda exige correspondência exata e fallback exige entry com o mesmo valor.
- O contrato de validade interna dos registros persistidos pertence aos produtores; `safeJob` reduz a superfície exposta, mas não valida semanticamente cada campo.
- Falhas de storage/TabIdentity não são convertidas localmente em `INTERNAL_ERROR`; a action propaga e o router é responsável pela tradução de erro.

## 11. Fonte integral exata

```javascript
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
        if (!expectedJobId || directJob.jobId !== expectedJobId) {
          context.log('warn', 'bg', 'TAB_CLAIM_REJECTED', 'Claim rejeitado por jobId ausente ou divergente', {
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
```

## 12. Cobertura integral por posições

- **1–4:** strict mode, identidade e abertura da IIFE.
- **5–17:** `safeJob` e allowlist de campos.
- **18:** separador vazio.
- **19–24:** registro da action e metadata de origem.
- **25–29:** início de `execute` e barreira opcional `ensureInitialized`.
- **30–34:** extração/validação do sender tabId.
- **35–38:** normalização do `expectedJobId` e referência a TabIdentity.
- **39–42:** canonicalização do sender.
- **43–59:** leitura direta, mismatch de jobId, telemetria e retorno sanitizado.
- **60–66:** guarda do fallback por índice.
- **67–71:** busca estrita de entry e miss.
- **72–75:** canonicalização do tabId indexado.
- **76–82:** rejeição de ownership canônico divergente.
- **83:** separador vazio.
- **84–88:** migração awaited de identidade antiga para sender canônico.
- **89:** separador vazio.
- **90–94:** read-after-write e validação de existência/jobId.
- **95–99:** telemetria e retorno sanitizado após alias.
- **100–102:** fechamento de execute/registro e seleção literal `self` se definido, senão `globalThis`.
- **103:** posição vazia correspondente ao LF final.

**Cobertura: 103/103 posições, sem gap ou overlap.**

## 13. Autoauditoria documental

- Source SHA: `a749a2157e1111ffd13bd46ee6fa5480f369c60a`.
- Fonte integral inserida diretamente do blob atual.
- As antigas remissões U07–U13 não existem mais; as faixas acima correspondem às fronteiras atuais da fonte.
- Canonicalização do sender e read-after-write possuem agora testes causais, não apenas observação de efeito final.
- Requests 005-001/002 foram corrigidas e validadas pela run `36943278337`.
- A aprovação distribuída permanece pendente até nova PRIMARY + ADVERSARIAL independentes desta revisão.

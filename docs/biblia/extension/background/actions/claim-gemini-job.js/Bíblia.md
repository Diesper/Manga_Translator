# Bíblia técnica — `extension/background/actions/claim-gemini-job.js`

> **Estado:** 🟣 **REVISÃO DE QUALIDADE — NÃO CONCLUÍDO**.  
> **Auditoria:** reprovada em 2026-09-29; ver `docs/biblia/AUDITORIA.md` para os motivos e o protocolo de correção.
> **SHA auditado:** `f5c4643d291931f133a791a2deaa6eb94ef4500d`  
> **Linhas auditadas:** **103**  
> **Teste direto:** `tests/unit/background/claim-gemini-job-action.test.js` (`0cb6cb2f100d7493abfdf4038546e8be747289f1`).

## 1. Papel arquitetural

Esta action é uma **fronteira de autorização e minimização de dados**. Uma aba do Gemini não recebe automaticamente um job só por estar em `gemini.google.com`: ela precisa reivindicar um job que pertença à sua identidade de aba. O protocolo tenta primeiro a chave direta `gemini_job_<canonicalTabId>` e, quando houve `tabs.onReplaced`, usa `jobIndex` + aliases apenas para provar que o job esperado continua pertencendo à aba canônica antes de migrar o ownership.

O helper `safeJob` é tão importante quanto a verificação de ownership: ele aplica uma **allowlist de campos**. O teste contém propositalmente `signedUrl` e `internalOnly` no registro interno e prova que eles não chegam ao content script. Isso evita que o contrato externo cresça acidentalmente quando novos dados internos forem adicionados ao job.

## 2. O que os testes provam

- ✅ claim direto retorna exatamente os campos permitidos;
- ✅ `signedUrl` e `internalOnly` não vazam;
- ✅ jobId divergente é rejeitado mesmo na aba correta;
- ✅ aba Gemini manual sem job recebe `job:null`;
- ✅ origem não-Gemini é bloqueada pelo router com `SOURCE_DENIED`;
- ✅ replacement/alias 100→200 consegue claim legítimo e migra `jobIndex` + storage;
- ✅ chave antiga é removida e chave canônica nova contém o job migrado.

### Lacunas preservadas

- ⚠️ não há teste focal para `sender` sem `tab` dentro do executor (o router normalmente bloqueia/evita esse cenário antes);
- ⚠️ não há teste focal para `context.state.jobIndex` em formato inválido/null;
- ⚠️ não há teste focal onde `resolveCanonicalTabId` produz ownership divergente sem existir job direto;
- ⚠️ não há teste focal de falha/rejeição de `migrateTabIdentity`; a action propagaria a exceção ao router;
- ⚠️ `ensureInitialized` é opcional neste arquivo e o teste direto não injeta a função, portanto o caminho com await é coberto mais fortemente quando a action roda pelo background completo.

## 3. Fonte integral

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

```

## 4. Comentário linha por linha

### Linha 001
<code>'use strict';</code>

**O que faz:** ativa strict mode no módulo.

**Como faz:** é interpretada antes da IIFE.

**Por que assim / por que alternativa ingênua é pior:** evita globais acidentais ao manipular identidade de aba e payload de job.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 002
<code>// background/actions/claim-gemini-job.js — Claim seguro de job pela aba Gemini.</code>

**O que faz:** documenta a intenção local: “background/actions/claim-gemini-job.js — Claim seguro de job pela aba Gemini.”.

**Como faz:** mantém a decisão ao lado do mecanismo de claim que ela descreve.

**Por que assim / por que alternativa ingênua é pior:** claims incorretos podem automatizar uma aba manual; perder contexto aumenta risco de enfraquecer uma barreira de segurança.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 003
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 004
<code>(function(scope) {</code>

**O que faz:** abre IIFE compatível com Service Worker e Jest.

**Como faz:** recebe `self` ou `globalThis` na última linha.

**Por que assim / por que alternativa ingênua é pior:** evita poluir o escopo global além do registro intencional no router.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 005
<code>  function safeJob(job, canonicalTabId) {</code>

**O que faz:** declara o sanitizador de job devolvido ao content script Gemini.

**Como faz:** recebe o registro interno e o tabId canônico e constrói um objeto novo com allowlist de campos.

**Por que assim / por que alternativa ingênua é pior:** retornar o objeto interno inteiro poderia vazar `signedUrl`, flags internas ou futuros segredos; o teste prova explicitamente que campos não allowlisted não vazam.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 006
<code>    if (!job) return null;</code>

**O que faz:** preserva `null` quando não existe job.

**Como faz:** retorno antecipado impede acesso a propriedades de valor ausente.

**Por que assim / por que alternativa ingênua é pior:** fabricar objeto vazio confundiria 'nenhum claim' com job existente mas incompleto.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 007
<code>    return {</code>

**O que faz:** executa a instrução `return {` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 008
<code>      jobId: job.jobId,</code>

**O que faz:** expõe a identidade lógica do job ao worker Gemini.

**Como faz:** copia somente `job.jobId`.

**Por que assim / por que alternativa ingênua é pior:** o content script precisa vincular mensagens futuras ao job correto; omiti-lo impediria ownership verificável.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 009
<code>      batchId: job.batchId,</code>

**O que faz:** expõe o batch ao qual o job pertence.

**Como faz:** copia o campo permitido para o contrato externo.

**Por que assim / por que alternativa ingênua é pior:** batchId é necessário para impedir que finalização tardia de lote antigo afete lote atual.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 010
<code>      mangaTabId: job.mangaTabId,</code>

**O que faz:** expõe a aba de mangá de destino.

**Como faz:** copia o ID já validado/persistido pelo lifecycle.

**Por que assim / por que alternativa ingênua é pior:** derivar destino da aba Gemini seria incorreto porque origem e destino são contextos distintos.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 011
<code>      index: job.index,</code>

**O que faz:** expõe o índice da imagem/página dentro do lote.

**Como faz:** preserva o índice persistido no job.

**Por que assim / por que alternativa ingênua é pior:** recalcular pela ordem atual da fila poderia mudar após concorrência/reidratação.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 012
<code>      prompt: job.prompt,</code>

**O que faz:** expõe o prompt associado especificamente a este job.

**Como faz:** copia o prompt do registro durável.

**Por que assim / por que alternativa ingênua é pior:** ler configuração global neste ponto poderia usar prompt alterado depois que o batch começou.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 013
<code>      executionMode: job.executionMode,</code>

**O que faz:** expõe o modo de execução escolhido para o job.

**Como faz:** copia o valor persistido.

**Por que assim / por que alternativa ingênua é pior:** decidir modo novamente na aba poderia divergir do planejamento feito no background.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 014
<code>      geminiTabId: canonicalTabId,</code>

**O que faz:** expõe o tabId canônico, não necessariamente o ID histórico armazenado.

**Como faz:** usa o resultado da resolução de aliases.

**Por que assim / por que alternativa ingênua é pior:** após `tabs.onReplaced`, devolver o ID antigo quebraria ownership e mensagens subsequentes.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 015
<code>      windowId: job.windowId,</code>

**O que faz:** expõe a janela associada quando aplicável.

**Como faz:** copia somente o campo necessário.

**Por que assim / por que alternativa ingênua é pior:** outros metadados internos de janela não são enviados, reduzindo superfície do contrato.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 016
<code>    };</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 017
<code>  }</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 018
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 019
<code>  scope.MangaTranslatorRouter.registerAction({</code>

**O que faz:** registra a action no roteador modular.

**Como faz:** fornece nome, política de origem e executor.

**Por que assim / por que alternativa ingênua é pior:** centralizar autorização no router evita que cada action implemente identificação de origem de maneira divergente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 020
<code>    name: 'claim-gemini-job',</code>

**O que faz:** define o nome canônico da action.

**Como faz:** é o destino do alias `CLAIM_GEMINI_JOB` em `ACTION_MAP`.

**Por que assim / por que alternativa ingênua é pior:** divergência entre alias e nome tornaria o protocolo inacessível.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 021
<code>    meta: {</code>

**O que faz:** executa a instrução `meta: {` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 022
<code>      allowedSources: ['gemini'],</code>

**O que faz:** restringe o claim a remetentes classificados como Gemini.

**Como faz:** o router bloqueia qualquer source fora da allowlist antes de `execute`.

**Por que assim / por que alternativa ingênua é pior:** permitir `content`, `popup` ou externo seria pior porque outro contexto poderia tentar reivindicar dados de jobs que não lhe pertencem.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 023
<code>    },</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 024
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 025
<code>    async execute(request, context) {</code>

**O que faz:** define o protocolo assíncrono de reivindicação.

**Como faz:** usa awaits para inicialização, canonicalização, storage e migração.

**Por que assim / por que alternativa ingênua é pior:** claim depende de estado durável e aliases; callbacks soltos aumentariam risco de responder antes de ownership ser decidido.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 026
<code>      if (context &amp;&amp; typeof context.ensureInitialized === 'function') {</code>

**O que faz:** verifica se a barreira de inicialização está disponível.

**Como faz:** faz feature detection para compatibilidade de testes/contextos mínimos.

**Por que assim / por que alternativa ingênua é pior:** chamar incondicionalmente quebraria o teste direto cujo contextFactory não injeta essa função; omiti-la quando presente permitiria ler estado não reidratado.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 027
<code>        await context.ensureInitialized();</code>

**O que faz:** aguarda reidratação/reconciliação do background antes do claim.

**Como faz:** bloqueia esta execução até a barreira resolver.

**Por que assim / por que alternativa ingênua é pior:** ler jobIndex/storage antes poderia rejeitar job válido logo após o worker acordar.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 028
<code>      }</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 029
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 030
<code>      const senderTabId = context &amp;&amp; context.sender &amp;&amp; context.sender.tab</code>

**O que faz:** inicia extração segura do tabId real do remetente.

**Como faz:** não confia em `request` para definir a aba que está fazendo claim.

**Por que assim / por que alternativa ingênua é pior:** ownership deve ser ancorado no metadata fornecido pelo runtime, não em input controlado pelo chamador.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 031
<code>        ? context.sender.tab.id</code>

**O que faz:** seleciona `sender.tab.id` quando existe.

**Como faz:** usa guarda completa contra context/sender/tab ausentes.

**Por que assim / por que alternativa ingênua é pior:** acessar diretamente poderia lançar em mensagens de popup/externas; embora essas origens já sejam negadas, a action mantém defesa local.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 032
<code>        : null;</code>

**O que faz:** executa a instrução `: null;` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 033
<code>      if (!Number.isInteger(senderTabId)) return { job: null };</code>

**O que faz:** rejeita sender sem tabId inteiro válido.

**Como faz:** retorna `job:null` antes de qualquer leitura de storage.

**Por que assim / por que alternativa ingênua é pior:** tentar formar `gemini_job_null`/undefined poderia gerar lookup indevido ou claim ambíguo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 034
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 035
<code>      const expectedJobId = typeof request.jobId === 'string' &amp;&amp; request.jobId</code>

**O que faz:** normaliza o jobId solicitado para string não vazia ou `null`.

**Como faz:** aceita somente `typeof === 'string'` e truthy.

**Por que assim / por que alternativa ingênua é pior:** coerção automática de números/objetos tornaria comparações de ownership menos estritas.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 036
<code>        ? request.jobId</code>

**O que faz:** executa a instrução `? request.jobId` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 037
<code>        : null;</code>

**O que faz:** executa a instrução `: null;` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 038
<code>      const tabIdentity = context.tabIdentity;</code>

**O que faz:** captura a API de canonicalização injetada pelo background.

**Como faz:** mantém a dependência explícita no context.

**Por que assim / por que alternativa ingênua é pior:** buscar global diretamente acoplaria a action ao bootstrap e dificultaria teste isolado.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 039
<code>      const canonicalSenderTabId = tabIdentity</code>

**O que faz:** resolve a identidade canônica da aba remetente.

**Como faz:** usa `resolveCanonicalTabId` quando disponível, senão preserva senderTabId.

**Por que assim / por que alternativa ingênua é pior:** isto permite sobreviver a substituição de aba sem abrir claim para aba arbitrária.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 040
<code>        ? await tabIdentity.resolveCanonicalTabId(senderTabId)</code>

**O que faz:** executa a instrução `? await tabIdentity.resolveCanonicalTabId(senderTabId)` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 041
<code>        : senderTabId;</code>

**O que faz:** executa a instrução `: senderTabId;` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 042
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 043
<code>      const directKey = `gemini_job_${canonicalSenderTabId}`;</code>

**O que faz:** constrói a chave durável do job associada ao tabId canônico.

**Como faz:** usa o namespace `gemini_job_<tabId>`.

**Por que assim / por que alternativa ingênua é pior:** lookup direto é a prova de ownership mais forte e evita varrer storage inteiro.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 044
<code>      const directData = await context.storage.get([directKey]);</code>

**O que faz:** lê somente a chave direta do job.

**Como faz:** aguarda storage scoped à chave.

**Por que assim / por que alternativa ingênua é pior:** carregar todo `chrome.storage.local` poderia puxar Base64 e estado volumoso para memória e aumentar superfície de dados.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 045
<code>      const directJob = directData &amp;&amp; directData[directKey];</code>

**O que faz:** extrai o registro da resposta do storage.

**Como faz:** mantém `undefined` quando a chave não existe.

**Por que assim / por que alternativa ingênua é pior:** não inventa fallback ainda; o caminho de alias é deliberadamente separado.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 046
<code>      if (directJob) {</code>

**O que faz:** entra no caminho de claim direto quando a chave canônica existe.

**Como faz:** prioriza ownership por chave antes de consultar índice/aliases.

**Por que assim / por que alternativa ingênua é pior:** isso é mais simples e forte que aceitar qualquer jobId encontrado no índice.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 047
<code>        if (expectedJobId &amp;&amp; directJob.jobId !== expectedJobId) {</code>

**O que faz:** rejeita quando o chamador declara jobId que não corresponde ao job real da própria aba.

**Como faz:** compara estritamente IDs antes de retornar qualquer conteúdo.

**Por que assim / por que alternativa ingênua é pior:** sem essa guarda uma URL/manual tab poderia apresentar jobId antigo/errado e ainda receber o job atual da aba.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 048
<code>          context.log('warn', 'bg', 'TAB_CLAIM_REJECTED', 'Claim rejeitado por jobId divergente', {</code>

**O que faz:** registra rejeição de claim com motivo operacional.

**Como faz:** usa evento estável e apenas IDs necessários nos metadados.

**Por que assim / por que alternativa ingênua é pior:** logs de segurança permitem diagnosticar tentativa legítima após replacement sem expor payload completo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 049
<code>            tabId: canonicalSenderTabId,</code>

**O que faz:** executa a instrução `tabId: canonicalSenderTabId,` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 050
<code>          });</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 051
<code>          return { job: null };</code>

**O que faz:** nega o claim sem lançar exceção.

**Como faz:** retorna contrato normal `job:null`.

**Por que assim / por que alternativa ingênua é pior:** claim inexistente/negado é condição esperada para abas manuais; erro excepcional causaria retries/logs indevidos.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 052
<code>        }</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 053
<code>        context.log('info', 'bg', 'TAB_CLAIM_DIRECT', 'Job reivindicado por chave direta', {</code>

**O que faz:** registra claim direto bem-sucedido.

**Como faz:** inclui tabId e somente prefixo do jobId.

**Por que assim / por que alternativa ingênua é pior:** prefixo é suficiente para correlação diagnóstica e reduz exposição do identificador completo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 054
<code>          tabId: canonicalSenderTabId,</code>

**O que faz:** executa a instrução `tabId: canonicalSenderTabId,` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 055
<code>          jobIdPrefix: String(directJob.jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução `jobIdPrefix: String(directJob.jobId || '').slice(0, 8),` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 056
<code>        });</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 057
<code>        return { job: safeJob(directJob, canonicalSenderTabId) };</code>

**O que faz:** retorna versão sanitizada do job direto.

**Como faz:** passa o tabId canônico para substituir qualquer ID histórico do objeto.

**Por que assim / por que alternativa ingênua é pior:** retornar registro bruto violaria a allowlist comprovada pelo teste.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 058
<code>      }</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 059
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 060
<code>      if (!expectedJobId || !context.state || !Array.isArray(context.state.jobIndex)) {</code>

**O que faz:** bloqueia fallback por índice quando faltam jobId explícito ou índice confiável.

**Como faz:** exige ambos antes de procurar alias.

**Por que assim / por que alternativa ingênua é pior:** fallback mais permissivo poderia deixar aba manual 'descobrir' job apenas por proximidade/estado.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 061
<code>        context.log('info', 'bg', 'TAB_CLAIM_REJECTED', 'Nenhum job elegível para claim', {</code>

**O que faz:** registra rejeição de claim com motivo operacional.

**Como faz:** usa evento estável e apenas IDs necessários nos metadados.

**Por que assim / por que alternativa ingênua é pior:** logs de segurança permitem diagnosticar tentativa legítima após replacement sem expor payload completo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 062
<code>          tabId: canonicalSenderTabId,</code>

**O que faz:** executa a instrução `tabId: canonicalSenderTabId,` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 063
<code>        });</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 064
<code>        return { job: null };</code>

**O que faz:** nega o claim sem lançar exceção.

**Como faz:** retorna contrato normal `job:null`.

**Por que assim / por que alternativa ingênua é pior:** claim inexistente/negado é condição esperada para abas manuais; erro excepcional causaria retries/logs indevidos.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 065
<code>      }</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 066
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 067
<code>      const indexed = context.state.jobIndex.find(entry =&gt;</code>

**O que faz:** procura no índice somente entrada cujo `jobId` é exatamente o esperado.

**Como faz:** usa comparação estrita e não considera URL/prompt/index.

**Por que assim / por que alternativa ingênua é pior:** jobId é o vínculo lógico que permite encontrar o tabId histórico sem diminuir ownership.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 068
<code>        entry &amp;&amp; entry.jobId === expectedJobId</code>

**O que faz:** executa a instrução `entry && entry.jobId === expectedJobId` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 069
<code>      );</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 070
<code>      if (!indexed) return { job: null };</code>

**O que faz:** nega o claim sem lançar exceção.

**Como faz:** retorna contrato normal `job:null`.

**Por que assim / por que alternativa ingênua é pior:** claim inexistente/negado é condição esperada para abas manuais; erro excepcional causaria retries/logs indevidos.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 071
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 072
<code>      const canonicalIndexedTabId = tabIdentity</code>

**O que faz:** resolve também o tabId armazenado no índice para sua identidade canônica.

**Como faz:** aplica a mesma função de canonicalização aos dois lados da comparação.

**Por que assim / por que alternativa ingênua é pior:** comparar sender canônico com ID histórico cru rejeitaria replacements legítimos.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 073
<code>        ? await tabIdentity.resolveCanonicalTabId(indexed.geminiTabId)</code>

**O que faz:** executa a instrução `? await tabIdentity.resolveCanonicalTabId(indexed.geminiTabId)` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 074
<code>        : indexed.geminiTabId;</code>

**O que faz:** executa a instrução `: indexed.geminiTabId;` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 075
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 076
<code>      if (canonicalIndexedTabId !== canonicalSenderTabId) {</code>

**O que faz:** impõe igualdade de ownership entre job indexado e aba remetente após canonicalização.

**Como faz:** usa comparação estrita de IDs.

**Por que assim / por que alternativa ingênua é pior:** jobId sozinho não basta: uma outra aba que conhecesse o ID não deve poder reivindicar o job.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 077
<code>        context.log('warn', 'bg', 'TAB_CLAIM_REJECTED', 'Claim rejeitado por ownership de aba', {</code>

**O que faz:** registra rejeição de claim com motivo operacional.

**Como faz:** usa evento estável e apenas IDs necessários nos metadados.

**Por que assim / por que alternativa ingênua é pior:** logs de segurança permitem diagnosticar tentativa legítima após replacement sem expor payload completo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 078
<code>          tabId: canonicalSenderTabId,</code>

**O que faz:** executa a instrução `tabId: canonicalSenderTabId,` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 079
<code>          indexedTabId: canonicalIndexedTabId,</code>

**O que faz:** inclui no log o tabId canônico esperado para explicar a rejeição.

**Como faz:** não envia essa informação ao caller; fica apenas na telemetria do background.

**Por que assim / por que alternativa ingênua é pior:** expor detalhes de ownership na resposta não é necessário para uma aba rejeitada.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 080
<code>        });</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 081
<code>        return { job: null };</code>

**O que faz:** nega o claim sem lançar exceção.

**Como faz:** retorna contrato normal `job:null`.

**Por que assim / por que alternativa ingênua é pior:** claim inexistente/negado é condição esperada para abas manuais; erro excepcional causaria retries/logs indevidos.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 082
<code>      }</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 083
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 084
<code>      if (tabIdentity &amp;&amp; indexed.geminiTabId !== canonicalSenderTabId) {</code>

**O que faz:** detecta quando o claim legítimo chegou por uma aba substituta.

**Como faz:** só migra depois de jobId e ownership canônico já terem sido validados.

**Por que assim / por que alternativa ingênua é pior:** migrar antes dessas provas permitiria rekey provocado por claimant incorreto.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 085
<code>        await tabIdentity.migrateTabIdentity(indexed.geminiTabId, canonicalSenderTabId, {</code>

**O que faz:** migra storage, índice e aliases do tabId histórico para o canônico.

**Como faz:** passa também `jobId` como restrição de migração.

**Por que assim / por que alternativa ingênua é pior:** copiar apenas a chave do job manualmente deixaria watchdog/índice/outros recursos presos ao ID antigo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

**⚠️ Comentário extra:** esta linha possui lógica defensiva/caminho de borda que não é isoladamente provado por uma assertion específica em todos os estados possíveis.

### Linha 086
<code>          jobId: expectedJobId,</code>

**O que faz:** executa a instrução `jobId: expectedJobId,` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 087
<code>        });</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 088
<code>      }</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 089
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 090
<code>      const migratedKey = `gemini_job_${canonicalSenderTabId}`;</code>

**O que faz:** reconstrói a chave direta já no tabId canônico após migração.

**Como faz:** não reutiliza o objeto `indexed` como se fosse o job completo.

**Por que assim / por que alternativa ingênua é pior:** o índice contém metadados reduzidos; o payload seguro deve vir do registro durável real.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 091
<code>      const migratedData = await context.storage.get([migratedKey]);</code>

**O que faz:** relê o storage depois da migração.

**Como faz:** confirma o efeito durável antes de devolver o job.

**Por que assim / por que alternativa ingênua é pior:** assumir que a migração funcionou sem releitura poderia emitir claim mesmo após falha parcial.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 092
<code>      const migratedJob = migratedData &amp;&amp; migratedData[migratedKey];</code>

**O que faz:** extrai o job da nova chave canônica.

**Como faz:** mantém ausente se a migração não materializou o registro.

**Por que assim / por que alternativa ingênua é pior:** esta é a última barreira antes de liberar dados ao content script.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 093
<code>      if (!migratedJob || migratedJob.jobId !== expectedJobId) return { job: null };</code>

**O que faz:** nega o claim sem lançar exceção.

**Como faz:** retorna contrato normal `job:null`.

**Por que assim / por que alternativa ingênua é pior:** claim inexistente/negado é condição esperada para abas manuais; erro excepcional causaria retries/logs indevidos.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 094
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 095
<code>      context.log('info', 'bg', 'TAB_CLAIM_ALIAS', 'Job reivindicado após resolver alias', {</code>

**O que faz:** registra sucesso pelo caminho de alias/replacement.

**Como faz:** distingue telemetria de claim direto.

**Por que assim / por que alternativa ingênua é pior:** separar eventos ajuda detectar frequência de replacements e regressões de migração.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 096
<code>        tabId: canonicalSenderTabId,</code>

**O que faz:** executa a instrução `tabId: canonicalSenderTabId,` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 097
<code>        jobIdPrefix: expectedJobId.slice(0, 8),</code>

**O que faz:** executa a instrução `jobIdPrefix: expectedJobId.slice(0, 8),` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 098
<code>      });</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 099
<code>      return { job: safeJob(migratedJob, canonicalSenderTabId) };</code>

**O que faz:** retorna o job migrado usando a mesma allowlist do caminho direto.

**Como faz:** normaliza ambos os caminhos num único contrato.

**Por que assim / por que alternativa ingênua é pior:** dois formatos de resposta para direct/alias fariam content_gemini depender do histórico da aba.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 100
<code>    },</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 101
<code>  });</code>

**O que faz:** fecha o escopo sintático aberto nas linhas anteriores.

**Como faz:** preserva fronteiras entre sanitização, descriptor e IIFE.

**Por que assim / por que alternativa ingênua é pior:** mover delimitadores pode colocar validações fora do executor ou expor helpers globalmente.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 102
<code>})(typeof self !== 'undefined' ? self : globalThis);</code>

**O que faz:** executa a instrução `})(typeof self !== 'undefined' ? self : globalThis);` dentro do protocolo de claim.

**Como faz:** usa estado/storage/identidade preparados pelas linhas anteriores.

**Por que assim / por que alternativa ingênua é pior:** a ordem validation→canonicalização→lookup direto→fallback indexado→ownership→migração→releitura é parte da segurança; reordenar pode permitir claim incorreto ou falso negativo.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

### Linha 103
<code>␠ [linha vazia]</code>

**O que faz:** separa duas etapas do protocolo de claim sem efeito de runtime.

**Como faz:** não executa expressão; serve como fronteira visual entre validação, lookup e migração.

**Por que assim / por que alternativa ingênua é pior:** neste fluxo de segurança, separar etapas torna ownership e retornos precoces mais auditáveis.

**Evidência:** ✅ quando coberta pelos cenários diretos acima; onde a linha pertence a um caminho de borda não exercitado, vale o aviso conservador abaixo.

## 5. Invariantes

1. Nunca aceitar tabId fornecido pelo request como prova de ownership.
2. `allowedSources` deve continuar restrito a Gemini enquanto esta action libera dados de job.
3. JobId divergente deve ser rejeitado mesmo se a chave direta da aba existir.
4. Conhecer `jobId` sem possuir o tabId canônico correspondente nunca pode ser suficiente.
5. Migração de alias só pode ocorrer depois de provar jobId + ownership canônico.
6. Após migração, reler storage e revalidar jobId antes de responder.
7. `safeJob` deve permanecer allowlist; nunca trocar por `{...job}`.
8. Campos internos novos não entram automaticamente no contrato externo.
9. Direct claim e alias claim devem devolver o mesmo shape seguro.

## 6. Resultado

- Fonte integral: **SIM**.
- Todas as linhas comentadas: **SIM**.
- Segurança de origem: **PROVADA**.
- Ownership direto e por alias: **PROVADOS**.
- Minimização de dados: **PROVADA explicitamente**.
- Lacunas de borda registradas: **SIM**.
- Arquivo apto a `CONCLUÍDO`: **NÃO — REVISÃO DE QUALIDADE OBRIGATÓRIA**.

**Próximo arquivo após atualização do rastreador:** `extension/background/actions/commit-result.js`.
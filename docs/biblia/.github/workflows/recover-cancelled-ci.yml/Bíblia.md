# Bíblia técnica — .github/workflows/recover-cancelled-ci.yml

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `4809f824f177e93686c11270793eb672aee5952b`  
> **Agente responsável pela auditoria:** AGENTE 4  
> **Tipo:** GitHub Actions workflow / automação operacional de CI  
> **Linhas textuais:** **316**  
> **Posições documentais:** **317**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este workflow é o mecanismo de **reconciliação de runs cancelados** da `MangaTranslator CI`. A CI principal usa `cancel-in-progress` para branches/PRs, então um push novo pode cancelar uma execução antiga. Cancelamento é diferente de falha real: ele pode deixar checks do HEAD de um PR sem uma execução completa. Este arquivo reage quando alguma `MangaTranslator CI` termina com sucesso e procura, em todo o repositório, runs cancelados que ainda correspondem exatamente ao HEAD atual de PRs internos abertos.

O workflow não recompila a extensão por conta própria. Ele atua como controlador do GitHub Actions: enumera PRs/runs via API, seleciona candidatos, revalida o estado, evita concorrência na branch, solicita rerun integral do workflow cancelado, acompanha a nova tentativa e escreve um resumo.

## 2. Relações arquiteturais e dependências

- **Produtor do evento:** `.github/workflows/ci.yml`, cujo `name` é `MangaTranslator CI` e cuja política `cancel-in-progress` vale para refs diferentes de `refs/heads/main`.
- **Runtime:** GitHub Actions em `ubuntu-latest`.
- **Action executora:** `actions/github-script@v7`.
- **APIs GitHub usadas:** Pull Requests `list`, Actions `listWorkflowRuns`, Actions `getWorkflowRun` e endpoint REST de rerun de workflow.
- **Dados lidos:** `workflow_run`, `context.repo`, PRs abertos, head SHA/head branch, status/conclusion/run_attempt/created_at de runs.
- **Dados gravados/efeitos colaterais:** solicita rerun de workflows e escreve logs/Job Summary. Não faz checkout, não modifica arquivos do repositório, não usa storage da extensão e não executa código da branch gatilho.
- **Consumidor humano:** mantenedores que acompanham Actions/checks de PR e o summary da recuperação.

## 3. Fluxo de execução

1. GitHub dispara este workflow quando `MangaTranslator CI` fica `completed`.
2. O job só entra se a conclusão do gatilho for `success`.
3. Antes de qualquer escrita via Actions API, o script rejeita gatilho cujo `head_repository` não seja o próprio repositório.
4. Enumera PRs internos abertos e constrói índice `head SHA -> PR(s)`.
5. Enumera runs cancelados do mesmo workflow e seleciona apenas os criados nos últimos 29 dias cujo SHA ainda é HEAD de PR aberto.
6. Para cada candidato, relê o run para evitar snapshot stale.
7. Recusa branch ausente e adia se houver outro run ainda ativo na mesma branch.
8. Solicita rerun integral e espera, em polling de 15 s, uma tentativa com `run_attempt` maior terminar.
9. Registra success/cancelled/outro resultado e gera tabela de summary.

## 4. Segurança, privilégios e trust boundaries

### 4.1 `workflow_run` é tratado como contexto privilegiado

O arquivo reconhece explicitamente que `workflow_run` pode receber `GITHUB_TOKEN` privilegiado. A defesa concreta é dupla: não existe checkout/execução do código do run gatilho e o script retorna imediatamente se `trigger.head_repository.full_name` não for o repositório atual.

### 4.2 PRs de fork são excluídos de novo

Mesmo depois de validar o gatilho, o mapa de PRs aceita somente `pr.head.repo.full_name === owner/repo`. Isso evita que a seleção de candidatos reintroduza SHAs de forks pela lista de PRs.

### 4.3 Permissões

`actions: write` é necessária para rerun. `pull-requests: read` sustenta a enumeração de PRs. `contents: read` não é usada explicitamente pelo script para ler blobs/checkout; portanto deve ser tratada como permissão a justificar/revalidar, não como requisito comprovado por teste.

### 4.4 Supply chain

`actions/github-script@v7` é fixado por major tag e não por commit SHA. Isso é comum, mas deixa confiança na manutenção desse tag; a Bíblia não considera isso uma prova de imutabilidade.

## 5. Concorrência, idempotência e races

- A chave constante `recover-cancelled-ci-global` serializa execuções deste próprio workflow entre branches.
- `cancel-in-progress: false` preserva o controlador ativo; gatilhos posteriores ficam enfileirados.
- Cada candidato é relido antes do rerun; se já não estiver `completed/cancelled`, é ignorado.
- `run_attempt` anterior é capturado e o polling só aceita `attempt > previousAttempt`, evitando confundir o estado cancelado antigo com a nova tentativa.
- Runs são processados sequencialmente, porque a CI principal cancela execuções concorrentes da mesma ref fora da main.
- A checagem `competingRun` considera qualquer status diferente de `completed`, cobrindo queued/in_progress e outros estados ativos.

### Race residual importante

O conjunto `openHeadShas` é um **snapshot** obtido antes do loop. Durante uma recuperação longa, um PR pode ser fechado ou receber novo push. O script relê o workflow run, mas **não relê o PR nem reconfirma que `candidate.head_sha` ainda é HEAD de PR aberto imediatamente antes do POST**. Assim, existe uma janela em que um candidato inicialmente válido pode deixar de ser necessário e ainda ser reexecutado. O efeito é desperdício/ruído de CI, não execução de código de fork, porque o candidato já foi limitado ao próprio repositório.

## 6. Casos-limite

- `head_repository` ausente: tratado como não confiável e aborta todo o script.
- zero PRs internos abertos: saída antecipada sem consultar cancelados.
- zero candidatos: saída antecipada.
- run ficou não-cancelado entre listagem e processamento: ignorado.
- `head_branch` ausente: ignorado e reportado.
- branch com CI ativa: candidato adiado para reconciliação futura.
- `run_attempt` ausente: fallback para 1.
- rerun não conclui em 30 min: erro bloqueante.
- rerun termina cancelado de novo: warning, sem loop imediato.
- rerun termina failure/timed_out/action_required/outro: tratado como resultado real; não há rerun recursivo.
- múltiplos PRs no mesmo SHA: todos os números são preservados no rótulo.
- mais de 100 PRs/runs: wrappers usam `github.paginate`.

## 7. Análise crítica

1. **Snapshot de PR pode ficar stale:** falta revalidar PR aberto + SHA atual imediatamente antes do rerun.
2. **Limite composto de tempo:** cada candidato pode consumir até 30 min, mas o job inteiro tem 120 min. Quatro candidatos lentos já podem encostar no limite; o quinto não tem garantia de processamento.
3. **Custo de API potencialmente quadrático no volume:** para cada candidato, `listBranchRuns` pagina o histórico da branch. Muitos candidatos podem aumentar chamadas e aproximar secondary rate limits.
4. **Sem backoff/retry para erros transitórios da API:** qualquer 5xx/secondary-rate-limit em list/get/rerun interrompe o job.
5. **Janela entre revalidação e POST:** um rerun manual pode ocorrer depois do `getWorkflowRun` e antes do POST; a serialização global protege apenas instâncias deste workflow, não atores externos.
6. **Resumo incompleto para candidatos que mudaram de estado:** quando o guard das linhas 154–163 usa `continue`, o evento fica nos logs, mas não entra em `results`/summary.
7. **`contents: read` merece revisão:** o script não lê conteúdo do repositório; se a action/runtime não exigir esse escopo, removê-lo reduziria privilégio.
8. **Action por tag major:** `actions/github-script@v7` não está pinada por SHA imutável.
9. **Nenhum teste focal do controlador:** mudanças no JavaScript inline podem quebrar segurança, filtros ou polling sem uma suíte local detectar.

## 8. Evidência automatizada encontrada

| Comportamento | Evidência localizada | Classificação |
|---|---|---|
| `ci.yml` chama-se `MangaTranslator CI` e usa `cancel-in-progress` fora da main | inspeção direta do arquivo consumidor/produtor | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| presença/semântica específica de `recover-cancelled-ci.yml` | o gate estrutural apenas inclui workflows existentes em uma varredura genérica; não exige este arquivo pelo nome nem valida seu controlador | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| rejeição de fork por `head_repository` | somente implementação inline; nenhum mock/assertion localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| exclusão de PRs de fork | somente implementação inline | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| paginação de PRs e runs | somente implementação inline | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| filtro `completed + cancelled + HEAD atual + 29 dias` | somente implementação inline | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| revalidação/idempotência antes do rerun | somente implementação inline | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| adiamento quando existe CI ativa na branch | somente implementação inline; `ci.yml` confirma a motivação arquitetural | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| POST de rerun integral | somente implementação inline | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| polling exige `run_attempt` novo e `completed` | somente implementação inline | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| timeout local de 30 min e global de 120 min | configuração/implementação sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Job Summary | implementação sem mock/snapshot | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

### O que foi procurado

Busca por `recover-cancelled-ci`, pelo nome do workflow, pelo endpoint de rerun, por `rerunCutoff`, `actionlint` e `yamllint` não encontrou suíte que carregue este arquivo nem linter específico de workflows. `verify-ci-contract-selftest.js` trabalha com `ci.yml`, não com este controlador. Portanto a mera existência do workflow no repositório não foi promovida a prova de seus branches internos.

## 9. Lacunas de teste

1. Criar teste do script extraído ou harness de `actions/github-script` que prove rejeição de `head_repository` externo **antes** de qualquer chamada com `actions:write`.
2. Provar que PR de fork é excluído mesmo quando o gatilho é interno.
3. Provar paginação acima de 100 PRs e 100 runs.
4. Usar fake clock para bordas de 29 dias e run fora da janela.
5. Testar matriz de candidatos: status não completed, conclusion não cancelled, SHA não-HEAD, run antigo e candidato válido.
6. Testar ordenação numérica por `run_number`.
7. Simular mudança de estado entre listagem e `getWorkflowRun` e provar que não ocorre POST.
8. Simular `head_branch` ausente.
9. Simular competing run em queued/in_progress e provar defer sem POST.
10. Provar que o próprio candidate.id não é considerado competing run.
11. Mockar o endpoint de rerun e validar método, URL, run_id e API version.
12. Com fake timers, provar que attempt antigo completed não encerra polling e que apenas attempt maior completed encerra.
13. Provar timeout após 30 min.
14. Provar tratamento de success, cancelled e failure sem loop automático em failure.
15. Testar conteúdo do Job Summary e o caso `results.length === 0`.
16. Adicionar `actionlint` ou equivalente para sintaxe/expressões/permissões do workflow.
17. Adicionar teste de race de PR fechado/head alterado durante o loop; idealmente a implementação futura deverá revalidar elegibilidade antes do POST.
18. Testar resposta a rate limit/erro transitório se for adicionada política de retry/backoff.

## 10. Invariantes

1. Nenhuma operação `actions:write` pode ocorrer para gatilho cujo `head_repository` não seja o próprio repositório.
2. PR de fork nunca pode tornar um run elegível para rerun privilegiado.
3. Um run só é candidato se seu `head_sha` ainda estiver associado ao HEAD de PR interno aberto no snapshot de elegibilidade; idealmente isso deve ser revalidado antes da mutação.
4. Runs antigos/obsoletos não devem ser rerodados automaticamente.
5. A recuperação deve permanecer global e serializada enquanto puder atuar em branches distintas.
6. Uma instância nova deste workflow não deve cancelar a instância de recuperação já em andamento.
7. O candidato deve ser relido antes da mutação.
8. Uma branch com outro CI ativo deve causar defer, não rerun imediato.
9. O polling só pode considerar concluída a tentativa nova se `run_attempt` aumentou.
10. Falha real do rerun não deve entrar em loop automático.
11. O workflow não deve fazer checkout nem executar código do run gatilho.
12. `actions:write` não deve ser acompanhado de permissões de escrita adicionais sem necessidade explícita.
13. O endpoint de rerun deve continuar recebendo o `candidate.id` revalidado.
14. Alteração da política `cancel-in-progress` em `ci.yml` exige revisar a motivação e os guards deste arquivo.
15. O SHA desta Bíblia deixa de ser válido se o blob fonte deixar de ser `4809f824f177e93686c11270793eb672aee5952b`.

## 11. Fonte integral

```yaml
name: Recover cancelled MangaTranslator CI

on:
  workflow_run:
    workflows: ["MangaTranslator CI"]
    types: [completed]

# workflow_run can receive a privileged GITHUB_TOKEN. Keep the scope minimal:
# this workflow never checks out or executes code from the triggering branch.
permissions:
  actions: write
  contents: read
  pull-requests: read

# Recovery is global now: any successful MangaTranslator CI can reconcile
# cancelled runs from any branch. Serialize every recovery in one repository-wide
# queue so two successful source runs cannot start competing reruns.
concurrency:
  group: recover-cancelled-ci-global
  cancel-in-progress: false

jobs:
  recover:
    name: Auto-rerun cancelled CI
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    timeout-minutes: 120

    steps:
      - name: Re-run cancelled CI attempts that still affect open PRs
        uses: actions/github-script@v7
        with:
          script: |
            const trigger = context.payload.workflow_run;
            const { owner, repo } = context.repo;
            const fullRepo = `${owner}/${repo}`;
            const sourceWorkflowId = trigger.workflow_id;

            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

            // workflow_run can be privileged. Never let a fork/untrusted repository
            // cause Actions write operations. The recovery itself never checks out
            // or executes code from the triggering branch.
            if (trigger.head_repository?.full_name !== fullRepo) {
              core.notice(
                `Ignorando gatilho vindo de ${trigger.head_repository?.full_name || 'repositório desconhecido'}; ` +
                'o auto-rerun global só aceita CIs originados no próprio repositório.'
              );
              return;
            }

            const listOpenPullRequests = async () => github.paginate(
              github.rest.pulls.list,
              {
                owner,
                repo,
                state: 'open',
                per_page: 100
              }
            );

            const listCancelledRuns = async () => github.paginate(
              github.rest.actions.listWorkflowRuns,
              {
                owner,
                repo,
                workflow_id: sourceWorkflowId,
                status: 'cancelled',
                per_page: 100
              }
            );

            const listBranchRuns = async (branch) => github.paginate(
              github.rest.actions.listWorkflowRuns,
              {
                owner,
                repo,
                workflow_id: sourceWorkflowId,
                branch,
                per_page: 100
              }
            );

            const openPullRequests = await listOpenPullRequests();
            const openHeadShas = new Map();

            for (const pr of openPullRequests) {
              // Only PRs whose head branch lives in this repository are eligible.
              // This keeps the privileged recovery isolated from forks.
              if (pr.head?.repo?.full_name !== fullRepo) continue;

              const list = openHeadShas.get(pr.head.sha) || [];
              list.push({
                number: pr.number,
                branch: pr.head.ref
              });
              openHeadShas.set(pr.head.sha, list);
            }

            if (openHeadShas.size === 0) {
              core.notice('Não há PRs abertos do próprio repositório; nada para recuperar.');
              return;
            }

            // GitHub allows workflow re-runs for up to 30 days.
            // Keep one day of safety margin to avoid boundary/API timing errors.
            const rerunCutoff = Date.now() - (29 * 24 * 60 * 60 * 1000);

            // GLOBAL reconciliation:
            // - scan cancelled runs from the entire MangaTranslator CI workflow;
            // - keep only runs whose SHA is STILL the HEAD of an open PR;
            // - ignore obsolete intermediate commits and old runs.
            //
            // This intentionally does NOT require the cancelled run to belong to
            // the same branch as the successful trigger. Any green CI can clean up
            // relevant cancelled checks anywhere in the repository.
            const cancelledRuns = await listCancelledRuns();
            const candidates = cancelledRuns
              .filter((run) => (
                run.status === 'completed' &&
                run.conclusion === 'cancelled' &&
                openHeadShas.has(run.head_sha) &&
                new Date(run.created_at).getTime() >= rerunCutoff
              ))
              .sort((a, b) => a.run_number - b.run_number);

            if (candidates.length === 0) {
              core.notice(
                `CI #${trigger.run_number} terminou verde, mas não há runs cancelados ` +
                'que ainda correspondam ao HEAD de PRs abertos.'
              );
              return;
            }

            core.info(
              `CI #${trigger.run_number} terminou verde. Varredura global encontrou ` +
              `${candidates.length} run(s) cancelado(s) recuperável(is).`
            );

            const results = [];

            for (const candidate of candidates) {
              const prs = openHeadShas.get(candidate.head_sha) || [];
              const prLabels = prs.map((pr) => `#${pr.number}`).join(', ');

              // Idempotency/race guard: another queued recovery may already have
              // rerun this workflow before this job reached the candidate.
              const current = await github.rest.actions.getWorkflowRun({
                owner,
                repo,
                run_id: candidate.id
              });

              if (
                current.data.status !== 'completed' ||
                current.data.conclusion !== 'cancelled'
              ) {
                core.info(
                  `Run #${candidate.run_number} já mudou para ` +
                  `${current.data.status}/${current.data.conclusion}; ignorando.`
                );
                continue;
              }

              const candidateBranch = current.data.head_branch;

              if (!candidateBranch) {
                core.warning(
                  `Run #${candidate.run_number} não possui head_branch; ` +
                  'não é seguro reexecutá-lo automaticamente.'
                );
                results.push({
                  run: `#${candidate.run_number}`,
                  branch: '-',
                  sha: candidate.head_sha.slice(0, 12),
                  prs: prLabels,
                  result: 'ignorado: branch ausente'
                });
                continue;
              }

              // Avoid immediately re-cancelling the recovery attempt. The source CI
              // uses cancel-in-progress: true, so if the candidate's own branch has
              // any active CI, defer it. Any later successful CI (from any branch)
              // will trigger another global reconciliation.
              const branchRunsNow = await listBranchRuns(candidateBranch);
              const competingRun = branchRunsNow.find((run) => (
                run.id !== candidate.id &&
                run.status !== 'completed'
              ));

              if (competingRun) {
                core.warning(
                  `Adiando #${candidate.run_number}: a branch ${candidateBranch} ` +
                  `possui o run ativo #${competingRun.run_number} (${competingRun.status}).`
                );
                results.push({
                  run: `#${candidate.run_number}`,
                  branch: candidateBranch,
                  sha: candidate.head_sha.slice(0, 12),
                  prs: prLabels,
                  result: `adiado: #${competingRun.run_number} ${competingRun.status}`
                });
                continue;
              }

              const previousAttempt = current.data.run_attempt || 1;

              core.info(
                `Reexecutando globalmente #${candidate.run_number} ` +
                `(id ${candidate.id}, attempt ${previousAttempt}, branch ${candidateBranch}) ` +
                `para SHA ${candidate.head_sha}, visível em PR(s) ${prLabels}.`
              );

              // Full workflow rerun is intentional: a cancelled workflow can contain
              // successful, cancelled and dependency-blocked jobs. Re-running the
              // whole workflow is the reliable way to replace the incomplete attempt.
              await github.request(
                'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun',
                {
                  owner,
                  repo,
                  run_id: candidate.id,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                }
              );

              // Re-run one candidate at a time. The MangaTranslator CI itself still
              // has cancel-in-progress: true; sequential recovery prevents recovery
              // attempts on the same branch from cancelling one another.
              const deadline = Date.now() + (30 * 60 * 1000);
              let finalRun = null;

              while (Date.now() < deadline) {
                await sleep(15000);

                const polled = await github.rest.actions.getWorkflowRun({
                  owner,
                  repo,
                  run_id: candidate.id
                });

                const attempt = polled.data.run_attempt || 1;

                if (
                  attempt > previousAttempt &&
                  polled.data.status === 'completed'
                ) {
                  finalRun = polled.data;
                  break;
                }
              }

              if (!finalRun) {
                throw new Error(
                  `Timeout aguardando o rerun de #${candidate.run_number} ` +
                  `(id ${candidate.id}).`
                );
              }

              const conclusion = finalRun.conclusion || 'unknown';
              const resultText = `attempt ${finalRun.run_attempt}: ${conclusion}`;

              results.push({
                run: `#${candidate.run_number}`,
                branch: candidateBranch,
                sha: candidate.head_sha.slice(0, 12),
                prs: prLabels,
                result: resultText
              });

              if (conclusion === 'success') {
                core.info(
                  `Run #${candidate.run_number} recuperado com sucesso ` +
                  `(attempt ${finalRun.run_attempt}).`
                );
              } else if (conclusion === 'cancelled') {
                core.warning(
                  `O rerun de #${candidate.run_number} foi cancelado novamente. ` +
                  'Qualquer CI verde futuro fará uma nova varredura global.'
                );
              } else {
                core.warning(
                  `O rerun de #${candidate.run_number} terminou em ${conclusion}. ` +
                  'Isso é uma falha/resultado real; o auto-rerun não entra em loop.'
                );
              }
            }

            if (results.length > 0) {
              await core.summary
                .addHeading('Auto-rerun global de CI cancelado')
                .addRaw(
                  `Gatilho: MangaTranslator CI #${trigger.run_number} ` +
                  `(${trigger.head_branch || trigger.head_sha}) terminou com sucesso.\n\n`
                )
                .addTable([
                  [
                    { data: 'Run', header: true },
                    { data: 'Branch', header: true },
                    { data: 'SHA', header: true },
                    { data: 'PR(s)', header: true },
                    { data: 'Resultado', header: true }
                  ],
                  ...results.map((item) => [
                    item.run,
                    item.branch,
                    item.sha,
                    item.prs || '-',
                    item.result
                  ])
                ])
                .write();
            }
```

## 12. Cobertura documental linha a linha

Os blocos abaixo são contíguos, não se sobrepõem e cobrem **todas as linhas 1–316 mais a posição 317 do newline final**. Blocos estruturais inseparáveis são analisados juntos; nenhuma linha foi omitida.

### Linha 1 — Nome do workflow

```yaml
name: Recover cancelled MangaTranslator CI
```

**O que faz:** Declara o nome humano do workflow de recuperação, usado pela interface do GitHub Actions para identificar execuções deste mecanismo.

**Como faz:** É uma chave YAML de topo; o GitHub Actions registra o arquivo como workflow e mostra este texto na UI.

**Por que foi implementado dessa forma:** Um nome explícito separa a recuperação de cancelamentos da CI principal e da publicação.

**Por que uma implementação ingênua seria pior:** Um nome genérico dificultaria distinguir uma execução de recuperação de uma execução normal da CI e complicaria investigação operacional.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado gate que fixe esse nome.

### Linha 2 — Separador visual após o nome

```yaml

```

**O que faz:** Linha vazia sem efeito de runtime.

**Como faz:** Separa visualmente metadados do gatilho YAML.

**Por que foi implementado dessa forma:** Facilita revisão do workflow.

**Por que uma implementação ingênua seria pior:** Compactar não quebraria a execução, mas reduziria legibilidade durante auditoria.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não recebe assertion.

### Linhas 3–6 — Gatilho workflow_run da CI principal

```yaml
on:
  workflow_run:
    workflows: ["MangaTranslator CI"]
    types: [completed]
```

**O que faz:** Faz o workflow ser disparado quando o workflow chamado MangaTranslator CI termina, independentemente da conclusão, deixando o filtro de sucesso para o job.

**Como faz:** Usa on.workflow_run.workflows com o nome exato da CI e types: completed.

**Por que foi implementado dessa forma:** Separar gatilho de conclusão e condição do job permite receber o evento completo e decidir no job se apenas uma CI verde pode iniciar reconciliação.

**Por que uma implementação ingênua seria pior:** Usar push/pull_request diretamente duplicaria a CI e não forneceria naturalmente o workflow_run que contém run_number, workflow_id, head_repository e conclusão do run fonte.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste/gate localizado que valide o acoplamento nominal com name: MangaTranslator CI de ci.yml.

### Linha 7 — Separador antes da política de token

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Delimita o gatilho da explicação de segurança.

**Por que foi implementado dessa forma:** Mantém a política de trust boundary visível junto das permissões.

**Por que uma implementação ingênua seria pior:** Ausência da separação só afetaria revisão humana.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 8–13 — Trust boundary e permissões do GITHUB_TOKEN

```yaml
# workflow_run can receive a privileged GITHUB_TOKEN. Keep the scope minimal:
# this workflow never checks out or executes code from the triggering branch.
permissions:
  actions: write
  contents: read
  pull-requests: read
```

**O que faz:** Documenta o risco de workflow_run privilegiado e limita o token a actions:write, contents:read e pull-requests:read.

**Como faz:** O bloco permissions substitui permissões implícitas por escopos explícitos; actions:write habilita rerun, pull-requests:read permite enumerar PRs e contents:read permanece leitura apenas.

**Por que foi implementado dessa forma:** workflow_run pode operar com token do repositório alvo; por isso o arquivo evita checkout e restringe privilégios antes de processar metadados vindos do run gatilho.

**Por que uma implementação ingênua seria pior:** Confiar nas permissões padrão ou conceder contents:write criaria superfície de escrita desnecessária para um job que só precisa reconciliar Actions.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste que falhe se esses escopos forem ampliados/reduzidos incorretamente.

### Linha 14 — Separador antes da concorrência

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa permissões da política de exclusão global.

**Por que foi implementado dessa forma:** Ajuda revisão das duas barreiras independentes: privilégio e concorrência.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 15–20 — Concorrência global da recuperação

```yaml
# Recovery is global now: any successful MangaTranslator CI can reconcile
# cancelled runs from any branch. Serialize every recovery in one repository-wide
# queue so two successful source runs cannot start competing reruns.
concurrency:
  group: recover-cancelled-ci-global
  cancel-in-progress: false
```

**O que faz:** Serializa todas as execuções deste workflow em uma fila global e impede que um run novo cancele a recuperação já em curso.

**Como faz:** concurrency.group usa uma chave constante e cancel-in-progress: false; qualquer execução deste workflow compete pela mesma chave.

**Por que foi implementado dessa forma:** A recuperação varre candidatos de todo o repositório, portanto serialização por branch seria insuficiente: dois gatilhos verdes de branches diferentes poderiam tentar rerun do mesmo cancelado.

**Por que uma implementação ingênua seria pior:** Usar grupo por branch ou cancel-in-progress: true reintroduziria corrida entre reconciliações e poderia abortar uma recuperação no meio do polling.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte simula duas execuções concorrentes deste workflow.

### Linha 21 — Separador antes de jobs

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Delimita configuração global do grafo de jobs.

**Por que foi implementado dessa forma:** Melhora leitura estrutural do YAML.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 22–27 — Job recover e condição de entrada

```yaml
jobs:
  recover:
    name: Auto-rerun cancelled CI
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    timeout-minutes: 120
```

**O que faz:** Define o único job, executado apenas quando a CI gatilho concluiu com success, em Ubuntu, com limite total de 120 minutos.

**Como faz:** A expressão github.event.workflow_run.conclusion == 'success' é avaliada pelo Actions antes de alocar o runner; timeout-minutes limita toda a execução.

**Por que foi implementado dessa forma:** Exigir um run verde evita que uma CI falha/cancelada dispare ciclos de autorrecuperação e usa uma evidência de saúde do sistema como momento de reconciliação.

**Por que uma implementação ingênua seria pior:** Executar em qualquer conclusão poderia transformar falhas reais em tempestade de reruns; omitir timeout permitiria polling preso consumir runner indefinidamente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do if nem do timeout.

### Linha 28 — Separador antes dos steps

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa metadados do job de seus passos.

**Por que foi implementado dessa forma:** Facilita revisão.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 29–33 — Único step com actions/github-script

```yaml
    steps:
      - name: Re-run cancelled CI attempts that still affect open PRs
        uses: actions/github-script@v7
        with:
          script: |
```

**O que faz:** Executa toda a reconciliação dentro de actions/github-script@v7.

**Como faz:** O step usa a action oficial para disponibilizar context, github/Octokit e core dentro de um script JavaScript inline.

**Por que foi implementado dessa forma:** Centralizar a lógica numa única execução mantém estado local — mapas, lista de candidatos, resultados — sem serialização entre steps.

**Por que uma implementação ingênua seria pior:** Espalhar o fluxo por vários shell steps exigiria persistir estado e aumentaria risco de quoting/JSON incorreto; por outro lado, o script inline grande também dificulta testes unitários.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há actionlint nem teste que carregue/exeecute este script isoladamente.

### Linhas 34–39 — Captura do evento e helper sleep

```yaml
            const trigger = context.payload.workflow_run;
            const { owner, repo } = context.repo;
            const fullRepo = `${owner}/${repo}`;
            const sourceWorkflowId = trigger.workflow_id;

            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
```

**O que faz:** Extrai o workflow_run gatilho, owner/repo, nome completo do repositório, workflow_id fonte e define espera assíncrona.

**Como faz:** context.payload.workflow_run fornece metadados do evento; context.repo deriva owner/repo; template literal forma owner/repo; sleep retorna Promise resolvida após setTimeout.

**Por que foi implementado dessa forma:** O workflow_id garante que consultas posteriores fiquem no mesmo workflow que gerou o evento, e o helper concentra a cadência do polling.

**Por que uma implementação ingênua seria pior:** Hardcode de owner/repo ou ID de workflow quebraria forks/renomes e reutilização; busy-wait no polling desperdiçaria CPU.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma assertion cobre payload ausente, workflow_id inválido ou temporização.

### Linha 40 — Separador antes da barreira contra forks

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Isola a principal validação de confiança do bootstrap.

**Por que foi implementado dessa forma:** Torna a revisão de segurança mais evidente.

**Por que uma implementação ingênua seria pior:** Sem efeito de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 41–50 — Bloqueio explícito de gatilhos de repositório externo

```yaml
            // workflow_run can be privileged. Never let a fork/untrusted repository
            // cause Actions write operations. The recovery itself never checks out
            // or executes code from the triggering branch.
            if (trigger.head_repository?.full_name !== fullRepo) {
              core.notice(
                `Ignorando gatilho vindo de ${trigger.head_repository?.full_name || 'repositório desconhecido'}; ` +
                'o auto-rerun global só aceita CIs originados no próprio repositório.'
              );
              return;
            }
```

**O que faz:** Interrompe o job se head_repository do run gatilho não for exatamente o repositório atual.

**Como faz:** Compara trigger.head_repository?.full_name com owner/repo; optional chaining trata metadado ausente como não confiável; registra notice e retorna antes de qualquer chamada actions:write.

**Por que foi implementado dessa forma:** É a fronteira crítica de segurança: workflow_run pode operar com token privilegiado, então dados de fork não podem dirigir reruns no repositório alvo.

**Por que uma implementação ingênua seria pior:** Aceitar apenas branch/ref sem validar o repositório permitiria colisões de nomes e ampliaria risco de um fork influenciar ações privilegiadas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste adversarial simulando fork, head_repository ausente ou spoofing.

### Linha 51 — Separador antes dos wrappers de API

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa validação de confiança das funções de consulta.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 52–60 — Wrapper para listar PRs abertos

```yaml
            const listOpenPullRequests = async () => github.paginate(
              github.rest.pulls.list,
              {
                owner,
                repo,
                state: 'open',
                per_page: 100
              }
            );
```

**O que faz:** Define função assíncrona que pagina todos os pull requests abertos do repositório.

**Como faz:** github.paginate envolve github.rest.pulls.list com owner, repo, state: open e páginas de 100.

**Por que foi implementado dessa forma:** Paginação evita considerar só a primeira página e perder PRs cujo HEAD ainda precisa de checks recuperados.

**Por que uma implementação ingênua seria pior:** Uma chamada única sem paginação falharia silenciosamente acima do limite da página, deixando cancelamentos sem recuperação.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture com mais de 100 PRs nem mock da paginação.

### Linha 61 — Separador entre wrappers

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa consultas de PRs e runs cancelados.

**Por que foi implementado dessa forma:** Melhora manutenção.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 62–71 — Wrapper para listar runs cancelados

```yaml
            const listCancelledRuns = async () => github.paginate(
              github.rest.actions.listWorkflowRuns,
              {
                owner,
                repo,
                workflow_id: sourceWorkflowId,
                status: 'cancelled',
                per_page: 100
              }
            );
```

**O que faz:** Define consulta paginada de todos os runs cancelados do workflow fonte.

**Como faz:** Chama actions.listWorkflowRuns filtrando workflow_id do gatilho e status: cancelled, com per_page 100.

**Por que foi implementado dessa forma:** Filtrar no servidor reduz volume antes do filtro fino por SHA/idade e mantém o mecanismo ligado ao workflow correto.

**Por que uma implementação ingênua seria pior:** Listar todos os workflows ou todas as conclusões aumentaria custo/API e poderia rerodar checks não relacionados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o filtro e a paginação não são exercitados por teste.

### Linha 72 — Separador entre wrappers

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa consulta global de cancelados da consulta por branch.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 73–82 — Wrapper para listar runs de uma branch

```yaml
            const listBranchRuns = async (branch) => github.paginate(
              github.rest.actions.listWorkflowRuns,
              {
                owner,
                repo,
                workflow_id: sourceWorkflowId,
                branch,
                per_page: 100
              }
            );
```

**O que faz:** Define consulta paginada dos runs do mesmo workflow em uma branch específica.

**Como faz:** Passa branch e workflow_id a actions.listWorkflowRuns.

**Por que foi implementado dessa forma:** Essa visão é usada imediatamente antes do rerun para detectar uma CI ativa que poderia cancelar a tentativa recuperada.

**Por que uma implementação ingênua seria pior:** Ignorar atividade da branch poderia relançar um run enquanto outro está em progresso sob cancel-in-progress: true.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há simulação de branch com run concorrente.

### Linha 83 — Separador antes do snapshot de PRs

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Marca a transição de definição de helpers para execução.

**Por que foi implementado dessa forma:** Melhora legibilidade.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 84–85 — Snapshot de PRs e mapa por SHA

```yaml
            const openPullRequests = await listOpenPullRequests();
            const openHeadShas = new Map();
```

**O que faz:** Busca PRs abertos e prepara Map que indexará PRs elegíveis por head SHA.

**Como faz:** A primeira chamada executa a paginação definida acima; Map permite lookup O(1) durante filtragem dos runs cancelados.

**Por que foi implementado dessa forma:** O SHA, não apenas o nome da branch, identifica exatamente o commit que ainda precisa de check válido.

**Por que uma implementação ingênua seria pior:** Comparar só branch poderia ressuscitar run cancelado de commit obsoleto após novo push.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 86 — Separador antes da construção do mapa

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa inicialização da iteração dos PRs.

**Por que foi implementado dessa forma:** Melhora revisão.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 87–98 — Mapeamento somente de PRs internos por head SHA

```yaml
            for (const pr of openPullRequests) {
              // Only PRs whose head branch lives in this repository are eligible.
              // This keeps the privileged recovery isolated from forks.
              if (pr.head?.repo?.full_name !== fullRepo) continue;

              const list = openHeadShas.get(pr.head.sha) || [];
              list.push({
                number: pr.number,
                branch: pr.head.ref
              });
              openHeadShas.set(pr.head.sha, list);
            }
```

**O que faz:** Percorre os PRs, descarta forks e agrega número/branch de todos os PRs internos que compartilham o mesmo head SHA.

**Como faz:** Valida pr.head.repo.full_name, recupera lista existente ou cria array, adiciona metadados e grava de volta no Map.

**Por que foi implementado dessa forma:** Repetir a barreira contra forks no conjunto de PRs impede que um run de branch externa seja elegível mesmo que o gatilho inicial seja interno; array suporta mais de um PR para o mesmo SHA.

**Por que uma implementação ingênua seria pior:** Guardar um único PR por SHA perderia contexto; aceitar fork ampliaria trust boundary de um workflow com actions:write.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há cobertura de múltiplos PRs por SHA nem PR de fork.

### Linha 99 — Separador antes do fast exit sem PR

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa construção do índice da condição de saída.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 100–103 — Saída quando não há PR interno aberto

```yaml
            if (openHeadShas.size === 0) {
              core.notice('Não há PRs abertos do próprio repositório; nada para recuperar.');
              return;
            }
```

**O que faz:** Encerra cedo quando o mapa de HEADs elegíveis está vazio.

**Como faz:** Checa Map.size, escreve notice e retorna do script.

**Por que foi implementado dessa forma:** Evita chamadas de Actions e qualquer possibilidade de rerun sem consumidor relevante.

**Por que uma implementação ingênua seria pior:** Continuar com conjunto vazio desperdiçaria API/runner e aumentaria ruído operacional.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 104 — Separador antes da janela de elegibilidade

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa fast exit da política temporal.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 105–107 — Cutoff de 29 dias

```yaml
            // GitHub allows workflow re-runs for up to 30 days.
            // Keep one day of safety margin to avoid boundary/API timing errors.
            const rerunCutoff = Date.now() - (29 * 24 * 60 * 60 * 1000);
```

**O que faz:** Calcula limite temporal com um dia de margem em relação à janela comentada de 30 dias para rerun.

**Como faz:** Subtrai 29 dias em milissegundos de Date.now().

**Por que foi implementado dessa forma:** A margem tenta evitar falhas de fronteira por horário/API em runs quase expirados.

**Por que uma implementação ingênua seria pior:** Usar exatamente 30 dias sem margem pode selecionar run que já se tornou inelegível entre seleção e POST; não usar cutoff tenta reruns inevitavelmente rejeitados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fake clock nem caso de fronteira de 29/30 dias.

### Linha 108 — Separador antes da reconciliação global

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa política temporal do algoritmo de seleção.

**Por que foi implementado dessa forma:** Melhora legibilidade.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 109–116 — Contrato comentado da reconciliação global

```yaml
            // GLOBAL reconciliation:
            // - scan cancelled runs from the entire MangaTranslator CI workflow;
            // - keep only runs whose SHA is STILL the HEAD of an open PR;
            // - ignore obsolete intermediate commits and old runs.
            //
            // This intentionally does NOT require the cancelled run to belong to
            // the same branch as the successful trigger. Any green CI can clean up
            // relevant cancelled checks anywhere in the repository.
```

**O que faz:** Explica que a varredura é global, preserva apenas cancelados cujo SHA ainda é HEAD de PR aberto e não exige mesma branch do gatilho verde.

**Como faz:** Comentários descrevem precisamente os predicados implementados no bloco seguinte.

**Por que foi implementado dessa forma:** Registra uma decisão arquitetural não óbvia: qualquer CI verde pode limpar cancelamentos relevantes em outras branches.

**Por que uma implementação ingênua seria pior:** Sem esta explicação, um mantenedor poderia reintroduzir filtro por branch do gatilho e impedir recuperação global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — comentários não são contrato executável.

### Linhas 117–125 — Seleção e ordenação dos candidatos

```yaml
            const cancelledRuns = await listCancelledRuns();
            const candidates = cancelledRuns
              .filter((run) => (
                run.status === 'completed' &&
                run.conclusion === 'cancelled' &&
                openHeadShas.has(run.head_sha) &&
                new Date(run.created_at).getTime() >= rerunCutoff
              ))
              .sort((a, b) => a.run_number - b.run_number);
```

**O que faz:** Lista runs cancelados, mantém apenas completed/cancelled, SHA ainda presente no mapa de PRs e criação dentro do cutoff; depois ordena por run_number crescente.

**Como faz:** Encadeia filter com quatro predicados e sort numérico.

**Por que foi implementado dessa forma:** Os predicados evitam rerun de commit obsoleto/antigo e a ordenação torna processamento determinístico, começando por run_number menor.

**Por que uma implementação ingênua seria pior:** Rerodar todo cancelado criaria trabalho irrelevante e poderia produzir checks para commits que já não são HEAD; sort implícito de strings seria incorreto.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum teste cobre combinação de status, conclusion, SHA, idade e ordenação.

### Linha 126 — Separador antes do fast exit sem candidatos

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa filtragem da saída vazia.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 127–133 — Saída quando nenhum cancelado é recuperável

```yaml
            if (candidates.length === 0) {
              core.notice(
                `CI #${trigger.run_number} terminou verde, mas não há runs cancelados ` +
                'que ainda correspondam ao HEAD de PRs abertos.'
              );
              return;
            }
```

**O que faz:** Registra notice contextualizado pelo run gatilho e encerra sem mutações.

**Como faz:** Testa candidates.length === 0 e retorna.

**Por que foi implementado dessa forma:** Evita entrar em loop/summary quando não há trabalho e fornece diagnóstico explícito.

**Por que uma implementação ingênua seria pior:** Continuar geraria summary vazio e chamadas inúteis.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 134 — Separador antes do log de trabalho

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa saída vazia do caminho com candidatos.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 135–140 — Log inicial e acumulador de resultados

```yaml
            core.info(
              `CI #${trigger.run_number} terminou verde. Varredura global encontrou ` +
              `${candidates.length} run(s) cancelado(s) recuperável(is).`
            );

            const results = [];
```

**O que faz:** Informa quantos candidatos foram encontrados e inicializa o array usado para o resumo final.

**Como faz:** core.info recebe run_number e candidates.length; results começa vazio.

**Por que foi implementado dessa forma:** Facilita auditoria humana e mantém saída estruturada independente dos logs por candidato.

**Por que uma implementação ingênua seria pior:** Sem acumulador, seria necessário escrever summary incrementalmente, tornando falhas parciais mais difíceis de apresentar de forma tabular.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 141 — Separador antes do loop de candidatos

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Marca início do processamento mutável.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 142–144 — Contexto de PR por candidato

```yaml
            for (const candidate of candidates) {
              const prs = openHeadShas.get(candidate.head_sha) || [];
              const prLabels = prs.map((pr) => `#${pr.number}`).join(', ');
```

**O que faz:** Itera candidatos sequencialmente e deriva rótulos de PR para logs/resumo.

**Como faz:** Consulta o Map pelo head_sha e converte números em #N unidos por vírgula.

**Por que foi implementado dessa forma:** Mantém rastreabilidade entre o run reexecutado e PRs que justificam sua recuperação.

**Por que uma implementação ingênua seria pior:** Exibir apenas branch/SHA tornaria investigação mais lenta quando múltiplos PRs compartilham commit.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 145 — Separador antes da revalidação do run

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa contexto do guard de corrida.

**Por que foi implementado dessa forma:** Melhora revisão.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 146–152 — Releitura idempotente do run candidato

```yaml
              // Idempotency/race guard: another queued recovery may already have
              // rerun this workflow before this job reached the candidate.
              const current = await github.rest.actions.getWorkflowRun({
                owner,
                repo,
                run_id: candidate.id
              });
```

**O que faz:** Busca o estado atual do workflow run antes de tentar rerun.

**Como faz:** actions.getWorkflowRun usa candidate.id e retorna current.data.

**Por que foi implementado dessa forma:** A lista de cancelados é um snapshot; outra recuperação/manual pode ter alterado o run antes deste loop chegar nele.

**Por que uma implementação ingênua seria pior:** Confiar apenas no snapshot pode duplicar rerun ou gerar erro de API por estado já alterado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há corrida simulada entre listagem e getWorkflowRun.

### Linha 153 — Separador antes do guard de estado

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa leitura atual da decisão.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 154–163 — Guard de status/conclusão ainda cancelados

```yaml
              if (
                current.data.status !== 'completed' ||
                current.data.conclusion !== 'cancelled'
              ) {
                core.info(
                  `Run #${candidate.run_number} já mudou para ` +
                  `${current.data.status}/${current.data.conclusion}; ignorando.`
                );
                continue;
              }
```

**O que faz:** Ignora candidato que deixou de estar completed/cancelled.

**Como faz:** Compara current.data.status e conclusion; registra o novo par e usa continue.

**Por que foi implementado dessa forma:** Evita operar sobre estado stale e torna a ação parcialmente idempotente diante de outra recuperação.

**Por que uma implementação ingênua seria pior:** Verificar apenas conclusion ou apenas status poderia aceitar transição intermediária inconsistente para rerun.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 164 — Separador antes da branch

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa guard de estado da extração da branch.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 165 — Captura da branch atual do run

```yaml
              const candidateBranch = current.data.head_branch;
```

**O que faz:** Extrai head_branch do payload recém-revalidado.

**Como faz:** Lê current.data.head_branch em vez de reutilizar branch guardada no PR.

**Por que foi implementado dessa forma:** Usa metadado do próprio run que será reexecutado para checar concorrência na branch correta.

**Por que uma implementação ingênua seria pior:** Usar só a branch do PR poderia divergir em estados raros/renomeações e associar o run ao contexto errado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 166 — Separador antes do guard de branch ausente

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa extração da validação.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 167–180 — Branch ausente: recusa segura

```yaml
              if (!candidateBranch) {
                core.warning(
                  `Run #${candidate.run_number} não possui head_branch; ` +
                  'não é seguro reexecutá-lo automaticamente.'
                );
                results.push({
                  run: `#${candidate.run_number}`,
                  branch: '-',
                  sha: candidate.head_sha.slice(0, 12),
                  prs: prLabels,
                  result: 'ignorado: branch ausente'
                });
                continue;
              }
```

**O que faz:** Não reexecuta automaticamente se head_branch estiver ausente; registra warning e uma linha de resultado ignorado.

**Como faz:** Faz guard falsy, grava run, '-', SHA curto, PRs e razão; continue pula a mutação.

**Por que foi implementado dessa forma:** Sem branch não é possível executar a checagem de concorrência que protege contra cancelamento imediato.

**Por que uma implementação ingênua seria pior:** Prosseguir mesmo sem branch contornaria uma pré-condição de segurança operacional e poderia iniciar rerun que será cancelado ou associado incorretamente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 181 — Separador antes da detecção de concorrência

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa validação estrutural do guard de atividade.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 182–190 — Procura de CI ativa na mesma branch

```yaml
              // Avoid immediately re-cancelling the recovery attempt. The source CI
              // uses cancel-in-progress: true, so if the candidate's own branch has
              // any active CI, defer it. Any later successful CI (from any branch)
              // will trigger another global reconciliation.
              const branchRunsNow = await listBranchRuns(candidateBranch);
              const competingRun = branchRunsNow.find((run) => (
                run.id !== candidate.id &&
                run.status !== 'completed'
              ));
```

**O que faz:** Lista runs atuais da branch e encontra qualquer run diferente do candidato cujo status ainda não seja completed.

**Como faz:** Reutiliza listBranchRuns e Array.find com run.id !== candidate.id e run.status !== completed.

**Por que foi implementado dessa forma:** A CI fonte usa cancel-in-progress para branches/PRs; relançar um cancelado enquanto outro run está ativo pode fazer uma tentativa cancelar a outra.

**Por que uma implementação ingênua seria pior:** Checar apenas in_progress e ignorar queued/waiting deixaria estados ativos escaparem; não excluir candidate.id faria o próprio registro bloquear sempre.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há matriz de queued/in_progress/completed.

### Linha 191 — Separador antes do adiamento

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa detecção da ação de defer.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 192–205 — Adia candidato quando existe run concorrente

```yaml
              if (competingRun) {
                core.warning(
                  `Adiando #${candidate.run_number}: a branch ${candidateBranch} ` +
                  `possui o run ativo #${competingRun.run_number} (${competingRun.status}).`
                );
                results.push({
                  run: `#${candidate.run_number}`,
                  branch: candidateBranch,
                  sha: candidate.head_sha.slice(0, 12),
                  prs: prLabels,
                  result: `adiado: #${competingRun.run_number} ${competingRun.status}`
                });
                continue;
              }
```

**O que faz:** Em vez de rerodar, registra warning, adiciona resultado adiado e continua.

**Como faz:** Inclui run concorrente e status no log e no summary.

**Por que foi implementado dessa forma:** Adiar é mais seguro que cancelar o run ativo ou alterar a política da CI; uma CI verde futura dispara nova reconciliação.

**Por que uma implementação ingênua seria pior:** Forçar o rerun nesse momento pode recriar exatamente o cancelamento que o workflow tenta reparar.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 206 — Separador antes do attempt anterior

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa caminho de defer do caminho de rerun.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 207 — Snapshot do run_attempt

```yaml
              const previousAttempt = current.data.run_attempt || 1;
```

**O que faz:** Guarda o número da tentativa atual, usando 1 se a API não o fornecer.

**Como faz:** Lê current.data.run_attempt || 1.

**Por que foi implementado dessa forma:** O polling posterior exige que a nova tentativa tenha número maior; isso diferencia o estado velho de uma conclusão real do rerun.

**Por que uma implementação ingênua seria pior:** Apenas esperar status completed aceitaria imediatamente o registro cancelado antigo, antes de a nova tentativa realmente começar.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 208 — Separador antes do log de rerun

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa metadado de attempt do log/mutação.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 209–213 — Log de intenção de rerun

```yaml
              core.info(
                `Reexecutando globalmente #${candidate.run_number} ` +
                `(id ${candidate.id}, attempt ${previousAttempt}, branch ${candidateBranch}) ` +
                `para SHA ${candidate.head_sha}, visível em PR(s) ${prLabels}.`
              );
```

**O que faz:** Registra run number, id, attempt, branch, SHA e PRs antes da mutação.

**Como faz:** core.info compõe mensagem com todos os identificadores relevantes.

**Por que foi implementado dessa forma:** Cria trilha operacional suficiente para correlacionar o POST seguinte com um candidato concreto.

**Por que uma implementação ingênua seria pior:** Log só com run_number dificultaria investigar SHA/PR e distinguir tentativas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 214 — Separador antes do POST

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa log da mutação privilegiada.

**Por que foi implementado dessa forma:** Destaca a região de maior efeito colateral.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 215–228 — Rerun integral via REST

```yaml
              // Full workflow rerun is intentional: a cancelled workflow can contain
              // successful, cancelled and dependency-blocked jobs. Re-running the
              // whole workflow is the reliable way to replace the incomplete attempt.
              await github.request(
                'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun',
                {
                  owner,
                  repo,
                  run_id: candidate.id,
                  headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                  }
                }
              );
```

**O que faz:** Solicita reexecução do workflow inteiro para o run candidato.

**Como faz:** github.request envia POST ao endpoint de rerun com owner/repo/run_id e fixa X-GitHub-Api-Version 2022-11-28.

**Por que foi implementado dessa forma:** Reexecutar o workflow inteiro recompõe jobs bem-sucedidos, cancelados e bloqueados por dependência num novo attempt, em vez de tentar adivinhar quais jobs faltaram.

**Por que uma implementação ingênua seria pior:** Rerodar apenas jobs falhos não cobre corretamente um workflow cancelado com jobs dependency-blocked; omitir versão da API reduz previsibilidade de contrato.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum mock verifica endpoint, método, headers ou payload.

### Linha 229 — Separador antes do polling

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa mutação do acompanhamento.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 230–234 — Política sequencial e deadline por candidato

```yaml
              // Re-run one candidate at a time. The MangaTranslator CI itself still
              // has cancel-in-progress: true; sequential recovery prevents recovery
              // attempts on the same branch from cancelling one another.
              const deadline = Date.now() + (30 * 60 * 1000);
              let finalRun = null;
```

**O que faz:** Documenta processamento um a um, cria deadline de 30 minutos e inicializa finalRun como null.

**Como faz:** Date.now() + 30 minutos define limite local; finalRun só recebe payload quando nova tentativa termina.

**Por que foi implementado dessa forma:** Sequencialidade reduz chance de reruns da mesma branch se cancelarem mutuamente e torna resultados determinísticos.

**Por que uma implementação ingênua seria pior:** Disparar todos em paralelo conflitaria com cancel-in-progress da CI; não limitar espera poderia prender o job.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — tempo e serialização não têm fake timers/testes.

### Linha 235 — Separador antes do loop de polling

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Delimita configuração do loop.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 236–254 — Polling até nova tentativa concluir

```yaml
              while (Date.now() < deadline) {
                await sleep(15000);

                const polled = await github.rest.actions.getWorkflowRun({
                  owner,
                  repo,
                  run_id: candidate.id
                });

                const attempt = polled.data.run_attempt || 1;

                if (
                  attempt > previousAttempt &&
                  polled.data.status === 'completed'
                ) {
                  finalRun = polled.data;
                  break;
                }
              }
```

**O que faz:** A cada 15 segundos relê o mesmo run; aceita conclusão somente se run_attempt aumentou e status é completed.

**Como faz:** while compara relógio ao deadline, await sleep(15000), chama getWorkflowRun, extrai attempt e, quando os dois predicados passam, salva polled.data e quebra.

**Por que foi implementado dessa forma:** O requisito attempt > previousAttempt evita confundir o estado cancelado anterior com o rerun recém-solicitado.

**Por que uma implementação ingênua seria pior:** Polling sem verificar attempt pode terminar imediatamente com o snapshot antigo; polling agressivo sem sleep desperdiçaria quota de API.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste de transições queued/in_progress/completed nem de incremento de attempt.

### Linha 255 — Separador antes do timeout local

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa loop do tratamento de expiração.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 256–261 — Falha dura após 30 minutos

```yaml
              if (!finalRun) {
                throw new Error(
                  `Timeout aguardando o rerun de #${candidate.run_number} ` +
                  `(id ${candidate.id}).`
                );
              }
```

**O que faz:** Lança erro se nenhuma nova tentativa concluída foi observada até o deadline.

**Como faz:** finalRun permanece null e throw Error inclui run_number e id.

**Por que foi implementado dessa forma:** Falhar o job torna visível que a recuperação não conseguiu confirmar resultado, em vez de reportar sucesso parcial silencioso.

**Por que uma implementação ingênua seria pior:** Apenas warning faria o workflow ficar verde mesmo sem saber se o rerun terminou, mascarando quebra operacional.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fake clock cobrindo timeout.

### Linha 262 — Separador antes do resultado final

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa erro de timeout do caminho de conclusão.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 263–272 — Normalização e armazenamento do resultado

```yaml
              const conclusion = finalRun.conclusion || 'unknown';
              const resultText = `attempt ${finalRun.run_attempt}: ${conclusion}`;

              results.push({
                run: `#${candidate.run_number}`,
                branch: candidateBranch,
                sha: candidate.head_sha.slice(0, 12),
                prs: prLabels,
                result: resultText
              });
```

**O que faz:** Obtém conclusion da nova tentativa, com fallback unknown, cria texto attempt N: conclusion e adiciona linha ao acumulador.

**Como faz:** Usa finalRun.conclusion || unknown e preserva branch/SHA/PRs.

**Por que foi implementado dessa forma:** Mantém summary consistente mesmo se a API retornar conclusão inesperadamente vazia.

**Por que uma implementação ingênua seria pior:** Assumir conclusion sempre presente poderia produzir saída undefined e dificultar diagnóstico.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 273 — Separador antes dos logs por conclusão

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa persistência do resultado da mensagem operacional.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 274–289 — Tratamento de success, novo cancelamento e demais conclusões

```yaml
              if (conclusion === 'success') {
                core.info(
                  `Run #${candidate.run_number} recuperado com sucesso ` +
                  `(attempt ${finalRun.run_attempt}).`
                );
              } else if (conclusion === 'cancelled') {
                core.warning(
                  `O rerun de #${candidate.run_number} foi cancelado novamente. ` +
                  'Qualquer CI verde futuro fará uma nova varredura global.'
                );
              } else {
                core.warning(
                  `O rerun de #${candidate.run_number} terminou em ${conclusion}. ` +
                  'Isso é uma falha/resultado real; o auto-rerun não entra em loop.'
                );
              }
```

**O que faz:** Classifica a conclusão do rerun: success gera info, cancelled gera warning e deixa nova recuperação para um CI verde futuro; qualquer outro resultado é tratado como resultado real sem loop automático.

**Como faz:** Usa if/else if/else e mensagens específicas.

**Por que foi implementado dessa forma:** Não transformar failure em rerun infinito distingue cancelamento operacional de falha legítima de testes/build.

**Por que uma implementação ingênua seria pior:** Rerodar automaticamente qualquer failure poderia criar loop sem fim e apagar sinal de regressão real.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte cobre as três categorias de conclusão.

### Linha 290 — Fechamento do loop de candidatos

```yaml
            }
```

**O que faz:** Encerra o for que processa candidatos sequencialmente.

**Como faz:** Delimitador JavaScript do bloco for.

**Por que foi implementado dessa forma:** Preserva serialização intencional de reruns.

**Por que uma implementação ingênua seria pior:** Mover o processamento para Promise.all alteraria invariantes de concorrência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 291 — Separador antes do summary

```yaml

```

**O que faz:** Linha vazia sem efeito funcional.

**Como faz:** Separa processamento da apresentação final.

**Por que foi implementado dessa forma:** Melhora leitura.

**Por que uma implementação ingênua seria pior:** Sem impacto de runtime.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 292–315 — Resumo tabular no GitHub Actions

```yaml
            if (results.length > 0) {
              await core.summary
                .addHeading('Auto-rerun global de CI cancelado')
                .addRaw(
                  `Gatilho: MangaTranslator CI #${trigger.run_number} ` +
                  `(${trigger.head_branch || trigger.head_sha}) terminou com sucesso.\n\n`
                )
                .addTable([
                  [
                    { data: 'Run', header: true },
                    { data: 'Branch', header: true },
                    { data: 'SHA', header: true },
                    { data: 'PR(s)', header: true },
                    { data: 'Resultado', header: true }
                  ],
                  ...results.map((item) => [
                    item.run,
                    item.branch,
                    item.sha,
                    item.prs || '-',
                    item.result
                  ])
                ])
                .write();
```

**O que faz:** Quando há resultados acumulados, publica summary com cabeçalho, contexto do gatilho e tabela Run/Branch/SHA/PR(s)/Resultado.

**Como faz:** Encadeia core.summary.addHeading, addRaw, addTable e write; mapeia cada item e usa '-' quando não há PRs.

**Por que foi implementado dessa forma:** Concentra decisões de ignorar, adiar e resultado de rerun numa visualização consumível sem abrir logs detalhados.

**Por que uma implementação ingênua seria pior:** Sempre escrever tabela vazia criaria ruído; não escrever summary obrigaria investigação só por logs dispersos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há mock de core.summary nem snapshot da tabela.

### Linha 316 — Fechamento do bloco de summary

```yaml
            }
```

**O que faz:** Fecha o if que condiciona a escrita do summary.

**Como faz:** Delimitador JavaScript final do script inline.

**Por que foi implementado dessa forma:** Mantém a escrita condicionada a results.length > 0.

**Por que uma implementação ingênua seria pior:** Remover/alterar o delimitador quebraria parsing do script/YAML.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o repositório não possui actionlint/yamllint localizado.

### Linha 317 — Newline final

```yaml
␤ [newline final após a linha 316]
```

**O que faz:** Representa a posição de newline final depois da linha textual 316.

**Como faz:** O blob termina com LF, preservando convenção de arquivo texto.

**Por que foi implementado dessa forma:** Evita diffs artificiais e mantém compatibilidade com ferramentas POSIX.

**Por que uma implementação ingênua seria pior:** Arquivo sem newline final normalmente ainda seria aceito pelo Actions, mas gera ruído de diff e ferramentas podem sinalizar.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.


## 13. Autoauditoria mecânica

- Fonte integral extraída desta própria Bíblia e comparada ao blob auditado: **equivalência textual exata confirmada**, incluindo o LF terminal.
- SHA do blob auditado reconfirmado: `4809f824f177e93686c11270793eb672aee5952b`.
- Cobertura estrutural: **70 blocos semânticos** cobrindo posições **1–317 exatamente uma vez**, sem gap e sem overlap.
- Linhas textuais: **316**; posição documental adicional: **317 = newline final**.
- Busca de evidência: nenhum teste específico do controlador, `actionlint` ou `yamllint` foi localizado; nenhuma ocorrência textual foi promovida indevidamente a prova direta.
- Consumers/dependências reconfirmados: `ci.yml` fornece o workflow `MangaTranslator CI` e a política de cancelamento que motiva a recuperação; `actions/github-script@v7` fornece `github`, `context` e `core`.
- Risco residual destacado: snapshot de PR/HEAD pode envelhecer entre seleção e POST, além do limite global de 120 min competir com até 30 min por candidato.

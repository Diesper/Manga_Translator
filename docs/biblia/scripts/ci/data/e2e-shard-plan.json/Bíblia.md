# Bíblia técnica — scripts/ci/data/e2e-shard-plan.json

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `2df6bf7c323d28595d258249a9c6f4bfa25c6b1f`  
> **Agente responsável pela auditoria:** AGENTE 5  
> **Tipo:** dados/configuração JSON canônica de particionamento E2E para CI  
> **Linhas textuais:** **45**  
> **Posições documentais:** **46**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/ci/data/e2e-shard-plan.json` é a fonte de dados que descreve como o inventário Playwright E2E do Manga Translator é dividido em cinco grupos explícitos. Ele não executa testes sozinho: `scripts/ci/run-e2e-group.js` lê o JSON, escolhe um grupo por `id`, passa `tag` a `playwright test --grep` e injeta `workers` em `MANGA_E2E_WORKERS`; `playwright.config.js` transforma essa variável no número de workers usado em CI.

A segunda função do arquivo é atuar como contrato verificável. `scripts/validation/verify-e2e-shard-plan.js` lista o inventário real do Playwright, lista novamente cada grupo por tag, compara `expectedTests`, rejeita testes duplicados entre grupos, rejeita testes sem grupo e exige que a união seja exatamente o inventário completo. `scripts/validation/verify-ci-contract.js` acrescenta um gate estático que exige exatamente os ids, contagens e workers atuais.

Portanto o arquivo fica entre três camadas: **dados do plano → runner de shard → Playwright**, e em paralelo **dados do plano → validadores → CI Gate**.

## 2. Esquema efetivo

| Campo | Papel real | Consumidor | Força do contrato |
|---|---|---|---|
| `version` | versão declarativa do formato | nenhum consumidor semântico localizado | fraco; só parse JSON |
| `groups` | coleção dos shards | runner + dois validadores | forte |
| `id` | chave passada pela matriz CI | `run-e2e-group.js`; CI Contract | forte |
| `tag` | filtro Playwright `--grep` | runner + verificador de plano | forte para cobertura/partição atual |
| `kind` | classificação de custo | apenas verificador exige existência de algum `fast` | fraco/parcial |
| `expectedTests` | cardinalidade esperada por tag | verificador de plano + CI Contract | forte |
| `estimatedSeconds` | benchmark/diagnóstico | somente log do verificador + documentação | informativo |
| `workers` | paralelismo do shard | runner → env → Playwright config; CI Contract | forte |

## 3. Partição atual dos 21 E2E

| Grupo | Tag | Testes esperados | Workers | Origem concreta dos testes |
|---|---|---:|---:|---|
| `fifo` | `@e2e-fifo` | 1 | 1 | FIFO N-lotes A→G em `tests/e2e/translation-flow.spec.js` |
| `attachment` | `@e2e-attachment` | 3 | 3 | loop sobre `regressionScenarios`: temp_chat, minimized_window, background_delete |
| `medium-a` | `@e2e-medium-a` | 4 | 2 | 2 cache/storage + background_delete anti-throttling + submit ignorado |
| `medium-b` | `@e2e-medium-b` | 4 | 2 | 2 cache/storage + fluxo principal + minimized_window anti-throttling |
| `fast` | `@e2e-fast` | 9 | 3 | 3 reader + resposta rápida + shadow DOM + 3 result ownership + aba manual |

A soma é **1 + 3 + 4 + 4 + 9 = 21**, igual a `scripts/ci/data/test-baseline.json#e2e.minTests`. O verificador não confia apenas nessa soma: ele constrói chaves por arquivo/linha/coluna/título/projeto e verifica também interseção vazia e ausência de itens não classificados.

## 4. Fluxo de dados e lifecycle

1. `.github/workflows/ci.yml` cria a matriz `group: [fifo, attachment, medium-a, medium-b, fast]`.
2. Cada job chama `npm run test:e2e:group -- <id>`.
3. `package.json#test:e2e:group` delega a `node scripts/ci/run-e2e-group.js`.
4. O runner carrega este JSON, resolve o objeto pelo `id`, valida `workers`, chama Playwright com `--grep <tag>` e exporta `MANGA_E2E_WORKERS`.
5. `playwright.config.js` usa `MANGA_E2E_WORKERS` quando `CI` está ativo e, em modo shard, produz reporter `blob`.
6. O job agregado executa `npm run test:e2e:plan`, coleta exatamente cinco blob reports e os mescla.
7. `verify-e2e-shard-plan.js` reconstitui o inventário real e prova que os grupos cobrem tudo exatamente uma vez.

Não existe estado persistente, Chrome storage, IPC ou API de usuário neste JSON; seu lifecycle é o da leitura síncrona por processos Node/CI.

## 5. Dependências e consumidores

- `scripts/ci/run-e2e-group.js`: consumidor operacional direto de `groups`, `id`, `tag`, `expectedTests`, `estimatedSeconds` e `workers`; somente `tag` e `workers` alteram de fato a execução, enquanto contagem/tempo entram no log.
- `scripts/validation/verify-e2e-shard-plan.js`: consumidor de validação dinâmica; usa Playwright `--list` para validar o plano contra os testes reais.
- `scripts/validation/verify-ci-contract.js`: consumidor de validação estática; fixa ids, `expectedTests`, `workers`, quantidade de grupos e total igual ao baseline.
- `package.json`: `test:e2e:plan` aponta para o verificador e `test:e2e:group` para o runner; `validate` executa `test:e2e:plan`.
- `.github/workflows/ci.yml`: matriz com os cinco ids, execução por grupo e gate agregado que valida o plano antes de mesclar reports.
- `playwright.config.js`: recebe `MANGA_E2E_WORKERS` e `MANGA_E2E_SHARD`; é o consumidor final do paralelismo configurado aqui.
- `scripts/ci/data/test-baseline.json`: fornece `e2e.minTests = 21`, usado para impedir que a cobertura global seja reduzida e o plano continue aparentemente válido.
- `docs/Documentação.md`: descreve os mesmos cinco grupos e deixa explícito que benchmarks históricos não substituem o JSON/gate atual.

## 6. Evidência automatizada

| Comportamento | Evidência lida | Classificação |
|---|---|---|
| JSON é carregável pelos consumidores | três consumidores fazem `JSON.parse` | 🟨 EXECUTADO INDIRETAMENTE |
| existem exatamente 5 grupos | `verify-ci-contract.js` exige `length === 5` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| ids atuais são fifo/attachment/medium-a/medium-b/fast | mapa esperado do CI Contract + matriz workflow | 🟦 GATE ESTÁTICO ESPECÍFICO |
| cada tag seleciona a cardinalidade declarada | `verify-e2e-shard-plan.js` executa Playwright `--list --grep` | ✅ PROVADO DIRETAMENTE |
| nenhum teste pertence a dois grupos | `union.has(key)` gera falha | ✅ PROVADO DIRETAMENTE |
| nenhum teste fica fora dos grupos | `missing = full.filter(...)` gera falha | ✅ PROVADO DIRETAMENTE |
| união/soma = inventário completo | comparação final `sum`, `union.size`, `full.length` | ✅ PROVADO DIRETAMENTE |
| total não cai abaixo de 21 | baseline `e2e.minTests` é aplicado ao inventário completo | ✅ PROVADO DIRETAMENTE |
| contagens por id atuais são 1/3/4/4/9 | mapa `expected` em CI Contract | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workers por id atuais são 1/3/2/2/3 | mapa `expected` em CI Contract | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workflow não hardcodeia workers numéricos | regex no CI Contract + runner deve conter `String(group.workers)` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workers do plano chegam ao Playwright | runner exporta env e config converte em `workers` | 🟨 EXECUTADO INDIRETAMENTE |
| há ao menos um grupo `kind=fast` | verificador de plano procura `group.kind === 'fast'` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `version: 1` | nenhum check/branch localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `heavy-exclusive`, `heavy`, `medium` | nenhum consumidor operacional localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| tempos 50.5/27.4/41.5/42.1/22.4 | apenas log/documentação | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

### Observação sobre o self-test do CI Contract

`scripts/validation/verify-ci-contract-selftest.js` copia este JSON para o sandbox porque o CI Contract o lê, mas os três casos de mutação atualmente exercitados removem um job, enfraquecem `forbidOnly` e removem um marcador da matriz de regressão. Ele **não** muta este plano para provar que id/contagem/worker incorretos são rejeitados. Assim, o gate estático existe e é específico, mas seu próprio self-test não cobre focalmente essas regras.

## 7. Segurança, privacidade e trust boundaries

Este arquivo não processa URL de usuário, imagens, Gemini, tabs, storage nem conteúdo pessoal. A fronteira de confiança relevante é **repositório → CI**: qualquer alteração no JSON muda quais testes são selecionados e quanto paralelismo o Playwright recebe.

- Uma `tag` maliciosa ou errada poderia selecionar menos testes; a união exata e o baseline reduzem esse risco.
- Um `workers` exagerado poderia aumentar consumo de CPU/memória e flakiness; o CI Contract fixa os valores atuais.
- `estimatedSeconds` não é confiável como política de segurança/desempenho porque não é validado.
- `kind` não deve ser interpretado por ferramentas externas como autoridade de scheduling enquanto não houver contrato explícito.
- `version` hoje é declarativo; consumidores não devem assumir que um incremento causará migração automática.

## 8. Casos-limite e falhas

1. JSON inválido: todos os consumidores que usam `JSON.parse` falham antes do gate útil.
2. `groups` ausente/não-array: CI Contract/verificador rejeitam.
3. menos de cinco grupos: verificador rejeita; quantidade diferente de cinco: CI Contract rejeita.
4. id vazio/tag vazia/expectedTests não inteiro positivo/workers não inteiro positivo: verificador rejeita.
5. ids ou tags duplicadas: verificador rejeita.
6. tag sem `@`: verificador rejeita.
7. teste listado em mais de um grupo: verificador rejeita na construção da união.
8. teste sem grupo: verificador imprime os ausentes e falha.
9. grupo aponta para zero testes: falha porque `expectedTests > 0` e a contagem real precisa coincidir.
10. `estimatedSeconds` negativo/NaN-like não é protegido pelo schema atual se continuar JSON válido.
11. `version` removida ou alterada não é detectada por regra específica.
12. trocar `kind` entre grupos pode passar, desde que algum grupo continue `fast`.
13. trocar tags entre `medium-a` e `medium-b` pode manter cardinalidade/união e não ser distinguido semanticamente pelo gate, porque ambos têm 4 testes e 2 workers.

## 9. Análise crítica

1. **`version` é decorativo hoje.** Há custo de manutenção sem enforcement; se ele pretende suportar migração, deveria existir validação explícita.
2. **`kind` mistura documentação e aparente contrato.** Só a existência de algum `fast` é verificada; `heavy-exclusive`, `heavy` e `medium` não produzem comportamento. Um leitor pode superestimar o campo.
3. **`estimatedSeconds` pode envelhecer silenciosamente.** A documentação canônica já ressalta que benchmarks antigos não são contrato. O campo serve para observabilidade humana, não scheduling automático.
4. **Há duplicação intencional de ids/contagens/workers no CI Contract.** Ela fortalece regressão estática, mas exige atualizar JSON e mapa esperado juntos quando o plano mudar.
5. **A matriz do workflow duplica os ids.** O CI Contract protege presença dos cinco nomes, mas adicionar/remover grupo exige alteração coordenada em JSON, workflow, validador estático e possivelmente documentação.
6. **Tags medium-a/medium-b têm mesma cardinalidade e workers.** Uma troca semântica entre elas poderia preservar todos os gates quantitativos; falta uma expectativa de mapeamento tag↔id.
7. **O self-test do CI Contract não muta o plano.** Uma regressão no próprio bloco de validação de shards poderia passar se outros checks não a detectarem.
8. **O valor `expectedTests` é excelente como sentinela**, pois é validado tanto contra mapa estático quanto contra inventário Playwright real; isso evita a falsa segurança de simplesmente somar constantes.

## 10. Invariantes

1. O plano deve continuar JSON válido e parseável por Node sem preprocessamento.
2. `groups` deve conter exatamente os cinco grupos enquanto o workflow atual depender de cinco blob reports.
3. Cada `id` deve ser único e deve corresponder a um valor aceito pela matriz CI.
4. Cada `tag` deve ser única, começar com `@` e selecionar ao menos um teste real.
5. A união das tags deve ser exatamente o inventário Playwright E2E; nenhuma omissão e nenhuma duplicação.
6. A soma de `expectedTests` deve continuar igual ao baseline E2E atual e cada valor deve bater com a listagem real.
7. `workers` deve ser inteiro positivo e permanecer fonte única de verdade; o workflow não deve voltar a hardcode numérico.
8. O shard FIFO deve permanecer com paralelismo controlado enquanto o cenário continuar pesado/ordenado.
9. O plano deve preservar ao menos um grupo dedicado a rápidos enquanto o verificador exigir essa propriedade.
10. `estimatedSeconds` não deve virar timeout funcional sem medição/contrato novo.
11. Mudança de `version` deve ser acompanhada de consumidor/validador explícito; hoje não há semântica de migração.
12. Qualquer mudança de partição deve atualizar conscientemente JSON, testes/tags, workflow, CI Contract e documentação canônica.
13. O SHA desta Bíblia só é válido enquanto o fonte permanecer `2df6bf7c323d28595d258249a9c6f4bfa25c6b1f`.

## 11. Lacunas de teste

1. **Versão do schema:** falta teste/gate exigindo `version === 1` ou uma estratégia explícita para versões futuras. Regressão possível: campo muda e consumidores ignoram silenciosamente.
2. **Kinds exatos por id:** falta validação de `fifo=heavy-exclusive`, `attachment=heavy`, `medium-a/b=medium`, `fast=fast`. Regressão possível: metadado mente e documentação/automação futura toma decisão errada.
3. **Tempos estimados:** falta ao menos validação de número finito positivo; se os valores forem só documentação, isso deveria ser declarado no schema/README. Regressão possível: valor negativo/string enganosa nos logs.
4. **Mapeamento tag↔id:** falta expectativa explícita das tags canônicas por id. Regressão possível: medium-a e medium-b trocados continuam com 4 testes/2 workers e podem passar.
5. **Propagação de workers end-to-end:** há gate estático e caminho de execução, mas falta teste que intercepte a invocação Playwright/config e prove o worker efetivo para cada id.
6. **Self-test do CI Contract para o plano:** falta sandbox mutation de `expectedTests`, `workers`, grupo ausente/extra e id inesperado para provar que o próprio gate não foi enfraquecido.
7. **Drift de performance:** nenhuma medição automatizada atualiza/valida `estimatedSeconds`; regressão possível é o balanceamento ficar obsoleto sem alarme.

## 12. Fonte integral

```json
{
  "version": 1,
  "groups": [
    {
      "id": "fifo",
      "tag": "@e2e-fifo",
      "kind": "heavy-exclusive",
      "expectedTests": 1,
      "estimatedSeconds": 50.5,
      "workers": 1
    },
    {
      "id": "attachment",
      "tag": "@e2e-attachment",
      "kind": "heavy",
      "expectedTests": 3,
      "estimatedSeconds": 27.4,
      "workers": 3
    },
    {
      "id": "medium-a",
      "tag": "@e2e-medium-a",
      "kind": "medium",
      "expectedTests": 4,
      "estimatedSeconds": 41.5,
      "workers": 2
    },
    {
      "id": "medium-b",
      "tag": "@e2e-medium-b",
      "kind": "medium",
      "expectedTests": 4,
      "estimatedSeconds": 42.1,
      "workers": 2
    },
    {
      "id": "fast",
      "tag": "@e2e-fast",
      "kind": "fast",
      "expectedTests": 10,
      "estimatedSeconds": 22.4,
      "workers": 3
    }
  ]
}
```

## 13. Cobertura integral por posições — revisão atual

- **1–3:** schema do plano e abertura da lista de grupos.
- **4–11:** shard `fifo` exclusivo.
- **12–19:** shard `attachment`.
- **20–27:** shard `medium-a`.
- **28–35:** shard `medium-b`.
- **36–43:** shard `fast`, com `expectedTests: 10` alinhado à descoberta atual.
- **44–45:** fechamento da lista e do JSON.
- **46:** newline terminal.

**Cobertura:** **46/46 posições**, contíguas, sem gap ou overlap.

**Revisão 2026-10-02:** o plano protege agora 10 testes `@e2e-fast`; a aprovação anterior fica invalidada até nova auditoria.

## 14. Verificação final desta Bíblia

- Fonte integral reproduzida sem omissões: **sim**.
- 45 linhas textuais + newline final documentados individualmente: **sim**.
- Consumers operacionais lidos: **sim** (`run-e2e-group.js`, `playwright.config.js`, workflow e package scripts).
- Validadores reais lidos: **sim** (`verify-e2e-shard-plan.js`, `verify-ci-contract.js`, self-test do CI Contract).
- Testes E2E reais/tagging conferidos nos três specs: **sim**.
- Prova direta diferenciada de gate estático/execução indireta/lacuna: **sim**.
- Lacunas e riscos registrados sem alterar código funcional: **sim**.
- SHA do fonte no momento desta materialização: `2df6bf7c323d28595d258249a9c6f4bfa25c6b1f`.

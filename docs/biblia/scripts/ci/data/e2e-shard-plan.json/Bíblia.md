# Bíblia técnica — scripts/ci/data/e2e-shard-plan.json

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `22e8c20df9f42c0163a2d83c4e7b6f2d31f0dabc`  
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
13. O SHA desta Bíblia só é válido enquanto o fonte permanecer `22e8c20df9f42c0163a2d83c4e7b6f2d31f0dabc`.

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
      "expectedTests": 9,
      "estimatedSeconds": 22.4,
      "workers": 3
    }
  ]
}
```

## 13. Cobertura linha a linha

### Linha/posição 1

**Fonte:** `{`

**O que faz:** abre o objeto JSON raiz do plano canônico de shards E2E.

**Como faz:** o parser JSON dos consumidores exige um objeto raiz bem-formado.

**Por que foi implementado dessa forma:** manter um único objeto raiz permite versionar o esquema e agrupar os shards sem arquivos paralelos.

**Por que uma implementação ingênua seria pior:** JSON truncado/fragmentado impediria o parser de carregar todo o plano.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: `run-e2e-group.js`, `verify-e2e-shard-plan.js` e `verify-ci-contract.js` fazem `JSON.parse` deste arquivo.

### Linha/posição 2

**Fonte:** `  "version": 1,`

**O que faz:** declara `version: 1`, identificador de versão do formato de dados.

**Como faz:** é um campo numérico do objeto raiz.

**Por que foi implementado dessa forma:** preserva espaço explícito para evolução futura do esquema.

**Por que uma implementação ingênua seria pior:** sem versão, futuras migrações podem depender apenas de inferência estrutural; porém hoje o campo ainda não participa de dispatch.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: nenhum consumidor localizado valida ou ramifica por `version`; mudar/remover o valor pode escapar enquanto o JSON restante continuar válido.

### Linha/posição 3

**Fonte:** `  "groups": [`

**O que faz:** abre o array `groups`, coleção ordenada dos grupos E2E.

**Como faz:** os runners iteram `plan.groups`; o CI Contract exige exatamente cinco grupos.

**Por que foi implementado dessa forma:** centraliza a partição de execução em uma coleção machine-readable.

**Por que uma implementação ingênua seria pior:** espalhar grupos entre workflow, scripts e comandos manuais favoreceria drift e omissão.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` exige `Array.isArray(e2ePlan.groups)` e `length === 5`; `verify-e2e-shard-plan.js` também exige array com pelo menos cinco.

### Linha/posição 4

**Fonte:** `    {`

**O que faz:** abre o objeto do grupo `fifo`.

**Como faz:** os campos seguintes pertencem à mesma unidade de agendamento.

**Por que foi implementado dessa forma:** mantém id, tag, classificação, contagem, tempo estimado e workers atomicamente associados.

**Por que uma implementação ingênua seria pior:** campos soltos poderiam ser combinados ao shard errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela iteração de `plan.groups` nos runners.

### Linha/posição 5

**Fonte:** `      "id": "fifo",`

**O que faz:** define o id estável `fifo`.

**Como faz:** `run-e2e-group.js` seleciona o objeto comparando `item.id === groupId`; a matriz CI chama esse id.

**Por que foi implementado dessa forma:** o id desacopla o nome de matriz da expressão Playwright `tag`.

**Por que uma implementação ingênua seria pior:** usar a tag diretamente como argumento de CI acoplaria workflow e sintaxe de seleção.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` espera explicitamente os ids `fifo`, `attachment`, `medium-a`, `medium-b`, `fast`.

### Linha/posição 6

**Fonte:** `      "tag": "@e2e-fifo",`

**O que faz:** associa `fifo` à tag Playwright `@e2e-fifo`.

**Como faz:** o runner passa `--grep group.tag`; o verificador lista Playwright com a mesma tag.

**Por que foi implementado dessa forma:** faz a ponte entre unidade de CI e teste real de FIFO multi-lote.

**Por que uma implementação ingênua seria pior:** usar regex ampla/nome textual do teste seria frágil a renomeações e poderia capturar cenários indevidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE quanto à seleção atual: `verify-e2e-shard-plan.js` roda `playwright test --list --reporter=json --grep @e2e-fifo` e exige exatamente 1 teste, sem omissão/duplicação global.

### Linha/posição 7

**Fonte:** `      "kind": "heavy-exclusive",`

**O que faz:** classifica `fifo` como `heavy-exclusive`.

**Como faz:** o valor é metadado descritivo; nenhum scheduler localizado o usa para exclusividade.

**Por que foi implementado dessa forma:** documenta a razão operacional para manter esse cenário isolado com um worker.

**Por que uma implementação ingênua seria pior:** sem metadado, a intenção de isolar o teste pesado ficaria apenas implícita no número de workers.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: busca no repositório encontrou `heavy-exclusive` apenas neste JSON; o valor não governa o runner.

### Linha/posição 8

**Fonte:** `      "expectedTests": 1,`

**O que faz:** fixa `expectedTests` do FIFO em 1.

**Como faz:** o verificador compara o número real retornado por `--grep` ao valor e o CI Contract compara ao mapa esperado.

**Por que foi implementado dessa forma:** transforma perda/duplicação de teste em falha imediata de validação.

**Por que uma implementação ingênua seria pior:** aceitar qualquer contagem permitiria um shard vazio ou crescente silenciosamente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: inventário real filtrado deve ter 1; 🟦 adicional: CI Contract exige `tests: 1` para `fifo`.

### Linha/posição 9

**Fonte:** `      "estimatedSeconds": 50.5,`

**O que faz:** registra `estimatedSeconds` do FIFO como 50.5 s.

**Como faz:** o valor é apenas impresso por `verify-e2e-shard-plan.js`; não controla timeout nem scheduling.

**Por que foi implementado dessa forma:** preserva a referência de balanceamento usada para explicar por que FIFO ficou isolado.

**Por que uma implementação ingênua seria pior:** usar esse número como timeout rígido criaria flakiness conforme hardware/CI varia.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: não há validação de tipo, faixa, atualidade ou uso operacional do valor.

### Linha/posição 10

**Fonte:** `      "workers": 1`

**O que faz:** define `workers` do FIFO como 1.

**Como faz:** `run-e2e-group.js` valida inteiro positivo, exporta `MANGA_E2E_WORKERS=1` e `playwright.config.js` converte a variável em `workers` no CI.

**Por que foi implementado dessa forma:** evita concorrência interna no cenário FIFO pesado/exclusivo.

**Por que uma implementação ingênua seria pior:** hardcode no workflow duplicaria a fonte de verdade e poderia divergir deste plano.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige 1 para `fifo` e proíbe worker numérico hardcoded no workflow; 🟨 EXECUTADO INDIRETAMENTE pelo runner/config Playwright.

### Linha/posição 11

**Fonte:** `    },`

**O que faz:** fecha o objeto `fifo` e mantém vírgula para o próximo grupo.

**Como faz:** preserva a sintaxe do array JSON e encerra a associação dos seis campos do FIFO.

**Por que foi implementado dessa forma:** torna cada shard um registro independente.

**Por que uma implementação ingênua seria pior:** vírgula ausente quebraria parsing; fechamento deslocado associaria campos ao objeto errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo `JSON.parse` dos consumidores.

### Linha/posição 12

**Fonte:** `    {`

**O que faz:** abre o objeto do grupo `attachment`.

**Como faz:** inicia o segundo registro de shard.

**Por que foi implementado dessa forma:** separa o gate de anexos dos demais fluxos para paralelismo próprio.

**Por que uma implementação ingênua seria pior:** misturar campos de grupos impediria atribuir workers/contagem por categoria.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela iteração de `plan.groups`.

### Linha/posição 13

**Fonte:** `      "id": "attachment",`

**O que faz:** define id `attachment`.

**Como faz:** é o valor recebido da matriz CI e procurado em `plan.groups`.

**Por que foi implementado dessa forma:** oferece chave curta e estável para o shard de falhas de attachment.

**Por que uma implementação ingênua seria pior:** usar posição do array (`groups[1]`) tornaria reordenação perigosa.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige este id entre exatamente cinco grupos.

### Linha/posição 14

**Fonte:** `      "tag": "@e2e-attachment",`

**O que faz:** associa a tag `@e2e-attachment`.

**Como faz:** Playwright `--grep` seleciona os três cenários gerados pelo loop `regressionScenarios`.

**Por que foi implementado dessa forma:** mantém juntos `temp_chat`, `minimized_window` e `background_delete` para o mesmo contrato de attachment.

**Por que uma implementação ingênua seria pior:** selecionar por título seria sensível ao texto interpolado de cada cenário.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: o verificador lista por essa tag e exige 3 testes, além de impedir overlap/missing.

### Linha/posição 15

**Fonte:** `      "kind": "heavy",`

**O que faz:** classifica o grupo como `heavy`.

**Como faz:** é rótulo informativo; não altera o comando nem os workers por si só.

**Por que foi implementado dessa forma:** explicita que são cenários mais caros sem exigir exclusividade total.

**Por que uma implementação ingênua seria pior:** tratar `kind` como scheduler sem implementação daria falsa sensação de controle.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: `heavy` não aparece em consumidor operacional.

### Linha/posição 16

**Fonte:** `      "expectedTests": 3,`

**O que faz:** fixa `expectedTests` em 3.

**Como faz:** deve corresponder às três materializações do loop de `regressionScenarios`.

**Por que foi implementado dessa forma:** protege contra perder um dos três modos de execução do gate de attachment.

**Por que uma implementação ingênua seria pior:** contar só a ocorrência textual do `test()` daria falso 1 porque o loop gera três testes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: `verify-e2e-shard-plan.js` usa o inventário Playwright real e exige `keys.length === 3`; CI Contract também exige 3.

### Linha/posição 17

**Fonte:** `      "estimatedSeconds": 27.4,`

**O que faz:** registra estimativa de 27.4 s.

**Como faz:** é exibida no log do verificador como informação de balanceamento.

**Por que foi implementado dessa forma:** ajuda operadores a entender custo relativo sem transformar benchmark em SLA.

**Por que uma implementação ingênua seria pior:** timeout baseado no benchmark envelheceria mal e mascararia diferenças de ambiente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: valor não é comparado por gate.

### Linha/posição 18

**Fonte:** `      "workers": 3`

**O que faz:** define 3 workers para `attachment`.

**Como faz:** o runner exporta o valor e Playwright usa `workers` em CI.

**Por que foi implementado dessa forma:** permite executar os três cenários independentes em paralelo.

**Por que uma implementação ingênua seria pior:** um worker único prolongaria desnecessariamente o shard; workers excessivos desperdiçariam recursos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige 3; 🟨 EXECUTADO INDIRETAMENTE pelo runner e `playwright.config.js`.

### Linha/posição 19

**Fonte:** `    },`

**O que faz:** fecha o grupo `attachment`.

**Como faz:** delimita seu registro antes de `medium-a`.

**Por que foi implementado dessa forma:** mantém leitura e validação por objeto.

**Por que uma implementação ingênua seria pior:** estrutura mal fechada quebra JSON e invalida todo gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo parser JSON.

### Linha/posição 20

**Fonte:** `    {`

**O que faz:** abre o grupo `medium-a`.

**Como faz:** inicia o terceiro registro da partição.

**Por que foi implementado dessa forma:** mantém um bucket médio separado para balancear aproximadamente metade dos cenários de custo intermediário.

**Por que uma implementação ingênua seria pior:** um único bucket médio reduziria paralelismo entre jobs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela iteração do plano.

### Linha/posição 21

**Fonte:** `      "id": "medium-a",`

**O que faz:** define id `medium-a`.

**Como faz:** a matriz CI invoca esse id; o runner encontra seu objeto.

**Por que foi implementado dessa forma:** diferencia dois shards médios com mesma quantidade de workers/testes.

**Por que uma implementação ingênua seria pior:** id posicional ou genérico impossibilitaria seleção explícita pela matriz.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige `medium-a`.

### Linha/posição 22

**Fonte:** `      "tag": "@e2e-medium-a",`

**O que faz:** associa `@e2e-medium-a`.

**Como faz:** seleciona dois testes de cache/storage, o cenário `background_delete` do loop de modos e o teste de submit ignorado.

**Por que foi implementado dessa forma:** forma um conjunto real de 4 testes com custo intermediário.

**Por que uma implementação ingênua seria pior:** tag ampla por arquivo poderia concentrar carga e violar balanceamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE quanto à partição atual: o verificador executa `--list --grep` e exige 4; não existe gate separado que fixe semanticamente quais quatro além da união exata.

### Linha/posição 23

**Fonte:** `      "kind": "medium",`

**O que faz:** classifica `medium-a` como `medium`.

**Como faz:** serve como metadado humano de classe de custo.

**Por que foi implementado dessa forma:** documenta a intenção de balanceamento comum aos dois shards médios.

**Por que uma implementação ingênua seria pior:** inferir classe apenas pelo nome `medium-a` duplicaria semântica implícita.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: `kind: medium` não é consumido.

### Linha/posição 24

**Fonte:** `      "expectedTests": 4,`

**O que faz:** fixa contagem esperada 4.

**Como faz:** é comparada ao inventário Playwright e ao mapa estático do CI Contract.

**Por que foi implementado dessa forma:** detecta perda/ganho silencioso de casos na tag.

**Por que uma implementação ingênua seria pior:** deixar contagem dinâmica sem baseline permitiria cobertura cair e ainda validar a união reduzida.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: o verificador exige 4 e a baseline global exige ao menos 21; 🟦 CI Contract fixa 4 para `medium-a`.

### Linha/posição 25

**Fonte:** `      "estimatedSeconds": 41.5,`

**O que faz:** registra estimativa 41.5 s.

**Como faz:** aparece apenas em logs de diagnóstico.

**Por que foi implementado dessa forma:** documenta custo relativo usado no balanceamento histórico.

**Por que uma implementação ingênua seria pior:** usar como critério automático sem medição contínua causaria decisões stale.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 26

**Fonte:** `      "workers": 2`

**O que faz:** define 2 workers para `medium-a`.

**Como faz:** é propagado pelo runner à configuração Playwright.

**Por que foi implementado dessa forma:** limita paralelismo do bucket médio a dois processos.

**Por que uma implementação ingênua seria pior:** 3+ workers poderiam aumentar contenção sem benefício; 1 reduziria throughput.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige 2; 🟨 EXECUTADO INDIRETAMENTE no fluxo do shard.

### Linha/posição 27

**Fonte:** `    },`

**O que faz:** fecha `medium-a`.

**Como faz:** encerra o terceiro registro.

**Por que foi implementado dessa forma:** preserva separação do próximo bucket.

**Por que uma implementação ingênua seria pior:** fechamento incorreto invalidaria ou fundiria objetos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo parser.

### Linha/posição 28

**Fonte:** `    {`

**O que faz:** abre o grupo `medium-b`.

**Como faz:** inicia o quarto registro.

**Por que foi implementado dessa forma:** cria segundo bucket médio para execução paralela em job separado.

**Por que uma implementação ingênua seria pior:** sem divisão A/B quatro+quatro testes disputariam o mesmo job.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 29

**Fonte:** `      "id": "medium-b",`

**O que faz:** define id `medium-b`.

**Como faz:** é chave de seleção da matriz/runner.

**Por que foi implementado dessa forma:** mantém o segundo bucket médio explicitamente endereçável.

**Por que uma implementação ingênua seria pior:** usar só `kind=medium` deixaria dois grupos indistinguíveis.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige `medium-b`.

### Linha/posição 30

**Fonte:** `      "tag": "@e2e-medium-b",`

**O que faz:** associa `@e2e-medium-b`.

**Como faz:** seleciona o fluxo E2E principal, o cenário `minimized_window` e dois testes cache/storage.

**Por que foi implementado dessa forma:** produz outro bucket de 4 testes para balanceamento.

**Por que uma implementação ingênua seria pior:** seleção por arquivo inteiro misturaria cenários rápidos/pesados.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE quanto à partição atual: `--list --grep` deve retornar 4 e a união deve permanecer exata.

### Linha/posição 31

**Fonte:** `      "kind": "medium",`

**O que faz:** classifica `medium-b` como `medium`.

**Como faz:** é metadado humano, simétrico a `medium-a`.

**Por que foi implementado dessa forma:** torna a classe de custo explícita mesmo que o id mude no futuro.

**Por que uma implementação ingênua seria pior:** depender apenas do prefixo do id é uma convenção não validada.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: nenhum consumidor usa este valor.

### Linha/posição 32

**Fonte:** `      "expectedTests": 4,`

**O que faz:** fixa contagem esperada 4.

**Como faz:** protege o bucket contra drift de quantidade.

**Por que foi implementado dessa forma:** fecha o orçamento total 1+3+4+4+9=21.

**Por que uma implementação ingênua seria pior:** sem expectativa por grupo, um teste poderia migrar/duplicar sem sinal local.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo verificador e 🟦 por mapa estático do CI Contract.

### Linha/posição 33

**Fonte:** `      "estimatedSeconds": 42.1,`

**O que faz:** registra estimativa 42.1 s.

**Como faz:** é impressa no resumo do plano.

**Por que foi implementado dessa forma:** mostra que A/B foram balanceados para duração semelhante.

**Por que uma implementação ingênua seria pior:** transformar o valor em obrigação rígida seria sensível a máquina/rede.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 34

**Fonte:** `      "workers": 2`

**O que faz:** define 2 workers para `medium-b`.

**Como faz:** runner exporta e Playwright consome.

**Por que foi implementado dessa forma:** mantém simetria operacional com `medium-a`.

**Por que uma implementação ingênua seria pior:** hardcode duplicado em workflow poderia divergir.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO e 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 35

**Fonte:** `    },`

**O que faz:** fecha `medium-b`.

**Como faz:** termina o quarto registro.

**Por que foi implementado dessa forma:** preserva o último grupo como objeto independente.

**Por que uma implementação ingênua seria pior:** erro estrutural impediria leitura do plano.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo parser.

### Linha/posição 36

**Fonte:** `    {`

**O que faz:** abre o grupo `fast`.

**Como faz:** inicia o quinto e último registro.

**Por que foi implementado dessa forma:** isola cenários rápidos para um shard de alta densidade.

**Por que uma implementação ingênua seria pior:** misturá-los aos pesados prejudicaria tempo de conclusão do job.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 37

**Fonte:** `      "id": "fast",`

**O que faz:** define id `fast`.

**Como faz:** a matriz CI chama exatamente esse id.

**Por que foi implementado dessa forma:** fornece chave estável do shard rápido.

**Por que uma implementação ingênua seria pior:** selecionar pelo índice final do array seria frágil a reordenação.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige `fast`.

### Linha/posição 38

**Fonte:** `      "tag": "@e2e-fast",`

**O que faz:** associa `@e2e-fast`.

**Como faz:** seleciona 3 testes do reader + 2 testes rápidos de tradução + 3 cenários de result ownership + 1 aba Gemini manual.

**Por que foi implementado dessa forma:** consolida nove testes de menor custo em um shard paralelo.

**Por que uma implementação ingênua seria pior:** espalhar esses casos em shards pesados aumentaria overhead de jobs.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: verificador exige 9 testes reais para a tag e cobertura global exata.

### Linha/posição 39

**Fonte:** `      "kind": "fast",`

**O que faz:** classifica o grupo como `fast`.

**Como faz:** fornece o único `kind` que o verificador explicitamente procura.

**Por que foi implementado dessa forma:** garante que o plano mantenha pelo menos uma classe dedicada a rápidos.

**Por que uma implementação ingênua seria pior:** não ter qualquer grupo fast permitiria uma partição funcional mas pior para latência de CI.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-e2e-shard-plan.js` exige que algum grupo tenha `kind === 'fast'`; a proteção é global e não fixa que necessariamente seja este id.

### Linha/posição 40

**Fonte:** `      "expectedTests": 9,`

**O que faz:** fixa contagem esperada 9.

**Como faz:** é confrontada com a listagem Playwright e com o mapa estático.

**Por que foi implementado dessa forma:** protege a maior parcela do inventário e fecha total 21.

**Por que uma implementação ingênua seria pior:** um valor errado faria o gate falhar antes do merge de reports.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: `keys.length` deve ser 9; 🟦 CI Contract exige 9.

### Linha/posição 41

**Fonte:** `      "estimatedSeconds": 22.4,`

**O que faz:** registra estimativa 22.4 s.

**Como faz:** é apenas logada pelo verificador.

**Por que foi implementado dessa forma:** documenta que alta contagem não implica maior duração quando testes são rápidos.

**Por que uma implementação ingênua seria pior:** usar quantidade de testes como único balanceador seria pior que registrar tempo estimado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: não há gate de atualidade/precisão.

### Linha/posição 42

**Fonte:** `      "workers": 3`

**O que faz:** define 3 workers para `fast`.

**Como faz:** é passado ao Playwright em CI.

**Por que foi implementado dessa forma:** explora paralelismo dos nove casos rápidos sem criar nove workers.

**Por que uma implementação ingênua seria pior:** workers ilimitados poderiam aumentar custo/instabilidade do browser persistente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: CI Contract exige 3; 🟨 EXECUTADO INDIRETAMENTE pelo runner/config.

### Linha/posição 43

**Fonte:** `    }`

**O que faz:** fecha o objeto `fast` sem vírgula final.

**Como faz:** termina o último elemento do array em JSON válido.

**Por que foi implementado dessa forma:** evita depender de tolerância a trailing comma, que JSON não aceita.

**Por que uma implementação ingênua seria pior:** vírgula final seria aceita em JavaScript object literal, mas quebraria `JSON.parse`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelos três `JSON.parse` consumidores.

### Linha/posição 44

**Fonte:** `  ]`

**O que faz:** fecha o array `groups`.

**Como faz:** finaliza a coleção dos cinco shards.

**Por que foi implementado dessa forma:** permite ao objeto raiz conter o plano completo como uma unidade.

**Por que uma implementação ingênua seria pior:** array não fechado torna arquivo inválido e nenhum gate pode iniciar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo parser; 🟦 o CI Contract exige exatamente cinco elementos.

### Linha/posição 45

**Fonte:** `}`

**O que faz:** fecha o objeto raiz.

**Como faz:** completa o documento JSON.

**Por que foi implementado dessa forma:** garante que o arquivo seja parseável como valor único.

**Por que uma implementação ingênua seria pior:** conteúdo extra não-JSON após o objeto quebraria o parse.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo `JSON.parse` dos consumidores.

### Linha/posição 46

**Fonte:** `␤ [newline final]`

**O que faz:** representa o newline final após a chave de fechamento.

**Como faz:** não altera o valor JSON; preserva término POSIX/legibilidade de diffs.

**Por que foi implementado dessa forma:** mantém estilo consistente e evita marcadores de `No newline at end of file`.

**Por que uma implementação ingênua seria pior:** ausência não muda runtime, mas piora diffs e ferramentas textuais.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: nenhum gate localizado exige newline final.

## 14. Verificação final desta Bíblia

- Fonte integral reproduzida sem omissões: **sim**.
- 45 linhas textuais + newline final documentados individualmente: **sim**.
- Consumers operacionais lidos: **sim** (`run-e2e-group.js`, `playwright.config.js`, workflow e package scripts).
- Validadores reais lidos: **sim** (`verify-e2e-shard-plan.js`, `verify-ci-contract.js`, self-test do CI Contract).
- Testes E2E reais/tagging conferidos nos três specs: **sim**.
- Prova direta diferenciada de gate estático/execução indireta/lacuna: **sim**.
- Lacunas e riscos registrados sem alterar código funcional: **sim**.
- SHA do fonte no momento desta materialização: `22e8c20df9f42c0163a2d83c4e7b6f2d31f0dabc`.

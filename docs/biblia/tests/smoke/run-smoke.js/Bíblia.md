# Bíblia técnica — tests/smoke/run-smoke.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `ea6fa903f7a68272a769804a29a97ae967bc1088`  
> **Agente responsável:** AGENTE 1  
> **Tipo:** orquestrador Node.js da suíte smoke  
> **Linhas textuais:** 26  
> **Posições documentais:** 27, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/smoke/run-smoke.js` é o runner agregado dos testes de fumaça do Manga Translator. Ele não contém os cenários smoke em si: descobre os arquivos irmãos cujo nome satisfaz `/^smoke-\d+.*\.js$/`, garante uma quantidade mínima definida no baseline de CI, executa cada arquivo sequencialmente em um processo Node separado, agrega falhas e devolve um único exit code para npm/CI.

A responsabilidade central é impedir dois tipos de falso verde:

1. uma suíte smoke com quantidade abaixo do piso protegido;
2. uma suíte em que qualquer arquivo descoberto falhe.

O runner deliberadamente continua após uma falha individual para produzir diagnóstico dos arquivos restantes antes de finalizar vermelho.

## 2. Chamadores e consumidores

### npm

`package.json:17`:

```text
"test:smoke": "node tests/smoke/run-smoke.js"
```

`package.json:7` inclui `npm run test:smoke` no comando agregado `npm test`.

### GitHub Actions

`.github/workflows/ci.yml:87-102` define o job **Smoke Tests** e executa `npm run test:smoke`.

O mesmo workflow também executa smoke em fluxos adicionais nas regiões das linhas 426–427 e 459–460, e o gate final depende do resultado do job `smoke` nas linhas 488, 506 e 534.

### Baseline

O runner importa:

`scripts/ci/data/test-baseline.json`

No snapshot auditado:

```json
"smoke": {
  "minFiles": 6
}
```

`scripts/validation/verify-ci-contract.js` também valida que `baseline.smoke.minFiles` seja inteiro positivo. Esse gate protege a validade numérica do baseline, não a identidade dos arquivos smoke.

## 3. Descoberta de arquivos

A descoberta executa:

```js
fs.readdirSync(__dirname)
  .filter(f => /^smoke-\d+.*\.js$/.test(f))
  .sort();
```

### Regras concretas

Inclui nomes que:

- começam exatamente com `smoke-`;
- possuem pelo menos um dígito logo depois;
- podem conter qualquer sequência após os dígitos;
- terminam exatamente em `.js`.

Exemplos aceitos pelo regex:

- `smoke-01-batch-lifecycle.js`;
- `smoke-6.js`;
- `smoke-999-anything.js`.

Exemplos rejeitados:

- `run-smoke.js`;
- `smoke-a.js`;
- `foo-smoke-01.js`;
- `smoke-01.test.js.txt`.

A ordenação lexical é aplicada antes da execução.

## 4. Conjunto atual descoberto

No branch auditado existem exatamente seis arquivos que correspondem ao padrão:

1. `smoke-01-batch-lifecycle.js`;
2. `smoke-02-uuid-and-reconcile.js`;
3. `smoke-03-chapter-persistence.js`;
4. `smoke-04-storage-manager.js`;
5. `smoke-05-perceptual-queries.js`;
6. `smoke-06-sm-message-routing.js`.

`run-smoke.js` não corresponde ao próprio regex e não recursa sobre si mesmo.

## 5. Guard de baseline

Antes de spawnar qualquer smoke, o runner compara:

```text
files.length < baseline.smoke.minFiles
```

Com o baseline atual, menos de 6 arquivos causa:

- mensagem em stderr;
- `process.exit(1)`;
- nenhum smoke é executado.

O guard protege **cardinalidade mínima**. Ele não exige que os seis nomes atuais existam especificamente.

Consequência importante: remover `smoke-03-chapter-persistence.js` e adicionar outro arquivo correspondente ao regex poderia manter `files.length === 6` e, isoladamente, satisfazer esse guard. Essa limitação está registrada em `122-001`.

## 6. Execução de cada smoke

Para cada arquivo:

1. imprime um cabeçalho `=== <nome> ===`;
2. executa `process.execPath` com o caminho absoluto do arquivo;
3. herda stdio;
4. considera falha se `r.error` existir ou se `r.status !== 0`;
5. incrementa `failed`;
6. segue para o próximo arquivo.

### Isolamento por processo

Cada smoke roda em um processo Node separado. Isso reduz interferência de estado global entre arquivos e faz cada script controlar seu próprio lifecycle.

### Mesmo runtime

`process.execPath` garante que os filhos usem o mesmo executável Node do runner.

### Continuidade após erro

Não há `break` nem `process.exit` dentro do loop. Assim, falha em `smoke-02` não impede `smoke-03`…`smoke-06` de executar.

## 7. Agregação e exit code

Após o loop:

- `failed === 0` → mensagem verde;
- `failed > 0` → mensagem vermelha com número de arquivos falhos.

O runner termina explicitamente:

```js
process.exit(failed === 0 ? 0 : 1);
```

Portanto o exit code agregado é binário: não codifica a quantidade de falhas, apenas sucesso total versus uma ou mais falhas.

## 8. Side effects e falhas não tratadas

O runner:

- lê o diretório `tests/smoke`;
- carrega JSON do baseline;
- cria processos filhos;
- escreve stdout/stderr;
- encerra explicitamente o processo.

Não escreve arquivos e não modifica o repositório.

Erros anteriores ao loop, como falha de `require(test-baseline.json)` ou de `readdirSync`, propagam e tornam a execução malsucedida sem passar pelo resumo customizado.

## 9. Evidência automatizada real

O blob auditado é idêntico ao existente no commit do workflow bem-sucedido **MangaTranslator CI #36577447500**.

O job **Smoke Tests**, ID `109437162201`, concluiu com `success`.

O log mostra explicitamente:

```text
=== smoke-01-batch-lifecycle.js ===
=== smoke-02-uuid-and-reconcile.js ===
=== smoke-03-chapter-persistence.js ===
=== smoke-04-storage-manager.js ===
=== smoke-05-perceptual-queries.js ===
=== smoke-06-sm-message-routing.js ===
✅ 6 arquivo(s), todos passaram.
```

Isso prova o caminho verde completo do runner com os seis arquivos atuais.

### Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| `test:smoke` chama este runner | `package.json:17` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| job CI Smoke Tests executa `test:smoke` | `ci.yml:87-102` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| baseline exige mínimo 6 | `test-baseline.json` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| baseline smoke é inteiro positivo | `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| seis arquivos atuais são descobertos e executados em ordem | log job #109437162201 | ✅ PROVADO DIRETAMENTE |
| os seis retornaram sucesso naquele snapshot | resumo verde + job success | ✅ PROVADO DIRETAMENTE |
| runner retorna sucesso quando todos passam | job success | ✅ PROVADO DIRETAMENTE |
| branch `files.length < minFiles` falha | sem teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `r.error` incrementa falhas | sem teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| status não-zero incrementa falhas | sem teste focal do runner | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| runner continua após falha individual | sem cenário automatizado focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resumo vermelho e exit 1 agregado | sem cenário automatizado focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| composição exata dos seis smokes é protegida | somente contagem mínima | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Solicitações ao auditor

### 122-001 — CONTRACT_REVIEW — OPEN

**Encontrado:** o baseline protege somente `smoke.minFiles = 6`; não protege a identidade dos seis smokes canônicos.

**Arquivo auditado:** `tests/smoke/run-smoke.js`.

**Arquivos relacionados:** `scripts/ci/data/test-baseline.json` e os arquivos `tests/smoke/smoke-*.js`.

**Evidência atual:** CI executa atualmente os seis nomes esperados; busca por esses nomes não encontrou um gate separado de identidade.

**Evidência ausente:** lista canônica/allowlist/matriz que falhe quando um smoke obrigatório é removido e substituído por outro arquivo apenas para manter a contagem.

**Por que necessário:** cardinalidade preservada não implica preservação da cobertura temática.

**Ação solicitada:** auditor deve decidir se o contrato desejado é apenas quantidade mínima ou também identidade mínima. Se identidade for necessária, criar gate declarativo separado sem hardcode duplicado desnecessário.

**Evidência esperada:** remover um smoke obrigatório causa falha mesmo que outro arquivo correspondente seja adicionado.

**Possível regressão:** perda silenciosa de uma categoria smoke enquanto o total continua ≥6.

**Severidade:** NORMAL.

### 122-002 — TEST_REQUIRED — OPEN

**Encontrado:** o caminho verde do runner é executado em CI, mas seus branches vermelhos de orquestração não possuem teste focal localizado.

**Arquivo auditado:** `tests/smoke/run-smoke.js`.

**Evidência atual:** job #109437162201 prova descoberta/execution/sucesso para seis filhos verdes.

**Evidência ausente:** cenários controlados para quantidade abaixo do baseline, spawn error, child status não-zero, continuidade após uma falha e resumo/exit code vermelho.

**Por que necessário:** o runner é justamente o componente que converte resultados individuais em gate CI; regressão no agregador pode mascarar falhas.

**Ação solicitada:** criar teste separado do runner com diretório/processos controlados ou extração testável, sem alterar os smoke reais para fabricar a prova.

**Evidência esperada:** assertions diretas sobre ordem, número de filhos ainda executados após falha, stderr/stdout e exit code.

**Possível regressão:** um smoke vermelho pode deixar de propagar corretamente para o gate agregado.

**Severidade:** NORMAL.

## 11. Fonte integral auditada

```js
// Roda todos os testes de fumaça em sequência e resume o resultado.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const baseline = require('../../scripts/ci/data/test-baseline.json');

const files = fs.readdirSync(__dirname)
    .filter(f => /^smoke-\d+.*\.js$/.test(f))
    .sort();

if (files.length < baseline.smoke.minFiles) {
    console.error(`\n❌ Smoke: apenas ${files.length} arquivo(s) descobertos; mínimo protegido: ${baseline.smoke.minFiles}.`);
    process.exit(1);
}

let failed = 0;
for (const f of files) {
    console.log(`\n=== ${f} ===`);
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
    if (r.error || r.status !== 0) failed++;
}

console.log(failed === 0
    ? `\n✅ ${files.length} arquivo(s), todos passaram.`
    : `\n❌ ${failed} de ${files.length} arquivo(s) com falha.`);
process.exit(failed === 0 ? 0 : 1);
```

## 12. Mapa linha por linha

| Linha | Papel | Evidência |
|---:|---|---|
| 1 | comentário de intenção | documental |
| 2 | importa `spawnSync` | ✅ executado no CI |
| 3 | importa `path` | ✅ executado |
| 4 | importa `fs` | ✅ executado |
| 5 | carrega baseline JSON | ✅ executado |
| 6 | separador | estrutural |
| 7 | lê diretório smoke | ✅ executado |
| 8 | filtra nomes pelo regex | ✅ seis nomes observados |
| 9 | ordena lexicalmente | ✅ ordem observada no log |
| 10 | separador | estrutural |
| 11 | compara cardinalidade ao baseline | 🟨 caminho verde executado |
| 12 | mensagem de quantidade insuficiente | ⚠️ branch sem teste focal |
| 13 | exit 1 por quantidade insuficiente | ⚠️ branch sem teste focal |
| 14 | fecha guard | estrutural |
| 15 | separador | estrutural |
| 16 | inicia contador de falhas | ✅ executado |
| 17 | inicia loop | ✅ seis iterações observadas |
| 18 | imprime banner do filho | ✅ seis banners observados |
| 19 | spawna filho com mesmo Node | ✅ seis execuções observadas |
| 20 | agrega erro/status vermelho | ⚠️ condição falsa no run verde; branch não provado |
| 21 | fecha loop | estrutural |
| 22 | separador | estrutural |
| 23 | escolhe resumo por `failed` | ✅ branch verde provado |
| 24 | texto verde | ✅ observado |
| 25 | texto vermelho | ⚠️ não observado em prova focal |
| 26 | exit agregado 0/1 | ✅ lado 0 provado; ⚠️ lado 1 sem prova focal |
| 27 | newline final | 🟦 verificado no blob |

## 13. Unidades semânticas

### U01 — linhas 1–5 — bootstrap

Carrega somente dependências Node e o baseline compartilhado. Centralizar o mínimo no JSON evita duplicar o número em múltiplos runners.

### U02 — linhas 7–9 — descoberta dinâmica

Descobre smoke por convenção de nome. Isso é melhor que uma lista manual para inclusão automática de novos smoke, mas não protege identidade mínima; essa tensão é explicitada em 122-001.

### U03 — linhas 11–14 — piso de cardinalidade

Impede que a suíte fique acidentalmente vazia ou encolha abaixo do baseline sem falhar.

### U04 — linhas 16–21 — execução isolada e agregação

Executa todos os filhos sequencialmente, preservando diagnósticos. Abortar no primeiro erro seria pior para observabilidade.

### U05 — linhas 23–26 — resultado agregado

Traduz contagem de falhas em mensagem humana e código binário adequado para CI.

### U06 — posição 27 — newline final

O blob termina com `\n`: 26 linhas textuais, 27 posições documentais.

## 14. Autoauditoria do AGENTE 1

- [x] reserva exclusiva relida e confirmada;
- [x] SHA do fonte reconfirmado;
- [x] baseline real investigado;
- [x] conjunto atual dos seis smokes enumerado;
- [x] chamadores npm/CI identificados;
- [x] execução do mesmo blob localizada em CI;
- [x] linha a linha mapeada;
- [x] caminho verde distinguido dos branches vermelhos não provados;
- [x] duas lacunas persistidas como solicitações;
- [x] nenhum smoke, baseline ou runner foi alterado para produzir evidência.

**Resultado:** Bíblia concluída para `ea6fa903f7a68272a769804a29a97ae967bc1088`; 122-001 e 122-002 permanecem OPEN para processo auditor separado.

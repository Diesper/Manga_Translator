# Bíblia técnica — scripts/validation/validate-manifest.js

> **Estado documental:** ✅ AUTOAUDITORIA APROVADA PELO AGENTE 4  
> **SHA auditado:** `93dbb1882c69c47482b1b07fdaf3a2a9e9d133b1`  
> **Agente:** AGENTE 4  
> **Tipo:** gate Node.js síncrono de validação mínima do Manifest Chromium MV3  
> **Linhas textuais:** **18**  
> **Posições documentais:** **19**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/validation/validate-manifest.js` é um gate fail-closed para `extension/manifest.json`. Ele resolve o Manifest relativamente ao próprio script, lê e faz parse do JSON, exige quatro valores truthy (`manifest_version`, `name`, `version` e `permissions`), exige `manifest_version === 3` e imprime um resumo de sucesso com nome e versão.

O escopo é propositalmente menor que um validador completo do schema Chromium. O arquivo não valida todos os tipos, permissões, caminhos ou estruturas do Manifest e não verifica sincronização de versão com `package.json`. Gates complementares cobrem partes diferentes desse contrato, principalmente `scripts/release/sync-version.js`, `scripts/validation/verify-repository-structure.js` e `tests/unit/manifest/surface-reduction.test.js`.

`docs/Documentação.md` descreve a pipeline da mesma forma: campos obrigatórios do Manifest, `manifest_version === 3` e integridade da fonte de versão via `version:check`.

## 2. Dependências, consumers e efeitos

### Dependências diretas

- Node `fs` para `readFileSync`.
- Node `path` para `resolve`.
- `__dirname` como âncora do caminho.
- `extension/manifest.json` como única entrada de dados.
- `console.error` / `console.log` para diagnóstico.
- `process.exit(1)` para reprovação bloqueante.

Não há dependências npm, rede, browser APIs, `chrome.*`, timers, Promises, listeners, subprocessos próprios ou estado persistente.

### Consumers

- `package.json#validate:manifest` = `node scripts/validation/validate-manifest.js`.
- `package.json#validate` inclui `npm run validate:manifest`.
- `.github/workflows/ci.yml` contém job `manifest-validation` com passo `run: npm run validate:manifest`.
- `scripts/validation/verify-ci-contract.js` inclui `manifest-validation` em `requiredJobs`.

O último ponto protege estaticamente a **existência do job**, não, pelo que foi localizado nesta auditoria, o comando interno do job ou o target exato do alias npm.

### Efeitos colaterais

O script somente lê um arquivo e escreve em stdout/stderr. Não modifica o Manifest nem cria artefatos. A execução é síncrona e não possui cleanup.

## 3. Fluxos de execução

### Caminho verde

Node carrega o arquivo → resolve `../../extension/manifest.json` a partir de `__dirname` → lê UTF-8 → `JSON.parse` → percorre quatro campos → todos são truthy → `manifest_version !== 3` é falso → imprime `manifest.json válido: Manga Translator v6.5` → termina naturalmente com sucesso.

### Campo mínimo inválido

O loop encontra o primeiro valor falsy → escreve `Falta campo obrigatório no manifest: <campo>` em stderr → `process.exit(1)` → nenhuma validação posterior ocorre.

### Manifest não V3

Os quatro valores mínimos passam → `manifest_version !== 3` é verdadeiro → escreve `manifest_version deve ser 3` → `process.exit(1)`.

### I/O ou JSON inválido

`readFileSync` ou `JSON.parse` lança exception. Não há `try/catch` local; Node encerra com erro. Portanto o gate permanece fail-closed, mas o diagnóstico é o stack trace padrão.

## 4. Semântica precisa e limites

`if (!manifest[field])` é um teste de **truthiness**, não de schema:

- ausente / `undefined` / `null` / `""` / `0` / `false` → rejeitado;
- `[]` → aceito;
- `{}` → aceito;
- string truthy em `permissions` → aceita;
- qualquer valor truthy em `name` ou `version` → aceito.

`manifest_version` recebe uma segunda regra por desigualdade estrita:

- número `3` → aceito;
- string `"3"` → rejeitada;
- `2`, `4` → rejeitados.

O arquivo não valida diretamente `host_permissions`, `action`, `options_ui`, `background`, `content_scripts`, caminhos físicos, formato completo de versão ou schema Chromium. Outros gates podem cobrir parte disso, mas esta Bíblia não atribui essas garantias a este arquivo.

## 5. Estado real auditado

`extension/manifest.json` observado no branch possuía blob `841fe70c183350e4110bc8ff57ab69b157169c36` e, entre outros dados:

- `manifest_version: 3`;
- `name: "Manga Translator"`;
- `version: "6.5"`;
- `permissions` como array não vazio.

## 6. Evidência automatizada

No GitHub Actions run **#2167** do PR #66, associado ao commit que iniciou o estado desta auditoria (`14f339b5f67bf5f45af426298ef613fa327237cd`), o job **Manifest Validation** concluiu com sucesso. O passo “Validar manifest.json” também concluiu com sucesso.

Como o workflow chama `npm run validate:manifest` e o alias atual aponta para este arquivo, a implementação real foi executada contra o Manifest real e completou o caminho verde.

| Contrato | Evidência | Classificação |
|---|---|---|
| job `manifest-validation` existe | `verify-ci-contract.js` exige esse id | 🟦 GATE ESTÁTICO ESPECÍFICO |
| script real executa com o Manifest atual | run #2167 / step “Validar manifest.json” | 🟨 EXECUTADO INDIRETAMENTE |
| caminho/JSON atual são válidos | o script real chegou ao sucesso | 🟨 EXECUTADO INDIRETAMENTE |
| quatro valores atuais são truthy | caminho verde não saiu no loop | 🟨 EXECUTADO INDIRETAMENTE |
| `manifest_version` atual é número 3 | caminho verde passou pelo check estrito | 🟨 EXECUTADO INDIRETAMENTE |
| campo ausente/falsy produz mensagem + exit 1 | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| V2/V4/`"3"` produz mensagem + exit 1 | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| JSON inválido/arquivo ausente | falha por exception; sem assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| tipos/shape de `name`/`version`/`permissions` | não validados por este arquivo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| comando/alias não podem ser redirecionados | nenhum gate específico localizado | ⚠️ SEM GATE ESTÁTICO ESPECÍFICO |

`tests/unit/manifest/surface-reduction.test.js` lê o mesmo Manifest e prova `host_permissions`/`web_accessible_resources`, mas não executa `validate-manifest.js`. Portanto é prova do Manifest, não teste direto deste validador.

## 7. Solicitações ao auditor

As solicitações canônicas são persistidas em `docs/biblia/.state/081.json`.

### 081-001 — TEST_REQUIRED

Não há self-test focal dos branches negativos do script real.

**Necessário:** executar a implementação real em sandbox segura e afirmar exit code/stdout/stderr para: cada campo ausente/falsy, `manifest_version` 2/4/`"3"`, JSON malformado e arquivo ausente/inacessível.

**Risco:** o Manifest canônico saudável mantém a CI verde mesmo se um branch de rejeição regressar.

### 081-002 — CONTRACT_REVIEW

A checagem de campos é truthiness; `permissions: []`, `permissions: {}` ou uma string truthy passam.

**Necessário:** decidir se o contrato intencional é somente presença/truthiness ou se o gate deve validar tipos/shape. Qualquer ampliação deve ocorrer em alteração funcional separada com regressões específicas.

**Risco:** Manifest semanticamente inválido pode atravessar este gate e depender de outra camada para falhar.

### 081-003 — CI_CONTRACT_REVIEW

`verify-ci-contract.js` protege o id `manifest-validation`, mas não foi encontrada assertion que fixe `run: npm run validate:manifest` nem `package.json#validate:manifest` neste script.

**Necessário:** avaliar check estático + self-test de mutação para esses dois enlaces.

**Risco:** o job pode conservar o nome e ficar verde executando outra coisa, removendo este gate da pipeline sem ser detectado pelo contrato atual.

## 8. Invariantes

1. O Manifest deve continuar resolvido relativamente a `__dirname` enquanto o script viver em `scripts/validation`.
2. A entrada deve continuar sendo `extension/manifest.json`.
3. Leitura e parse precedem validações semânticas.
4. Os quatro campos mínimos só devem mudar mediante decisão explícita de contrato.
5. O primeiro valor mínimo falsy deve reprovar o processo.
6. `manifest_version` deve ser exatamente o número `3`.
7. Falhas de leitura/parse devem continuar fail-closed.
8. O caminho verde não deve escrever arquivos.
9. O job `manifest-validation` deve continuar executando efetivamente este gate.
10. Evidência de gates complementares não deve ser rotulada como teste direto deste script.
11. Esta Bíblia vale somente para o blob `93dbb1882c69c47482b1b07fdaf3a2a9e9d133b1`.

## 9. Fonte integral exata

~~~javascript
'use strict';

const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, '../../extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const field of ['manifest_version', 'name', 'version', 'permissions']) {
  if (!manifest[field]) {
    console.error('Falta campo obrigatório no manifest: ' + field);
    process.exit(1);
  }
}
if (manifest.manifest_version !== 3) {
  console.error('manifest_version deve ser 3');
  process.exit(1);
}
console.log('manifest.json válido: ' + manifest.name + ' v' + manifest.version);
~~~

## 10. Documentação linha/posição a linha

### Linha/posição 1
**Fonte:** `'use strict';`  
**Faz:** ativa strict mode do módulo CommonJS.  
**Como/por quê:** directive prologue reduz semânticas permissivas em futuras mudanças. Removê-la não quebra o fluxo atual, mas enfraquece proteção de linguagem.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; nenhuma assertion específica ao strict mode.

### Linha/posição 2
**Fonte:** linha vazia.  
**Faz:** separa directive prologue dos imports.  
**Como/por quê:** whitespace editorial melhora legibilidade; compactar não traz ganho funcional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito textual.

### Linha/posição 3
**Fonte:** `const fs = require('fs');`  
**Faz:** importa filesystem do Node.  
**Como/por quê:** o gate precisa ler o Manifest real; built-in evita dependência externa.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE no run #2167.

### Linha/posição 4
**Fonte:** `const path = require('path');`  
**Faz:** importa utilidades de caminhos.  
**Como/por quê:** `path.resolve` é portável entre plataformas; concatenação manual de separadores seria mais frágil.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 5
**Fonte:** linha vazia.  
**Faz:** separa imports da resolução da entrada.  
**Como/por quê:** organização do fonte sem efeito runtime.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 6
**Fonte:** `const manifestPath = path.resolve(__dirname, '../../extension/manifest.json');`  
**Faz:** calcula caminho absoluto do Manifest.  
**Como:** sobe dois níveis a partir de `scripts/validation`.  
**Por quê:** desacopla a entrada do `cwd`; usar caminho relativo ao processo seria mais frágil.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; não há teste focal multi-`cwd`.

### Linha/posição 7
**Fonte:** `const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));`  
**Faz:** lê UTF-8 e faz parse completo do JSON.  
**Como/por quê:** fluxo síncrono é suficiente para gate CLI curto e evita validação antes do parse.  
**Evidência:** 🟨 para o Manifest atual; ⚠️ sem teste focal de ENOENT/EACCES/JSON inválido.

### Linha/posição 8
**Fonte:** `for (const field of ['manifest_version', 'name', 'version', 'permissions']) {`  
**Faz:** inicia verificação dos quatro campos mínimos em ordem fixa.  
**Como/por quê:** uma lista evita quatro blocos duplicados e mantém diagnóstico uniforme.  
**Evidência:** 🟨 para os valores atuais; ⚠️ sem casos negativos por campo.

### Linha/posição 9
**Fonte:** `  if (!manifest[field]) {`  
**Faz:** entra no erro quando o valor é falsy.  
**Como:** coerção booleana + negação.  
**Por quê:** implementação curta de presença mínima; não equivale a schema/type checking.  
**Evidência:** 🟨 para branch falso atual; ⚠️ sem teste focal do branch verdadeiro.

### Linha/posição 10
**Fonte:** `    console.error('Falta campo obrigatório no manifest: ' + field);`  
**Faz:** identifica no stderr o campo rejeitado.  
**Como/por quê:** concatena a chave iterada; diagnóstico específico é melhor que erro genérico.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 11
**Fonte:** `    process.exit(1);`  
**Faz:** termina o processo como falha no primeiro campo inválido.  
**Como/por quê:** exit 1 torna o gate bloqueante; apenas logar poderia produzir falso verde.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 12
**Fonte:** `  }`  
**Faz:** encerra o branch de campo inválido.  
**Como/por quê:** mantém o exit condicionado ao teste da linha 9.  
**Evidência:** 🟨 quanto ao parse/fluxo do caminho verde.

### Linha/posição 13
**Fonte:** `}`  
**Faz:** encerra o loop e transfere o fluxo ao check específico de MV3.  
**Como/por quê:** separa regra genérica de presença da regra de valor exato.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 14
**Fonte:** `if (manifest.manifest_version !== 3) {`  
**Faz:** rejeita qualquer valor diferente do número 3.  
**Como:** desigualdade estrita evita coerção de `"3"`.  
**Por quê:** é mais forte e previsível que `!= 3`.  
**Evidência:** 🟨 para `3` atual; ⚠️ sem teste de 2/4/`"3"`.

### Linha/posição 15
**Fonte:** `  console.error('manifest_version deve ser 3');`  
**Faz:** diagnostica versão incompatível.  
**Como/por quê:** stderr específico distingue valor errado de campo ausente.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 16
**Fonte:** `  process.exit(1);`  
**Faz:** reprova Manifest não V3.  
**Como/por quê:** encerra imediatamente com código 1; continuar poderia permitir falso sucesso.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 17
**Fonte:** `}`  
**Faz:** encerra branch de erro e permite sucesso apenas quando `manifest_version === 3`.  
**Como/por quê:** delimitação lexical torna erro/sucesso mutuamente exclusivos.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 18
**Fonte:** `console.log('manifest.json válido: ' + manifest.name + ' v' + manifest.version);`  
**Faz:** emite resumo do caminho verde.  
**Como:** concatena nome e versão ao literal.  
**Por quê:** feedback humano compacto; silêncio dificultaria distinguir execução real de step vazio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; não há assertion do texto exato.

### Linha/posição 19
**Fonte:** `⏎ [newline final]`  
**Faz:** representa a posição terminal do arquivo texto.  
**Como/por quê:** o blob termina com LF; remover não muda runtime, mas muda SHA/contagem posicional.  
**Evidência:** ⚠️ propriedade textual do blob, sem teste funcional específico.

## 11. Análise crítica

1. O gate é mínimo, não schema-aware.
2. Truthiness aceita arrays/objetos vazios e tipos errados truthy.
3. O caminho verde real não prova branches negativos.
4. I/O/parse são fail-closed por exception, mas sem mensagem customizada.
5. `process.exit(1)` é adequado a CLI curto, porém reduz testabilidade como biblioteca.
6. O arquivo não exporta função; self-test negativo exige child process/sandbox ou refatoração separada.
7. `__dirname` reduz dependência de `cwd` e favorece portabilidade.
8. O CI Contract protege mais fortemente o nome do job que o comando/alias que realmente executa este gate.
9. Gates complementares devem continuar classificados separadamente.
10. A principal lacuna encontrada é de prova automatizada dos branches negativos, não falha atual demonstrada do caminho verde.

## 12. Autoauditoria — AGENTE 4

- Reserva e state #081 relidos; ambos pertenciam a **AGENTE 4**.
- SHA do fonte reconfirmado: `93dbb1882c69c47482b1b07fdaf3a2a9e9d133b1`.
- Fonte integral incluída sem alteração.
- 18 linhas textuais + newline final = **19/19 posições documentadas**.
- Consumers, workflow, CI Contract, Manifest real, documentação e teste focal do Manifest foram inspecionados.
- Execução real do caminho verde foi verificada no run #2167.
- Nenhum código, teste, fixture, workflow, configuração, STATUS, CHECKLIST ou AUDITORIA foi alterado.
- Lacunas externas foram registradas como `audit_requests`, sem fabricar nova evidência.

**Conclusão documental:** a Bíblia representa o comportamento real do SHA auditado e distingue explicitamente execução indireta, gate estático e ausência de prova focal.

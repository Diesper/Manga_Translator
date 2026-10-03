# Bíblia técnica — scripts/validation/check-js-syntax.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `fbc69cf9f910c3666ef390828b1793098b3bfe06`  
> **Agente responsável:** AGENTE 1  
> **Tipo:** gate Node.js de validação sintática  
> **Linhas textuais:** 30  
> **Posições documentais:** 31, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/validation/check-js-syntax.js` é o gate sintático JavaScript do repositório. Ele descobre recursivamente arquivos regulares cujo nome termina exatamente em `.js` sob `extension/`, `tests/` e `scripts/` e, para cada arquivo, executa o parser do mesmo runtime Node que iniciou o processo por meio de `process.execPath --check <arquivo>`.

Apesar de o comando npm se chamar `lint`, este arquivo não executa ESLint, regras de estilo, análise de tipos, imports, testes ou código das unidades auditadas. Seu contrato real é mais estreito: **parseabilidade sintática pelo Node usado no gate**.

O fluxo é fail-closed em dois casos: nenhum JavaScript encontrado no conjunto agregado, ou pelo menos um `node --check` com status diferente de zero. O loop não aborta no primeiro erro; ele continua até o último arquivo e só então encerra com status 1.

## 2. Chamadores, consumidores e dependências

### Chamadores diretos

- `package.json:37`: `"lint": "node scripts/validation/check-js-syntax.js"`;
- `package.json:38`: `validate` inclui `npm run lint`;
- `.github/workflows/ci.yml:32-43`: job `syntax-check`, nomeado **JS Syntax Check**, executa `npm run lint`;
- `.github/workflows/ci.yml:485,503,531`: o gate final depende do resultado de `syntax-check`;
- `scripts/validation/verify-ci-contract.js:74-91`: `syntax-check` consta entre os jobs obrigatórios, embora esse verificador não fixe o comando interno `npm run lint`.

### Dependências de runtime

Somente módulos built-in:

- `fs`: existência e leitura de diretórios;
- `path`: resolução do root e composição de caminhos;
- `child_process.spawnSync`: execução síncrona de `node --check`.

Dependências implícitas:

- o arquivo permanecer sob `scripts/validation`, pois o root é calculado via `__dirname/../..`;
- `process.execPath` apontar para um Node executável;
- permissões de leitura nas árvores;
- capacidade de criar child processes.

Não existe dependência de biblioteca npm de terceiros, DOM, Chrome API, rede, IndexedDB ou Playwright.

## 3. Contrato de descoberta

O root é resolvido por `path.resolve(__dirname, '../..')`; portanto a busca não depende de `process.cwd()`.

Raízes:

1. `<repo>/extension`;
2. `<repo>/tests`;
3. `<repo>/scripts`.

`walk(dir)` aplica as regras seguintes:

- diretório inexistente → `[]`;
- diretório real → recursão;
- arquivo regular terminado literalmente em `.js` → incluído;
- qualquer outra entrada → ignorada.

Consequências:

- `.mjs`, `.cjs`, `.jsx`, `.ts` e `.JS` não entram;
- symlinks não são seguidos pelos predicados atuais de `Dirent`;
- arquivos `.js` fora das três raízes não entram;
- uma raiz individual ausente é silenciosamente convertida em lista vazia;
- o guard “nenhum arquivo” só dispara se o **agregado das três raízes** for vazio.

Depois da descoberta, `roots.flatMap(walk).sort()` cria uma lista lexicalmente ordenada de caminhos completos.

## 4. Contrato de validação

Para cada arquivo, a linha 22 executa:

```text
<process.execPath> --check <arquivo>
```

com `stdio: 'inherit'`.

### Por que `process.execPath`

O child usa exatamente o executável Node que executou o gate. Isso evita depender de resolução adicional do comando `node` pelo PATH e mantém o parser coerente com o runtime da CI.

### Por que `--check`

O Node analisa a sintaxe sem executar o módulo. Usar `require(file)` seria semanticamente pior: dispararia efeitos colaterais e misturaria erros de runtime/ambiente com erro sintático.

### Agregação

`failed` começa falso. Qualquer `result.status !== 0` o torna verdadeiro. Como não há `break`, todos os arquivos restantes continuam sendo analisados.

A comparação estrita também trata `status === null` como insucesso.

## 5. Saídas e códigos de processo

| Situação | Resultado |
|---|---|
| Há arquivos e todos retornam 0 | imprime `Sintaxe JS validada em N arquivo(s).` e termina naturalmente com 0 |
| Há arquivos e algum retorna status != 0 | continua a varredura e depois `process.exit(1)` |
| Agregado contém zero arquivos | stderr: `Nenhum arquivo JavaScript encontrado para validação.` + exit 1 |
| Uma raiz some, mas outra contém JS | a raiz ausente vira `[]`; o lint isolado ainda pode terminar verde |
| `readdirSync` lança erro | exceção propaga; não há catch local |

O arquivo não escreve no repositório, não mantém cache e não persiste estado. Seus side effects são leitura de diretórios, criação sequencial de child processes, stdout/stderr e código de saída.

## 6. Evidência automatizada existente

Foi localizada execução real do mesmo blob no workflow **MangaTranslator CI #36577447500**, head `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`, concluído com sucesso em 2026-09-29.

O SHA do arquivo naquele commit é exatamente `fbc69cf9f910c3666ef390828b1793098b3bfe06`.

No run, o job **JS Syntax Check** (`109437162703`) terminou com `success`. O log registra:

- `npm run lint`;
- `node scripts/validation/check-js-syntax.js`;
- `Sintaxe JS validada em 218 arquivo(s).`.

Portanto há prova de execução real do caminho verde desse blob, mas essa execução não prova branches negativos.

### Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| `npm run lint` aponta para este script | `package.json:37` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `validate` inclui o lint | `package.json:38` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI possui `syntax-check` | `ci.yml:32-43`; required job no verificador de contrato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| blob real chega ao caminho verde e valida uma árvore real | run #36577447500 / job #109437162703 | 🟨 EXECUTADO INDIRETAMENTE |
| 218 arquivos foram aceitos naquele snapshot | log do job | 🟨 EXECUTADO INDIRETAMENTE |
| recursão positiva e spawn `--check` funcionam no workspace normal | mesma execução real | 🟨 EXECUTADO INDIRETAMENTE |
| sintaxe inválida produz exit 1 | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| loop continua após primeira falha | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| zero arquivos produz mensagem + exit 1 | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| filtros negativos de extensão | sem assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| raiz individual ausente é tolerada | sem teste/contrato focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| symlink é ignorado | sem teste/contrato focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| erro de leitura propaga | sem teste focal de I/O | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Solicitações ao auditor

### 079-001 — TEST_REQUIRED — OPEN

**Encontrado:** não foi localizado teste automatizado focal que execute esta implementação real contra uma árvore controlada e prove descoberta, filtros e branches vermelhos.

**Arquivo auditado:** `scripts/validation/check-js-syntax.js`.

**Arquivo externo sugerido:** `tests/unit/validation/check-js-syntax.test.js` (novo, se aprovado).

**Evidência atual:** CI real do mesmo blob prova somente o caminho verde em workspace real.

**Evidência ausente:** assertions diretas para diretório aninhado, extensões rejeitadas, JS sintaticamente inválido, continuidade depois da primeira falha, conjunto vazio, stdout/stderr e exit code.

**Por que é necessária:** mudanças futuras podem quebrar guards/filtros sem afetar um snapshot verde comum.

**Ação esperada do auditor:** confirmar a lacuna e, em alteração de testes separada, criar sandbox/child process usando a implementação real, sem copiar a lógica.

**Evidência esperada:** assertions específicas sobre arquivos incluídos/ignorados, exit codes e mensagens.

**Possível regressão:** o gate pode deixar de detectar determinada classe de erro ou reduzir silenciosamente seu escopo.

**Severidade:** NORMAL.

### 079-002 — CONTRACT_REVIEW — OPEN

**Encontrado:** `walk` retorna `[]` para cada raiz inexistente. Assim, a remoção de `extension/` não faz o lint isolado falhar se `tests/` ou `scripts/` ainda contiverem algum `.js`.

**Arquivo auditado/relacionado:** `scripts/validation/check-js-syntax.js`.

**Evidência atual:** linhas 8, 11 e 19 implementam a tolerância. O pipeline `validate` também possui um gate estrutural separado, mas isso não altera a semântica isolada do lint.

**Evidência ausente:** contrato/teste definindo se as três raízes são obrigatórias para este comando.

**Por que é necessária:** consumidores podem interpretar “JS Syntax Check” como prova de cobertura das três árvores.

**Ação esperada do auditor:** decidir se a tolerância é intencional. Se cada raiz for obrigatória, corrigir código e teste fora desta auditoria documental; se for intencional, formalizar o contrato.

**Evidência esperada:** teste ou contrato explícito para raiz ausente.

**Possível regressão:** rename/remoção acidental de uma árvore pode não quebrar `npm run lint` isoladamente.

**Severidade:** NORMAL.

## 8. Fonte integral auditada

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const roots = ['extension', 'tests', 'scripts'].map((dir) => path.join(root, dir));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = roots.flatMap(walk).sort();
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (!files.length) {
  console.error('Nenhum arquivo JavaScript encontrado para validação.');
  process.exit(1);
}
if (failed) process.exit(1);
console.log('Sintaxe JS validada em ' + files.length + ' arquivo(s).');
```

## 9. Mapa linha por linha

| Linha | Função | Prova |
|---:|---|---|
| 1 | ativa strict mode | 🟨 execução real |
| 2 | separador | estrutural |
| 3 | importa `fs` | 🟨 execução real |
| 4 | importa `path` | 🟨 execução real |
| 5 | importa `spawnSync` | 🟨 execução real |
| 6 | separador | estrutural |
| 7 | calcula root pelo local do script | 🟨 caminho verde real |
| 8 | cria as três raízes | 🟨 caminho verde; obrigatoriedade individual não provada |
| 9 | separador | estrutural |
| 10 | declara `walk` | 🟨 execução indireta |
| 11 | diretório ausente → `[]` | ⚠️ branch sem teste focal |
| 12 | lê Dirents e inicia flatMap | 🟨 execução indireta |
| 13 | compõe caminho completo | 🟨 execução indireta |
| 14 | recursa em diretórios | 🟨 executado no workspace real |
| 15 | inclui só arquivo regular terminado em `.js` | 🟨 positivo executado; negativos sem assertion |
| 16 | fecha callback | estrutural |
| 17 | fecha walker | estrutural |
| 18 | separador | estrutural |
| 19 | agrega e ordena | 🟨 run real reportou 218 arquivos |
| 20 | inicia flag `failed=false` | 🟨 caminho verde |
| 21 | itera todos os arquivos | 🟨 execução real |
| 22 | spawna mesmo Node com `--check` | 🟨 execução real |
| 23 | marca status não-zero | ⚠️ branch vermelho sem teste |
| 24 | fecha loop | estrutural |
| 25 | testa lista vazia | ⚠️ branch sem teste |
| 26 | diagnóstico de vazio | ⚠️ sem teste |
| 27 | exit 1 no vazio | ⚠️ sem teste |
| 28 | fecha guard | estrutural |
| 29 | exit 1 após qualquer falha | ⚠️ sem teste focal |
| 30 | mensagem verde com contagem | 🟨 log real: 218 |
| 31 | newline final | 🟦 leitura integral do blob |

## 10. Unidades semânticas

### U01 — linhas 1–8 — bootstrap e escopo

Estabelece strict mode, dependências, root estável e árvores cobertas. Resolver pelo `__dirname` é superior a depender de cwd, pois o comando continua apontando para o repositório mesmo quando o invocador muda de diretório.

### U02 — linhas 10–17 — walker

Implementa descoberta sem glob externo. A recursão automática evita listas manuais que ficariam obsoletas com novos arquivos. A tolerância a diretório ausente é uma propriedade real, não uma suposição; está registrada em 079-002.

### U03 — linha 19 — materialização da lista

Combina as raízes e ordena. A ordenação não muda sucesso/falha, mas estabiliza a sequência de validação dentro do runtime/plataforma.

### U04 — linhas 20–24 — parser real

Usa `node --check` do mesmo executável e herda stdio. Isso valida sintaxe sem executar efeitos colaterais do código alvo.

### U05 — linhas 25–28 — fail-closed vazio

Impede sucesso trivial quando nenhum JavaScript foi descoberto. Não existe prova focal automatizada desse branch.

### U06 — linha 29 — fail-closed agregado

Converte qualquer child malsucedido em exit 1 somente depois de analisar todos os arquivos, favorecendo diagnóstico múltiplo.

### U07 — linha 30 — observabilidade verde

A contagem torna a amplitude da varredura visível. O run observado registrou 218.

### U08 — posição 31 — newline

O blob possui terminador final, por isso existem 30 linhas textuais e 31 posições documentais.

## 11. Invariantes e limites

Invariantes:

1. novo arquivo regular `.js` dentro de uma raiz canônica entra automaticamente;
2. o parser é o Node corrente, não uma implementação duplicada;
3. os arquivos auditados não são executados;
4. um erro não interrompe a análise dos arquivos seguintes;
5. zero arquivos no agregado não pode resultar em verde;
6. não há mutação do workspace.

Este gate **não prova** comportamento funcional, cobertura de testes, política `.skip/.only`, estilo, tipos, compatibilidade de navegador, Manifest, imports resolvíveis, ausência de leaks ou sucesso de Jest/Playwright.

## 12. Autoauditoria do AGENTE 1

- [x] reserva exclusiva criada com CREATE ONLY;
- [x] reserva relida e ownership confirmado;
- [x] SHA do fonte reconfirmado;
- [x] fonte integral incorporada sem alterar código/testes;
- [x] 30 linhas textuais + newline = 31 posições;
- [x] chamadores e gate CI identificados;
- [x] execução real do mesmo blob localizada;
- [x] caminho verde separado dos branches não provados;
- [x] lacunas externas registradas como `audit_requests`;
- [x] nenhuma evidência foi fabricada alterando o objeto auditado.

**Resultado:** documentação concluída para o blob `fbc69cf9f910c3666ef390828b1793098b3bfe06`; 079-001 e 079-002 permanecem abertas para processo auditor separado.

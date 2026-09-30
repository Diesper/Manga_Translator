# Bíblia técnica — tests/setup/create-test-images.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `f35e7896ffb5fea9091876544c8351bbba3c86da`  
> **Agente responsável:** AGENTE 1  
> **Tipo:** utilitário Node.js de materialização de fixtures PNG  
> **Linhas textuais:** 13  
> **Posições documentais:** 14, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/setup/create-test-images.js` materializa em disco as imagens PNG canônicas usadas pelos testes E2E. Os bytes não são definidos aqui: a fonte única é `tests/fixtures/manga-images.js`, que exporta `PNG_IMAGES` e `writeImagesToDisk`.

O arquivo escolhe o diretório `tests/fixtures/manga-images/`, chama o helper, percorre os nomes devolvidos, consulta o mesmo Map para obter o tamanho de cada Buffer e produz diagnóstico por arquivo e um resumo final.

Ele não gera PNG por conta própria, não duplica dados binários e não contém tratamento que esconda falhas de filesystem.

## 2. Integração no projeto

`package.json` conecta este entrypoint ao fluxo oficial:

- `pretest:e2e` → `npm run test:images`;
- `pretest:e2e:group` → `npm run test:images`;
- `test:images` → `node tests/setup/create-test-images.js`.

Assim, tanto o E2E completo quanto os grupos/shards preparam as imagens antes do Playwright.

O README também descreve `tests/fixtures/manga-images.js` como fonte única dos PNGs E2E e este script apenas como materializador.

## 3. Dependências e contrato do helper

Dependências:

- built-in `path`;
- módulo interno `../fixtures/manga-images`.

No blob atual de `tests/fixtures/manga-images.js`:

- `PNG_IMAGES` começa na linha 88;
- contém sete arquivos canônicos;
- `writeImagesToDisk` está nas linhas 123–129;
- cria o diretório com `fs.mkdirSync(..., { recursive: true })`;
- grava cada Buffer com `fs.writeFileSync`;
- devolve `[...PNG_IMAGES.keys()]`.

Logo, no contrato atual, cada nome retornado por `written` é uma chave do mesmo Map consultado na linha 10 do setup.

## 4. Fluxo operacional

1. ativa strict mode;
2. importa `path` e o contrato de fixtures;
3. calcula `tests/fixtures/manga-images/` a partir de `__dirname`;
4. chama `writeImagesToDisk(outDir)`;
5. para cada nome retornado, lê o Buffer no Map e imprime `OK <arquivo>: <bytes> bytes`;
6. imprime `Fixtures PNG preparadas: <N> arquivo(s).`.

O uso de `__dirname` torna o destino independente de `process.cwd()`.

Não há `process.exit` explícito. Sucesso termina naturalmente com 0. Erros de import, mkdir, escrita ou um retorno incoerente do helper propagam e tornam o comando vermelho.

## 5. Side effects e idempotência

O script:

- cria `tests/fixtures/manga-images/` se necessário;
- escreve ou substitui os sete PNGs conhecidos.

Ele não remove arquivos extras antigos do diretório. Portanto o contrato é “garantir as fixtures canônicas”, não “espelhar exatamente o conteúdo do diretório”.

Reexecutá-lo com o mesmo `PNG_IMAGES` sobrescreve os mesmos caminhos com os mesmos buffers.

## 6. Evidência automatizada real

No workflow bem-sucedido **MangaTranslator CI #36577447500**, o shard E2E **fast** (job `109437162728`) executou:

- `npm run test:images`;
- `node tests/setup/create-test-images.js`.

O log registrou:

- `page_001.png: 22728 bytes`;
- `page_002.png: 22730 bytes`;
- `avatar.png: 158 bytes`;
- `banner.png: 1898 bytes`;
- `translated_result_0.png: 22734 bytes`;
- `translated_result_1.png: 22730 bytes`;
- `translated_result_default.png: 22724 bytes`;
- `Fixtures PNG preparadas: 7 arquivo(s).`.

O job E2E concluiu com sucesso.

| Comportamento | Evidência | Classificação |
|---|---|---|
| `test:images` chama este script | `package.json` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| E2E/E2E group preparam imagens | scripts `pretest:e2e*` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| entrypoint real executa sem erro | run #36577447500 / job #109437162728 | ✅ PROVADO DIRETAMENTE |
| sete nomes são iterados | sete linhas `OK` no log | ✅ PROVADO DIRETAMENTE |
| tamanhos dos buffers observados | log do entrypoint | ✅ PROVADO DIRETAMENTE |
| resumo final reporta 7 | log real | ✅ PROVADO DIRETAMENTE |
| helper grava bytes utilizáveis | helper executado e E2E subsequente verde | 🟨 EXECUTADO INDIRETAMENTE |
| caminho independe do cwd | decorre de `__dirname`; sem assertion focal isolada | 🟨 EXECUTADO INDIRETAMENTE |

Não foi identificada lacuna externa relevante que justifique `audit_request`: o caminho principal do entrypoint foi executado de verdade em CI e suas falhas de I/O não são engolidas.

## 7. Fonte integral auditada

```js
'use strict';

const path = require('path');
const { PNG_IMAGES, writeImagesToDisk } = require('../fixtures/manga-images');

const outDir = path.join(__dirname, '..', 'fixtures', 'manga-images');
const written = writeImagesToDisk(outDir);

for (const file of written) {
  const buf = PNG_IMAGES.get(file);
  console.log(`OK ${file}: ${buf.length} bytes`);
}
console.log(`Fixtures PNG preparadas: ${written.length} arquivo(s).`);
```

## 8. Mapa linha por linha

| Linha | Papel | Evidência |
|---:|---|---|
| 1 | strict mode | ✅ executado |
| 2 | separador | estrutural |
| 3 | importa `path` | ✅ executado |
| 4 | importa Map e materializador | ✅ executado |
| 5 | separador | estrutural |
| 6 | calcula diretório alvo | ✅ caminho real executado |
| 7 | materializa fixtures e recebe nomes | ✅ execução real |
| 8 | separador | estrutural |
| 9 | itera nomes gravados | ✅ sete iterações observadas |
| 10 | recupera Buffer por nome | ✅ tamanhos observados |
| 11 | imprime arquivo e bytes | ✅ sete linhas no log |
| 12 | fecha loop | estrutural |
| 13 | imprime total | ✅ total 7 no log |
| 14 | newline final | 🟦 verificado no blob |

## 9. Unidades semânticas

### U01 — linhas 1–4 — bootstrap

Mantém o entrypoint fino e delega geração/escrita ao módulo de fixtures. Duplicar os bytes aqui criaria duas fontes de verdade.

### U02 — linhas 6–7 — destino e materialização

O destino deriva de `__dirname`, não do cwd. O helper encapsula mkdir e writeFileSync.

### U03 — linhas 9–12 — observabilidade

Além de logar, a consulta `PNG_IMAGES.get(file).length` exige coerência entre a lista devolvida e o Map. Um nome desconhecido não geraria falso sucesso.

### U04 — linha 13 — resumo

Expõe a cardinalidade final, útil para detectar mudanças na quantidade de fixtures em logs de CI.

### U05 — posição 14 — newline

O arquivo termina com `\n`, portanto 13 linhas textuais correspondem a 14 posições documentais.

## 10. Por que alternativas ingênuas seriam piores

- copiar os buffers para este script duplicaria a fonte de verdade;
- usar cwd para montar o destino tornaria o comando dependente do invocador;
- engolir erros de escrita permitiria iniciar E2E com fixture ausente;
- gerar logs só no final reduziria diagnóstico sobre qual fixture mudou;
- recriar a geração PNG neste entrypoint poderia divergir do servidor/mock que usa o mesmo módulo de fixtures.

## 11. Autoauditoria do AGENTE 1

- [x] reserva exclusiva confirmada;
- [x] SHA reconfirmado;
- [x] fonte integral incorporada;
- [x] 13 linhas textuais + newline = 14 posições;
- [x] fornecedor das fixtures investigado;
- [x] chamadores npm identificados;
- [x] execução real em CI localizada com saída por arquivo;
- [x] nenhum arquivo externo foi alterado;
- [x] nenhuma solicitação artificial foi criada.

**Resultado:** Bíblia concluída para `f35e7896ffb5fea9091876544c8351bbba3c86da`, sem `audit_requests` abertas.

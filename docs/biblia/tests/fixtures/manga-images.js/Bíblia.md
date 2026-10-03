# Bíblia técnica — tests/fixtures/manga-images.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** cc4b67fe92fc3b44d812d1d13b3a771f29fdf11b  
> **Agente responsável:** AGENTE 18  
> **Tipo:** fixture Node.js — gerador determinístico de PNGs E2E  
> **Linhas textuais:** 136  
> **Posições documentais:** 137, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é a fonte única em código para os PNGs usados pelo ambiente E2E. Ele não guarda imagens binárias versionadas: constrói buffers PNG válidos em memória, oferece sete imagens nomeadas por meio de PNG_IMAGES e também permite materializar exatamente esses buffers em tests/fixtures/manga-images/.

A responsabilidade é deliberadamente de infraestrutura de teste. O módulo não toca a extensão Chromium, não usa DOM, Chrome API, rede, Playwright ou IndexedDB. Seus efeitos surgem em dois momentos:

1. no require, quando os sete buffers são gerados avidamente;
2. quando writeImagesToDisk é chamado, quando diretório e arquivos são escritos sincronamente.

README.md:116 e docs/Documentação.md:2199 descrevem este arquivo como a fonte determinística/única dos PNGs E2E. A implementação observada confirma esse desenho: tanto o servidor mock quanto o script de preparo importam o mesmo Map.

## 2. Chamadores, consumidores e wiring

### Consumidores diretos

- tests/fixtures/gemini-mock-server.js:31 importa PNG_IMAGES e writeImagesToDisk;
- gemini-mock-server.js:499 materializa as fixtures no diretório manga-images;
- gemini-mock-server.js:574-586 escolhe translated_result_0/1/default e envia o Buffer com Content-Type image/png;
- gemini-mock-server.js:612-624 atende /manga-images/<arquivo> diretamente a partir de PNG_IMAGES;
- tests/setup/create-test-images.js:4 importa o Map e o writer;
- create-test-images.js:7 chama writeImagesToDisk;
- create-test-images.js:9-12 usa o Map para imprimir o tamanho de cada buffer escrito.

### Entrada no E2E

- package.json:19 define pretest:e2e = npm run test:images;
- package.json:21 define pretest:e2e:group = npm run test:images;
- package.json:24 define test:images = node tests/setup/create-test-images.js;
- package.json:25 expõe mock:server;
- playwright.config.js:50-53 inicia tests/fixtures/gemini-mock-server.js como webServer;
- scripts/validation/verify-ci-contract.js:375-379 exige que os dois pretests chamem test:images.

O gate estático protege a indirection pretest → test:images, mas não foi localizada assertion focal que valide os bytes produzidos por este módulo.

### HTML que referencia as fixtures

tests/fixtures/manga-page.html referencia:

- linha 82: page_001.png;
- linha 88: page_002.png;
- linha 94: avatar.png;
- linha 96: banner.png.

O servidor não lê esses quatro PNGs do disco; ele resolve o basename da URL e responde com PNG_IMAGES. Portanto, no caminho normal do Playwright, a fonte efetiva é o Map em memória.

## 3. Contrato binário PNG

### 3.1 CRC-32

crc32 implementa CRC-32 refletido com:

- inicial 0xFFFFFFFF;
- XOR por byte;
- oito passos por byte;
- polinômio 0xEDB88320 quando o bit menos significativo está ligado;
- XOR final 0xFFFFFFFF;
- coerção unsigned por >>> 0.

A função é interna, não exportada. O CRC é calculado sobre type + data de cada chunk, conforme a estrutura PNG.

### 3.2 Chunks

chunk(type, data) produz:

1. 4 bytes: comprimento de data em big-endian;
2. 4 bytes: type ASCII;
3. N bytes: data;
4. 4 bytes: CRC-32(type + data).

Não há validação explícita de que type tenha exatamente quatro caracteres. Todos os chamadores internos usam IHDR, IDAT e IEND corretamente.

### 3.3 IHDR

pngHeader(width, height) cria os 13 bytes de IHDR:

- width uint32 BE;
- height uint32 BE;
- bit depth = 8;
- color type = 2, RGB truecolor;
- compression = 0;
- filter method = 0;
- interlace = 0.

Os três últimos valores permanecem zero porque Buffer.alloc inicializa os bytes restantes com zero.

### 3.4 IDAT e scanlines

assemblePng concatena as scanlines cruas e usa zlib.deflateSync(..., { level: 1 }). O nível 1 favorece velocidade de preparação em detrimento de compressão máxima, coerente com fixtures temporárias.

Cada scanline criada neste módulo começa por byte 0, ou seja, filtro PNG None. Depois vêm exatamente width × 3 bytes RGB.

### 3.5 Arquivo final

A ordem emitida é:

assinatura PNG → IHDR → IDAT → IEND.

IEND recebe Buffer.alloc(0), portanto seu comprimento é zero e seu CRC ainda é calculado normalmente pelo helper chunk.

## 4. Geradores de imagem

### buildPng(width, height, [r,g,b])

Gera imagem sólida. Uma única scanline é montada e depois referenciada height vezes no array entregue a Buffer.concat. Isso é seguro no fluxo atual porque a linha não é mutada depois da construção; Buffer.concat copia os bytes para raw.

Não há validação própria de dimensões nem canais. Valores inválidos ficam sujeitos às regras/erros de Buffer e writeUInt32BE do Node.

### buildPanelPng(width, height, palette)

Divide verticalmente a imagem em três zonas e sobrepõe uma faixa no miolo:

- top: y < floor(height × 0,14);
- bottom: y >= floor(height × 0,84);
- main: demais linhas;
- stripe: x de floor(width × 0,68) até floor(width × 0,80), inclusivo, apenas quando y > topLimit e y < bottomLimit.

Para 800×1200:

- topLimit = 168;
- bottomLimit = 1008;
- stripeStart = 544;
- stripeEnd = 640;
- topo efetivo: y 0..167;
- linha y=168 fica main e sem stripe;
- stripe vertical: y 169..1007;
- base: y 1008..1199;
- largura da stripe: 97 pixels, porque ambos os extremos são inclusivos.

A ordem das condições é material: stripe substitui main somente no miolo e nunca substitui top/bottom.

## 5. Catálogo exato das sete fixtures

| Chave | Gerador | Dimensão | Função visual |
|---|---|---:|---|
| page_001.png | buildPanelPng | 800×1200 | página manga vermelha, original 1 |
| page_002.png | buildPanelPng | 800×1200 | página manga azul, original 2 |
| avatar.png | buildPng | 48×48 | imagem pequena que deve ficar fora da seleção de páginas |
| banner.png | buildPng | 960×120 | banner horizontal que deve ficar fora da seleção |
| translated_result_0.png | buildPanelPng | 800×1200 | resposta traduzida do job 0 |
| translated_result_1.png | buildPanelPng | 800×1200 | resposta traduzida do job 1 |
| translated_result_default.png | buildPanelPng | 800×1200 | fallback para jobIndex diferente de 0/1 |

A ordem de inserção no Map também é a ordem usada por writeImagesToDisk e pela lista retornada.

As paletas são literais do fonte. Elas tornam os originais e resultados visualmente distintos sem depender de assets externos. Não existe assertion automatizada focal que compare pixels ou cores exatas.

## 6. Fluxo real no Playwright

O caminho principal é:

1. Playwright inicia gemini-mock-server.js;
2. o require de manga-images.js constrói PNG_IMAGES;
3. o servidor chama writeImagesToDisk no bootstrap;
4. manga-page.html aponta para /manga-images/page_001.png e page_002.png;
5. o servidor resolve essas URLs diretamente no Map em memória;
6. o content script encontra as páginas e dispara tradução;
7. o mock Gemini responde /gemini-result-image com translated_result_0/1/default;
8. a extensão converte o resultado para data:image/png;base64 e substitui as imagens.

tests/e2e/translation-flow.spec.js:184-190 aguarda duas imagens page_* com naturalWidth >= 300 e naturalHeight >= 400. Isso é uma assertion funcional direta de que, no caminho real, page_001/page_002 são decodificáveis pelo Chromium e possuem dimensão natural suficiente para o filtro.

O mesmo teste, linhas 219-233, exige:

- as duas páginas marcadas data-translated=true;
- src de ambas convertido para data:image/png;base64;
- resultado 0 diferente do resultado 1;
- avatar e banner permanecendo sem data-translated.

tests/e2e/cache-and-storage.spec.js:251-260 também exige que as páginas traduzidas persistidas sejam data:image/png;base64 e que o restoreIndex preserve as URLs originais page_001/page_002.

Essas provas cobrem o uso integrado das fixtures, mas não equivalem a teste unitário de CRC, layout dos chunks, paletas, limites de stripe ou writer de disco.

## 7. Side effects, determinismo e custo

### Ao importar

PNG_IMAGES é criado imediatamente. Isso chama buildPanelPng cinco vezes e buildPng duas vezes. Logo, require não é lazy.

Para cada painel 800×1200, antes da compressão são construídos cerca de 2,88 MB de bytes de scanline RGB mais overhead dos Buffers/arrays. A intenção é fixture de teste e o level 1 do zlib limita o custo de compressão.

### Ao escrever

writeImagesToDisk:

- cria targetDir com recursive:true;
- sobrescreve sincronamente os sete nomes;
- não usa arquivo temporário/rename;
- não faz rollback;
- não remove arquivos extras/stale já presentes;
- retorna somente os sete nomes canônicos atuais.

Falha de mkdir/write propaga como exceção; não há catch local.

### Determinismo

Para as constantes atuais, o conteúdo lógico de pixels é determinístico e não depende de relógio, aleatoriedade, rede ou filesystem. O módulo não declara contrato de hash binário estável entre versões diferentes de Node/zlib; seu contrato observado é gerar PNGs válidos com o conteúdo definido.

## 8. Casos-limite e riscos

1. buildPng/buildPanelPng são exportados, mas nenhum consumidor externo foi localizado no corpus atual.
2. Não há validação explícita de width/height/palette antes de Buffer.alloc/writeUInt32BE.
3. Canais fora de 0..255 ficam sujeitos à coerção do Buffer, não a erro semântico próprio.
4. palette ausente ou incompleta falha em runtime ao acessar as posições esperadas.
5. writeImagesToDisk pode deixar conjunto parcial se uma escrita intermediária falhar.
6. Arquivos antigos não pertencentes ao Map não são removidos do diretório.
7. O servidor normal serve imagens do Map, não do disco; portanto E2E verde não prova que todos os arquivos materializados no disco são byte a byte idênticos ao Map.
8. A correctness do CRC/chunk é inferida do fato de Chromium aceitar as fixtures atuais, mas não há vector test do algoritmo.
9. O limite de stripe usa comparações inclusivas em x e estritas em y; mudança de um operador altera pixels de fronteira sem necessariamente quebrar o E2E atual.

## 9. Matriz de evidência automatizada

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| pretest:e2e chama test:images | package.json:19 + verify-ci-contract.js:375-377 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| pretest:e2e:group chama test:images | package.json:21 + verify-ci-contract.js:378-380 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| test:images executa create-test-images.js | package.json:24 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Playwright usa gemini-mock-server.js | playwright.config.js:50-53 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| servidor importa este Map e writer | gemini-mock-server.js:31 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| page_001/page_002 são PNGs que Chromium decodifica acima de 300×400 | translation-flow.spec.js:184-190 | ✅ PROVADO DIRETAMENTE |
| fluxo real produz duas data URLs PNG traduzidas distintas | translation-flow.spec.js:219-229 | ✅ PROVADO DIRETAMENTE |
| avatar/banner não são marcados traduzidos no cenário principal | translation-flow.spec.js:230-233 | ✅ PROVADO DIRETAMENTE |
| URLs originais page_001/page_002 entram no restoreIndex | cache-and-storage.spec.js:251-260 | ✅ PROVADO DIRETAMENTE |
| writer é chamado no bootstrap do mock | gemini-mock-server.js:499 | 🟨 EXECUTADO INDIRETAMENTE |
| PNG_IMAGES atende /manga-images/* | gemini-mock-server.js:612-624 + E2E | 🟨 EXECUTADO INDIRETAMENTE |
| translated_result_0/1/default é escolhido por jobIndex | gemini-mock-server.js:574-586 | 🟨 EXECUTADO INDIRETAMENTE |
| CRC-32 bate vetores conhecidos | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| chunk possui length/type/data/CRC exatos | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| IHDR exato 800×1200 / 48×48 / 960×120 | nenhum parser/assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| cores e fronteiras top/main/bottom/stripe são exatas | nenhum teste de pixels localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Map contém exatamente sete chaves na ordem esperada | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| writeImagesToDisk grava bytes idênticos ao Map | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| default targetDir e lista retornada são corretos | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| inputs inválidos falham de modo definido | nenhum contrato/teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falha intermediária de escrita não deixa conjunto parcial | não há atomicidade/rollback | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Solicitações ao auditor

### 096-001 — TEST_REQUIRED — OPEN

**Encontrado:** os E2E exercitam PNGs reais e provam propriedades integradas importantes, mas não existe suíte focal para as primitivas binárias nem para a materialização.

**Arquivo auditado:** tests/fixtures/manga-images.js.

**Arquivo externo sugerido:** tests/unit/fixtures/manga-images.test.js, se aprovado pelo auditor.

**Evidência atual:** translation-flow.spec.js prova que page_001/page_002 carregam no Chromium acima do filtro mínimo e que resultados reais se tornam data URLs PNG distintas; o servidor e o pretest executam o módulo.

**Evidência ausente:** vetores CRC-32, layout length/type/data/CRC, parser de IHDR, dimensões exatas das sete imagens, pixels/fronteiras das paletas, conjunto/ordem do Map, bytes gravados em diretório temporário e retorno do writer.

**Por que é necessária:** uma regressão de baixo nível pode alterar bytes, dimensões, cores ou persistência sem afetar imediatamente as assertions funcionais atuais.

**Ação solicitada:** adicionar teste separado que importe a implementação real, use diretório temporário e faça parse mínimo dos PNGs ou decoder apropriado, sem duplicar o algoritmo como “prova”.

**Evidência esperada:** assertions diretas sobre estrutura/CRC/dimensões/pixels-chave, sete chaves, paridade Map↔disco e lista retornada.

**Ação esperada do auditor:** confirmar o escopo útil da cobertura e criar a alteração de testes fora desta Bíblia.

**Possível regressão:** fixtures aparentemente “presentes” podem mudar de forma silenciosa e alterar filtros/roteamento E2E.

**Severidade:** NORMAL.

### 096-002 — CONTRACT_REVIEW — OPEN

**Encontrado:** buildPng e buildPanelPng são exportados, mas não validam dimensões, canais RGB nem shape de palette; nenhum consumidor externo desses builders foi localizado no corpus atual.

**Arquivo relacionado:** tests/fixtures/manga-images.js.

**Evidência atual:** linhas 49-85 aceitam argumentos diretamente; linhas 133-134 tornam os builders públicos no CommonJS.

**Evidência ausente:** contrato explícito dizendo se são helpers internos confiáveis ou API reutilizável que deve rejeitar entradas inválidas de forma definida.

**Por que é necessária:** novos testes podem começar a reutilizar os exports e depender acidentalmente de coerções/RangeErrors internos do Buffer.

**Ação solicitada:** decidir o contrato. Se os builders forem API suportada, adicionar validação e regressões em mudança separada; se forem internal-only apesar do export, documentar essa restrição e cobrir ao menos os inputs canônicos.

**Evidência esperada:** teste/contrato explícito para domínio aceito de width, height, RGB e palette.

**Ação esperada do auditor:** classificar como contrato interno confiável ou solicitar robustez adicional.

**Possível regressão:** entradas anômalas podem gerar erro de baixo nível, pixels truncados/coagidos ou consumo de memória inesperado.

**Severidade:** NORMAL.

### 096-003 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** writeImagesToDisk escreve sete arquivos sequencialmente, não remove stale files e não possui rollback/rename de conjunto.

**Arquivo relacionado:** tests/fixtures/manga-images.js e tests/setup/create-test-images.js.

**Evidência atual:** linhas 123-128 implementam mkdir + writeFileSync em loop; o servidor normal serve o Map em memória.

**Evidência ausente:** teste de falha em escrita intermediária, decisão sobre limpeza de arquivos extras e prova de que consumidores de disco nunca enumeram/aceitam stale fixtures.

**Por que é necessária:** um diretório persistente pode conter arquivos antigos ou ficar parcialmente atualizado após erro, enquanto parte do E2E continua verde por usar buffers em memória.

**Ação solicitada:** confirmar se best-effort overwrite é suficiente para a fixture; se não, implementar limpeza/estratégia atômica em alteração separada com regressão.

**Evidência esperada:** cenário controlado com stale file e/ou falha de segunda escrita, seguido da política esperada.

**Ação esperada do auditor:** aceitar formalmente o risco ou abrir correção funcional separada.

**Possível regressão:** consumidores futuros que leiam/enumerem o diretório podem observar conjunto diferente do Map canônico.

**Severidade:** NORMAL.

## 11. Fonte integral auditada

~~~javascript
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.from(type, 'ascii');
  const inner = Buffer.concat([header, data]);
  const out = Buffer.alloc(4 + inner.length + 4);
  out.writeUInt32BE(data.length, 0);
  inner.copy(out, 4);
  out.writeUInt32BE(crc32(inner), 4 + inner.length);
  return out;
}

function pngHeader(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return ihdr;
}

function assemblePng(width, height, rows) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 1 });
  return Buffer.concat([
    signature,
    chunk('IHDR', pngHeader(width, height)),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  return assemblePng(width, height, Array.from({ length: height }, () => row));
}

function buildPanelPng(width, height, palette) {
  const rows = [];
  const topLimit = Math.floor(height * 0.14);
  const bottomLimit = Math.floor(height * 0.84);
  const stripeStart = Math.floor(width * 0.68);
  const stripeEnd = Math.floor(width * 0.8);

  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      let color = palette.main;
      if (y < topLimit) color = palette.top;
      else if (y >= bottomLimit) color = palette.bottom;
      if (x >= stripeStart && x <= stripeEnd && y > topLimit && y < bottomLimit) {
        color = palette.stripe;
      }
      row[1 + x * 3] = color[0];
      row[1 + x * 3 + 1] = color[1];
      row[1 + x * 3 + 2] = color[2];
    }
    rows.push(row);
  }

  return assemblePng(width, height, rows);
}

// Fonte única das imagens E2E. O servidor e o preparo de fixtures importam este Map.
const PNG_IMAGES = new Map([
  ['page_001.png', buildPanelPng(800, 1200, {
    top: [70, 12, 12],
    main: [184, 44, 44],
    bottom: [230, 122, 122],
    stripe: [255, 242, 242],
  })],
  ['page_002.png', buildPanelPng(800, 1200, {
    top: [10, 34, 87],
    main: [41, 98, 255],
    bottom: [118, 185, 255],
    stripe: [255, 232, 108],
  })],
  ['avatar.png', buildPng(48, 48, [100, 200, 100])],
  ['banner.png', buildPng(960, 120, [220, 180, 50])],
  ['translated_result_0.png', buildPanelPng(800, 1200, {
    top: [16, 85, 62],
    main: [29, 158, 94],
    bottom: [125, 220, 150],
    stripe: [235, 255, 242],
  })],
  ['translated_result_1.png', buildPanelPng(800, 1200, {
    top: [74, 20, 140],
    main: [144, 73, 255],
    bottom: [236, 157, 255],
    stripe: [255, 239, 120],
  })],
  ['translated_result_default.png', buildPanelPng(800, 1200, {
    top: [34, 78, 120],
    main: [72, 165, 214],
    bottom: [180, 232, 255],
    stripe: [255, 255, 255],
  })],
]);

function writeImagesToDisk(targetDir = path.join(__dirname, 'manga-images')) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const [file, buf] of PNG_IMAGES) {
    fs.writeFileSync(path.join(targetDir, file), buf);
  }
  return [...PNG_IMAGES.keys()];
}

module.exports = {
  PNG_IMAGES,
  buildPng,
  buildPanelPng,
  writeImagesToDisk,
};
~~~

## 12. Mapa linha por linha

| Linha | Função técnica | Evidência | Fonte |
|---:|---|---|---|
| 1 | ativa strict mode do módulo CommonJS | estrutural | `'use strict';` |
| 2 | separador | estrutural | — |
| 3 | importa fs para mkdir/write síncronos | estrutural | `const fs = require('fs');` |
| 4 | importa path para compor o diretório de fixtures | estrutural | `const path = require('path');` |
| 5 | importa zlib para DEFLATE do IDAT | estrutural | `const zlib = require('zlib');` |
| 6 | separador | estrutural | — |
| 7 | declara cálculo CRC-32 para chunks PNG | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `function crc32(buf) {` |
| 8 | inicializa CRC com 0xFFFFFFFF | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  let c = 0xFFFFFFFF;` |
| 9 | itera cada byte do buffer | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  for (let i = 0; i < buf.length; i += 1) {` |
| 10 | mistura o byte atual no acumulador | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `    c ^= buf[i];` |
| 11 | itera os 8 bits do byte | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `    for (let j = 0; j < 8; j += 1) {` |
| 12 | aplica passo refletido do polinômio CRC-32 0xEDB88320 | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);` |
| 13 | fecha loop de bits | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `    }` |
| 14 | fecha loop de bytes | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  }` |
| 15 | aplica XOR final e força unsigned de 32 bits | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  return (c ^ 0xFFFFFFFF) >>> 0;` |
| 16 | fecha crc32 | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `}` |
| 17 | separador | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | — |
| 18 | declara construtor genérico de chunk PNG | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `function chunk(type, data) {` |
| 19 | codifica o tipo de 4 caracteres em ASCII | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  const header = Buffer.from(type, 'ascii');` |
| 20 | concatena tipo+dados, domínio coberto pelo CRC | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  const inner = Buffer.concat([header, data]);` |
| 21 | aloca tamanho PNG do chunk: length + type/data + CRC | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  const out = Buffer.alloc(4 + inner.length + 4);` |
| 22 | grava comprimento dos dados em big-endian | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  out.writeUInt32BE(data.length, 0);` |
| 23 | copia tipo e payload após o campo length | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  inner.copy(out, 4);` |
| 24 | grava CRC de tipo+dados em big-endian | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  out.writeUInt32BE(crc32(inner), 4 + inner.length);` |
| 25 | retorna buffer completo do chunk | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  return out;` |
| 26 | fecha chunk | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `}` |
| 27 | separador | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | — |
| 28 | declara gerador do payload IHDR | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `function pngHeader(width, height) {` |
| 29 | aloca 13 bytes zerados do IHDR | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  const ihdr = Buffer.alloc(13);` |
| 30 | grava largura uint32 big-endian | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  ihdr.writeUInt32BE(width, 0);` |
| 31 | grava altura uint32 big-endian | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  ihdr.writeUInt32BE(height, 4);` |
| 32 | define bit depth 8 | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  ihdr[8] = 8;` |
| 33 | define color type 2 (RGB truecolor); bytes restantes ficam 0 | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  ihdr[9] = 2;` |
| 34 | retorna payload IHDR | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `  return ihdr;` |
| 35 | fecha pngHeader | 🟨 exercitado por PNGs reais; sem teste focal da primitiva | `}` |
| 36 | separador | estrutural | — |
| 37 | declara montagem final do PNG | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `function assemblePng(width, height, rows) {` |
| 38 | materializa assinatura PNG padrão de 8 bytes | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);` |
| 39 | concatena todas as scanlines sem compressão | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const raw = Buffer.concat(rows);` |
| 40 | comprime scanlines por zlib/DEFLATE level 1 | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const compressed = zlib.deflateSync(raw, { level: 1 });` |
| 41 | inicia concatenação do arquivo PNG | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  return Buffer.concat([` |
| 42 | insere assinatura | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    signature,` |
| 43 | insere IHDR com dimensões | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    chunk('IHDR', pngHeader(width, height)),` |
| 44 | insere IDAT comprimido | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    chunk('IDAT', compressed),` |
| 45 | insere IEND vazio | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    chunk('IEND', Buffer.alloc(0)),` |
| 46 | fecha lista de buffers | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  ]);` |
| 47 | fecha assemblePng | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `}` |
| 48 | separador | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | — |
| 49 | declara gerador de PNG sólido RGB | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `function buildPng(width, height, [r, g, b]) {` |
| 50 | aloca uma scanline: 1 byte de filtro + 3 bytes por pixel | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const row = Buffer.alloc(1 + width * 3);` |
| 51 | define filtro PNG 0 (None) | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  row[0] = 0;` |
| 52 | itera pixels horizontais | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  for (let x = 0; x < width; x += 1) {` |
| 53 | grava canal R | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    row[1 + x * 3] = r;` |
| 54 | grava canal G | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    row[1 + x * 3 + 1] = g;` |
| 55 | grava canal B | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    row[1 + x * 3 + 2] = b;` |
| 56 | fecha loop horizontal | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  }` |
| 57 | repete a mesma scanline imutável por height linhas e monta o PNG | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  return assemblePng(width, height, Array.from({ length: height }, () => row));` |
| 58 | fecha buildPng | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `}` |
| 59 | separador | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | — |
| 60 | declara gerador de painel multirregião | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `function buildPanelPng(width, height, palette) {` |
| 61 | inicializa lista de scanlines | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const rows = [];` |
| 62 | calcula limite superior em floor(14% da altura) | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const topLimit = Math.floor(height * 0.14);` |
| 63 | calcula início inferior em floor(84% da altura) | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const bottomLimit = Math.floor(height * 0.84);` |
| 64 | calcula início da faixa em floor(68% da largura) | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const stripeStart = Math.floor(width * 0.68);` |
| 65 | calcula fim inclusivo da faixa em floor(80% da largura) | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  const stripeEnd = Math.floor(width * 0.8);` |
| 66 | separador | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | — |
| 67 | itera coordenadas y | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  for (let y = 0; y < height; y += 1) {` |
| 68 | aloca scanline RGB | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    const row = Buffer.alloc(1 + width * 3);` |
| 69 | define filtro 0 | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    row[0] = 0;` |
| 70 | itera coordenadas x | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    for (let x = 0; x < width; x += 1) {` |
| 71 | começa cada pixel com palette.main | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      let color = palette.main;` |
| 72 | troca para palette.top acima do limite superior | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      if (y < topLimit) color = palette.top;` |
| 73 | troca para palette.bottom a partir do limite inferior | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      else if (y >= bottomLimit) color = palette.bottom;` |
| 74 | testa faixa vertical inclusiva somente no miolo, excluindo fronteiras y | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      if (x >= stripeStart && x <= stripeEnd && y > topLimit && y < bottomLimit) {` |
| 75 | troca a cor para palette.stripe | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `        color = palette.stripe;` |
| 76 | fecha condição da faixa | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      }` |
| 77 | grava R da cor escolhida | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      row[1 + x * 3] = color[0];` |
| 78 | grava G da cor escolhida | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      row[1 + x * 3 + 1] = color[1];` |
| 79 | grava B da cor escolhida | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `      row[1 + x * 3 + 2] = color[2];` |
| 80 | fecha loop x | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    }` |
| 81 | acumula a scanline | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `    rows.push(row);` |
| 82 | fecha loop y | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  }` |
| 83 | separador | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | — |
| 84 | monta PNG com todas as linhas | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `  return assemblePng(width, height, rows);` |
| 85 | fecha buildPanelPng | 🟨 exercitado pelos E2E; sem assertion focal da primitiva | `}` |
| 86 | separador | estrutural | — |
| 87 | declara a intenção arquitetural de fonte única E2E | 🟨 executado/consumido indiretamente | `// Fonte única das imagens E2E. O servidor e o preparo de fixtures importam este Map.` |
| 88 | cria Map e gera os buffers avidamente no require | 🟨 executado/consumido indiretamente | `const PNG_IMAGES = new Map([` |
| 89 | abre entrada page_001.png em 800×1200 | 🟨 executado/consumido indiretamente | `  ['page_001.png', buildPanelPng(800, 1200, {` |
| 90 | define topo vermelho-escuro de page_001 | estrutural | `    top: [70, 12, 12],` |
| 91 | define corpo vermelho de page_001 | estrutural | `    main: [184, 44, 44],` |
| 92 | define base vermelho-claro de page_001 | estrutural | `    bottom: [230, 122, 122],` |
| 93 | define faixa quase branca de page_001 | estrutural | `    stripe: [255, 242, 242],` |
| 94 | fecha entrada page_001 | estrutural | `  })],` |
| 95 | abre entrada page_002.png em 800×1200 | 🟨 executado/consumido indiretamente | `  ['page_002.png', buildPanelPng(800, 1200, {` |
| 96 | define topo azul-escuro de page_002 | estrutural | `    top: [10, 34, 87],` |
| 97 | define corpo azul de page_002 | estrutural | `    main: [41, 98, 255],` |
| 98 | define base azul-claro de page_002 | estrutural | `    bottom: [118, 185, 255],` |
| 99 | define faixa amarela de page_002 | estrutural | `    stripe: [255, 232, 108],` |
| 100 | fecha entrada page_002 | estrutural | `  })],` |
| 101 | gera avatar.png sólido 48×48 verde | 🟨 executado/consumido indiretamente | `  ['avatar.png', buildPng(48, 48, [100, 200, 100])],` |
| 102 | gera banner.png sólido 960×120 dourado | 🟨 executado/consumido indiretamente | `  ['banner.png', buildPng(960, 120, [220, 180, 50])],` |
| 103 | abre translated_result_0.png em 800×1200 | 🟨 executado/consumido indiretamente | `  ['translated_result_0.png', buildPanelPng(800, 1200, {` |
| 104 | define topo verde-escuro do resultado 0 | estrutural | `    top: [16, 85, 62],` |
| 105 | define corpo verde do resultado 0 | estrutural | `    main: [29, 158, 94],` |
| 106 | define base verde-claro do resultado 0 | estrutural | `    bottom: [125, 220, 150],` |
| 107 | define faixa quase branca do resultado 0 | estrutural | `    stripe: [235, 255, 242],` |
| 108 | fecha resultado 0 | estrutural | `  })],` |
| 109 | abre translated_result_1.png em 800×1200 | 🟨 executado/consumido indiretamente | `  ['translated_result_1.png', buildPanelPng(800, 1200, {` |
| 110 | define topo roxo-escuro do resultado 1 | estrutural | `    top: [74, 20, 140],` |
| 111 | define corpo roxo do resultado 1 | estrutural | `    main: [144, 73, 255],` |
| 112 | define base magenta-clara do resultado 1 | estrutural | `    bottom: [236, 157, 255],` |
| 113 | define faixa amarela do resultado 1 | estrutural | `    stripe: [255, 239, 120],` |
| 114 | fecha resultado 1 | estrutural | `  })],` |
| 115 | abre translated_result_default.png em 800×1200 | 🟨 executado/consumido indiretamente | `  ['translated_result_default.png', buildPanelPng(800, 1200, {` |
| 116 | define topo azul-petróleo do fallback | estrutural | `    top: [34, 78, 120],` |
| 117 | define corpo azul-claro do fallback | estrutural | `    main: [72, 165, 214],` |
| 118 | define base azul muito clara do fallback | estrutural | `    bottom: [180, 232, 255],` |
| 119 | define faixa branca do fallback | estrutural | `    stripe: [255, 255, 255],` |
| 120 | fecha resultado fallback | estrutural | `  })],` |
| 121 | fecha o Map de sete fixtures | 🟨 executado/consumido indiretamente | `]);` |
| 122 | separador | estrutural | — |
| 123 | declara materialização em disco com diretório default tests/fixtures/manga-images | 🟨 executado/consumido indiretamente | `function writeImagesToDisk(targetDir = path.join(__dirname, 'manga-images')) {` |
| 124 | cria o diretório recursivamente | 🟨 executado/consumido indiretamente | `  fs.mkdirSync(targetDir, { recursive: true });` |
| 125 | itera Map na ordem de inserção | 🟨 executado/consumido indiretamente | `  for (const [file, buf] of PNG_IMAGES) {` |
| 126 | sobrescreve cada arquivo com seu Buffer atual | 🟨 executado/consumido indiretamente | `    fs.writeFileSync(path.join(targetDir, file), buf);` |
| 127 | fecha loop de escrita | estrutural | `  }` |
| 128 | retorna lista nova dos sete nomes na ordem do Map | 🟨 executado/consumido indiretamente | `  return [...PNG_IMAGES.keys()];` |
| 129 | fecha writeImagesToDisk | estrutural | `}` |
| 130 | separador | estrutural | — |
| 131 | abre exports CommonJS | 🟨 executado/consumido indiretamente | `module.exports = {` |
| 132 | exporta o Map pronto | 🟨 executado/consumido indiretamente | `  PNG_IMAGES,` |
| 133 | exporta buildPng | 🟨 executado/consumido indiretamente | `  buildPng,` |
| 134 | exporta buildPanelPng | 🟨 executado/consumido indiretamente | `  buildPanelPng,` |
| 135 | exporta writeImagesToDisk | 🟨 executado/consumido indiretamente | `  writeImagesToDisk,` |
| 136 | fecha exports | 🟨 executado/consumido indiretamente | `};` |
| 137 | newline final do blob | 🟦 leitura integral do blob | — |

## 13. Unidades semânticas

### U01 — linhas 1–5 — bootstrap Node

Ativa strict mode e carrega apenas módulos built-in. O arquivo pode ser usado sem dependência npm adicional.

### U02 — linhas 7–16 — CRC-32

Implementa a primitiva de integridade usada por todos os chunks. Não existe export nem teste focal; a aceitação dos PNGs atuais pelo navegador é evidência integrada, não um vector test do CRC.

### U03 — linhas 18–35 — serialização de chunk/IHDR

Modela a estrutura binária mínima necessária para PNG truecolor não interlaçado. A alocação zerada do IHDR é funcionalmente importante porque completa compression/filter/interlace com zero.

### U04 — linhas 37–47 — container PNG

Comprime o stream de scanlines e ordena os quatro componentes do arquivo. IEND vazio passa pelo mesmo cálculo de CRC.

### U05 — linhas 49–58 — imagem sólida

Otimiza uma imagem uniforme construindo uma única linha e reutilizando sua referência até Buffer.concat copiar os bytes.

### U06 — linhas 60–85 — imagem em painel

Cria padrões cromáticos grandes e facilmente distinguíveis. As comparações exatas nas fronteiras são parte do comportamento atual e não estão congeladas por teste de pixels.

### U07 — linhas 87–121 — catálogo canônico

Gera avidamente sete buffers. Nomes e ordem funcionam como contrato entre HTML, servidor mock, tradução simulada e materialização.

### U08 — linhas 123–129 — persistência

Materializa o mesmo Map em disco. A operação é síncrona e simples, mas não transacional nem “mirror clean”.

### U09 — linhas 131–136 — superfície exportada

Expõe o Map, dois builders e o writer. As primitivas crc32/chunk/pngHeader/assemblePng permanecem privadas.

### U10 — posição 137 — newline final

O blob termina com newline; por isso há 136 linhas textuais e 137 posições documentais.

## 14. Invariantes que mudanças futuras devem preservar

1. O servidor e o preparador devem continuar consumindo uma fonte única de buffers.
2. page_001 e page_002 precisam continuar sendo imagens grandes/decodificáveis para atravessar o filtro de página.
3. avatar e banner precisam continuar representando geometrias que não sejam páginas de manga.
4. translated_result_0 e translated_result_1 precisam permanecer distinguíveis para que jobs não colapsem no mesmo resultado.
5. Um job fora de 0/1 precisa ter fallback disponível.
6. Todos os PNGs precisam conter assinatura, IHDR, IDAT e IEND coerentes.
7. Cada scanline RGB precisa manter byte de filtro.
8. O writer deve gravar exatamente os buffers do Map, sem gerador paralelo divergente.
9. A ordem retornada pelo writer acompanha a ordem do Map enquanto consumidores dependerem disso.
10. Erros de filesystem não devem ser mascarados como sucesso.
11. A Bíblia é válida somente para o blob cc4b67fe92fc3b44d812d1d13b3a771f29fdf11b.
12. Ausência de teste focal deve continuar classificada como lacuna até existir assertion específica.

## 15. Autoauditoria do AGENTE 18

- [x] reserva exclusiva criada com CREATE ONLY;
- [x] reserva relida e proprietário confirmado como AGENTE 18;
- [x] SHA do fonte reconfirmado antes da escrita;
- [x] nenhum código, teste, fixture, workflow ou arquivo global foi modificado;
- [x] fonte integral incorporada;
- [x] 136 linhas textuais + newline = 137 posições documentadas;
- [x] chamadores, consumidores e efeitos colaterais rastreados;
- [x] comportamento binário PNG explicado;
- [x] E2E direto separado de gates estáticos, execução indireta e ausência de prova;
- [x] lacunas externas registradas como audit_requests;
- [x] nenhum teste foi criado ou alterado para fabricar evidência.

**Resultado:** documentação concluída para o blob cc4b67fe92fc3b44d812d1d13b3a771f29fdf11b. As solicitações 096-001, 096-002 e 096-003 permanecem OPEN para processo auditor separado.

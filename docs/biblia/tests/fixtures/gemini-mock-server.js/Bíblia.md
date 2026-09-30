# Bíblia técnica — tests/fixtures/gemini-mock-server.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `1cd13486bf3a6c1a3d5d4b645e5564be108d6ad4`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** fixture/servidor HTTP local para Playwright E2E  
> **Linhas textuais:** 632  
> **Posições documentais:** 633, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/fixtures/gemini-mock-server.js` é a infraestrutura HTTP local que fornece, na porta fixa `3999`, dois mundos usados pelos testes E2E: uma página de mangá com imagens PNG determinísticas e uma interface controlada que emula as partes do Gemini necessárias ao fluxo da extensão.

O arquivo não tenta reproduzir o produto Gemini inteiro. Ele constrói um DOM mínimo e estável com os seletores, estados e transições necessários para exercitar `content_gemini.js`, `background.js` e `content_manga.js`: attachment por paste/drop, submissão, estado de geração, imagem de resposta, conversa identificável, menu de exclusão e variantes de DOM usadas por regressões.

A decisão central é servir PNGs binários reais a partir de `PNG_IMAGES`, produzido por `tests/fixtures/manga-images.js`. O comentário inicial registra por que isso existe: fixtures inválidas ou SVGs sem dimensões intrínsecas já fizeram o Chromium reportar `naturalWidth = 0`. A implementação atual evita depender da decodificação de arquivos artificiais e mantém a mesma fonte para memória e materialização em disco.

Além do caminho feliz, o mock possui chaves de query string que injetam condições adversas determinísticas: falha de attachment, barreira FIFO, resultado instantâneo, submit ignorado, clone do input, imagem órfã, Shadow DOM e container alternativo do assistant.

## 2. Chamadores, consumidores e dependências

### 2.1 Inicialização

- `playwright.config.js:50-54` configura `webServer.command` para executar este arquivo com `process.execPath`, porta `3999` e `reuseExistingServer: true`.
- `package.json:20` executa Playwright com esse config em `test:e2e`.
- `package.json:22` delega grupos E2E ao runner, que por sua vez usa o mesmo config.
- `package.json:25` expõe execução manual por `npm run mock:server`.
- `package.json:19,21` prepara imagens antes dos E2E por `npm run test:images`; o próprio servidor também chama `writeImagesToDisk` ao iniciar.

### 2.2 Consumidores E2E principais

`tests/e2e/translation-flow.spec.js` é o consumidor mais forte. Ele usa:
- `/manga-page.html` e `/manga-images/*` no fluxo ponta a ponta;
- `/gemini/` e `/app/mock-chat` como destinos da automação Gemini;
- `attachmentFails=1` para provar que o submit não ocorre quando o attachment não confirma;
- `attachmentBarrierId`, `generationDelayMs=0` e `resultImageDelayMs=0` no teste FIFO A→G;
- `fastResult=1` para produzir resposta no mesmo instante lógico do submit;
- `shadowResult=1&relaxedResultContainer=1` para o DOM moderno/Shadow DOM;
- `ignoreSubmit=1` para provar falha rápida de confirmação;
- `cloneInputIntoUserTurn=1&orphanImageBeforeResult=1` para rejeitar imagens que não pertencem ao model turn;
- `/gemini/?manual=1` para validar que uma aba manual permanece intacta.

`tests/e2e/cache-and-storage.spec.js` consome `/manga-page.html` e prova persistência/restauração baseada nas URLs `/manga-images/page_001.png` e `page_002.png`.

`tests/e2e/reader-offline.spec.js` compartilha a infraestrutura Playwright/webServer, embora seus dados principais do reader sejam semeados diretamente em storage e não provem os branches Gemini deste arquivo.

### 2.3 Dependências de runtime

Built-ins Node:
- `http`: servidor e responses;
- `path`: resolução segura do nome de arquivo e caminhos de fixture;
- `fs`: leitura de `manga-page.html` e fallback se ausente.

Dependência local:
- `./manga-images`: exporta `PNG_IMAGES` e `writeImagesToDisk`.

Recursos externos ao arquivo, lidos/gerados:
- `tests/fixtures/manga-page.html`;
- diretório `tests/fixtures/manga-images/`;
- porta TCP local `3999`.

## 3. Contrato do servidor HTTP

### 3.1 Cabeçalhos e preflight

Toda request recebe:
- `Access-Control-Allow-Origin: *`;
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`;
- `Access-Control-Allow-Headers: *`.

`OPTIONS` retorna 200 imediatamente. Não há autenticação, TLS, sessão HTTP ou restrição de host; isso é intencional para uma fixture local.

### 3.2 Rotas

| Rota | Método esperado | Contrato |
|---|---|---|
| `/__test/attachment-barrier/<id>/status` | GET | JSON com `arrivals`, `waiting`, `released` |
| `/__test/attachment-barrier/<id>/release` | POST | libera waiters e responde estado final |
| `/__test/attachment-barrier/<id>/arrive` | POST | primeira chegada bloqueia até release; posteriores respondem |
| `/health` | qualquer | JSON `{status:"ok", mock:true}` |
| `/gemini-result-image` | qualquer | PNG traduzido selecionado por `jobIndex`, com atraso opcional |
| `/gemini`, `/gemini/`, `/app/mock-chat` | qualquer | HTML do Gemini mock |
| `/`, `/manga-page.html` | qualquer | fixture HTML do mangá ou fallback textual |
| `/manga-images/<arquivo>` | qualquer | PNG do Map em memória, `Cache-Control: no-store` |
| demais | qualquer | 404 `Not found: <pathname>` |

O servidor não diferencia GET de POST para várias rotas de leitura. Apenas a API de barreira aplica método específico para `status`, `release` e `arrive`.

## 4. Contrato da barreira de attachment

`ATTACHMENT_BARRIERS` é um `Map` por ID. Cada estado possui:
- `arrivals`: contagem de chegadas;
- `released`: se a barreira já foi liberada;
- `waiters`: responses HTTP aguardando liberação.

A primeira chamada `POST .../arrive`, enquanto `released === false`, não recebe resposta imediata; sua `ServerResponse` fica em `waiters`. Isso trava a confirmação do primeiro attachment de A no teste FIFO sem usar sleep arbitrário.

Chamadas posteriores de `arrive` passam imediatamente. `release` marca `released=true`, responde todos os waiters via `sendJson`, limpa o Set e devolve o estado final. O teste FIFO verifica diretamente `arrivals:1`, `waiting:1`, `released:false`, depois libera e exige `waiting:0`, `released:true`.

Quando o cliente fecha a request antes da liberação, o listener `close` remove a response ainda não encerrada do Set. Não existe remoção do próprio ID de `ATTACHMENT_BARRIERS` após conclusão.

## 5. Contrato do HTML Gemini mock

### 5.1 DOM estável

O HTML oferece seletores deliberadamente compatíveis com a automação:
- editor `[contenteditable="true"]`;
- `.preview-image`;
- `#attachment-label`;
- `#mock-status`;
- `#send-button`;
- `#result-zone`;
- lista de conversas com `data-chat-id="mock-chat"`;
- botão `data-test-id="chat-options"`;
- controles/indicadores de conversa temporária;
- model turn padrão ou wrapper alternativo de assistant.

A UI visual é secundária; a semântica dos seletores é o contrato importante.

### 5.2 Query parameters

| Parâmetro | Default | Efeito |
|---|---:|---|
| `jobIndex` | `"0"` | seleciona imagem de resultado 0/1 ou fallback |
| `attachmentBarrierId` | vazio | bloqueia primeiro attachment até `release` |
| `generationDelayMs` | 1200 | atraso antes do fim do estado “gerando” |
| `resultImageDelayMs` | 2000 | atraso HTTP da imagem final |
| `fastResult=1` | false | injeta resultado no mesmo task lógico |
| `ignoreSubmit=1` | false | ignora a submissão |
| `attachmentFails=1` | false | rejeita todo attachment |
| `attachmentFailAttempts=N` | 0 | rejeita as N primeiras tentativas |
| `attachmentDelayMs=N` | 0 | atrasa a confirmação do attachment |
| `cloneInputIntoUserTurn=1` | false | adiciona clone em user turn |
| `orphanImageBeforeResult=1` | false | adiciona IMG grande fora de model turn |
| `shadowResult=1` | false | coloca a imagem dentro de open ShadowRoot |
| `relaxedResultContainer=1` | false | usa `section.assistant-response-new-ui` em vez de `model-response` |

Valores temporais negativos são clampados em zero; valores não numéricos viram zero quando o parâmetro existe. Isso significa que um parâmetro inválido é semanticamente diferente de omiti-lo: omitido usa 1200/2000, inválido explícito usa 0.

## 6. Attachment, submissão e geração

### 6.1 Commit do preview

`commitPreview` é idempotente por página via `attachmentSeen`. Ao primeiro commit:
1. muda label;
2. revela preview;
3. prefere o primeiro `clipboardData.files[0]`;
4. cria Object URL quando existe File;
5. usa SVG data URL apenas como fallback visual quando o evento não traz arquivo.

A imagem que interessa ao fluxo real continua sendo o attachment produzido pela extensão; o SVG fallback serve somente para o preview visual.

### 6.2 Injeção de falhas e atraso

`showPreviewFromEvent`:
- ignora qualquer nova tentativa depois de `attachmentSeen`;
- incrementa `attachmentAttempts`;
- rejeita quando `attachmentFails` ou quando o contador ainda está dentro de `attachmentFailAttempts`;
- pode atrasar o commit por `attachmentDelayMs`;
- pode chamar a barreira HTTP antes do commit;
- se a barreira falhar, registra estado e continua sem o atraso da barreira.

`attachmentFails=1` é exercitado diretamente pelos três modos do regression test. Já `attachmentFailAttempts` e `attachmentDelayMs` não tiveram consumidor externo localizado na busca atual.

### 6.3 Resultado verdadeiro versus falsos candidatos

`appendInputClone` cria imagem dentro de um nó marcado como user turn.  
`appendOrphanImage` cria imagem grande diretamente no `result-zone`, sem model owner.  
`appendResultImage` cria o candidato legítimo:
- `model-response[data-message-author="model"]` no DOM legado; ou
- `section.assistant-response-new-ui[data-message-author="assistant"]` no modo relaxed;
- a imagem pode ficar direta no wrapper ou dentro de ShadowRoot aberto.

Essas variantes existem para testar seleção/ownership do resultado e evitar regressão em que “a última imagem” seja escolhida sem contexto semântico.

### 6.4 Run da tradução

`runTranslation`:
1. retorna sem produzir resultado se `ignoreSubmit`;
2. rejeita reentrada se `running` já está true;
3. converte `/gemini[/]` em `/app/mock-chat` via `history.replaceState`;
4. marca processamento, desabilita botão e esvazia editor;
5. injeta decoys opcionais;
6. no modo rápido, adiciona resultado imediatamente e reabilita botão no próximo timeout;
7. no modo normal, cria `stop-generating-button`, espera `generationDelayMs` (ou ao menos uma virada de task), remove stop, reabilita botão e adiciona resultado.

O estado `running` nunca volta para `false`; cada página mock aceita semanticamente uma única tradução. Isso corresponde ao uso E2E atual, em que a aba do Gemini representa um job/conversa controlado. Não há teste focal de dupla submissão no mesmo mock.

## 7. Exclusão da conversa

O botão de opções da conversa `mock-chat` cria menu com item “Excluir”. Clicar cria dialog com “Excluir” e “Cancelar”. A confirmação:
- marca o dialog como confirmado;
- remove a linha da conversa;
- muda URL para `/app`;
- atualiza status;
- remove o dialog.

Os E2E dos modos `minimized_window` e `background_delete` verificam a conclusão do lote e a presença de `DELETE_OK` nos logs da extensão. Isso executa o contrato de exclusão, mas não há uma suíte isolada que faça assertions em cada elemento interno do menu/dialog do mock.

## 8. Imagens e materialização

`writeImagesToDisk(path.join(FIXTURES, 'manga-images'))` roda antes de o servidor começar a escutar. Assim, iniciar o mock possui side effect de filesystem: cria/sobrescreve as imagens de teste usando a mesma fonte `PNG_IMAGES`.

Para servir `/manga-images/*`, porém, o servidor consulta o Map em memória, nunca lê o arquivo correspondente do disco. Isso mantém o conteúdo HTTP preso à fonte única, mesmo se um arquivo gerado no diretório estiver stale.

`/gemini-result-image` seleciona:
- `translated_result_0.png` para `jobIndex=0`;
- `translated_result_1.png` para `jobIndex=1`;
- `translated_result_default.png` para outros índices;
- se a chave calculada não existir, ainda cai no default.

O primeiro E2E ponta a ponta prova que duas páginas ficam traduzidas e que os dois `src` finais são diferentes, exercitando os resultados 0/1. O fallback “default” não possui assertion focal localizada.

## 9. Evidência automatizada existente

### Matriz de evidência

| Comportamento do fixture | Evidência atual | Classificação |
|---|---|---|
| Playwright inicia este arquivo na porta 3999 | `playwright.config.js:50-54` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `npm run mock:server` aponta para este arquivo | `package.json:25` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| E2E usa preparação por fonte única antes de Playwright | `package.json:19,21` + verificador CI | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `/manga-page.html` carrega imagens com dimensões reais | `translation-flow.spec.js:179-189` espera >=2 e `naturalWidth>=300/naturalHeight>=400` | ✅ PROVADO DIRETAMENTE |
| fluxo padrão do mock produz duas imagens traduzidas distintas | `translation-flow.spec.js:176-258` | ✅ PROVADO DIRETAMENTE |
| URLs das páginas 001/002 alimentam restore index | `cache-and-storage.spec.js:222-260` | ✅ PROVADO DIRETAMENTE |
| `attachmentFails=1` impede confirmação/submit nos três modos | `translation-flow.spec.js:283-351` | ✅ PROVADO DIRETAMENTE |
| status/release da barreira FIFO | `translation-flow.spec.js:354-495` | ✅ PROVADO DIRETAMENTE |
| barreira permite drenar A→G sem stale | `translation-flow.spec.js:497-556` | ✅ PROVADO DIRETAMENTE |
| `generationDelayMs=0` e `resultImageDelayMs=0` são exercitados | URL do FIFO em linhas 367-369 | 🟨 EXECUTADO INDIRETAMENTE |
| resultado imediato `fastResult=1` é detectado | `translation-flow.spec.js:658-705` | ✅ PROVADO DIRETAMENTE |
| Shadow DOM + wrapper relaxed é aceito automaticamente | `translation-flow.spec.js:707-747` | ✅ PROVADO DIRETAMENTE |
| `ignoreSubmit=1` causa falha curta e não entrega imagem | `translation-flow.spec.js:750-814` | ✅ PROVADO DIRETAMENTE |
| clone do user turn é rejeitado | `translation-flow.spec.js:817-859` | ✅ PROVADO DIRETAMENTE |
| IMG órfã é rejeitada | `translation-flow.spec.js:817-859` | ✅ PROVADO DIRETAMENTE |
| aba manual permanece com DOM inicial | `translation-flow.spec.js:863-902` | ✅ PROVADO DIRETAMENTE |
| menu/dialog de exclusão interno do mock | efeito observado via `DELETE_OK`, sem assertion focal no DOM do mock | 🟨 EXECUTADO INDIRETAMENTE |
| `attachmentFailAttempts` | nenhum consumidor/teste localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `attachmentDelayMs` | nenhum consumidor/teste localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `/health` | endpoint existe, mas config atual usa apenas `port:3999` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| preflight `OPTIONS` | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| método inválido na API da barreira → 405 | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| cleanup de waiter no `req.close` | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback de `manga-page.html` ausente | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `translated_result_default.png` | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| imagem desconhecida / rota desconhecida → 404 | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `Cache-Control: no-store` | header não recebe assertion específica | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| CORS permissivo | usado pelo ambiente, headers sem assertion específica | 🟨 EXECUTADO INDIRETAMENTE |
| materialização em disco no startup | chamada real ocorre no bootstrap, conteúdo resultante não é assertado por esta suíte | 🟨 EXECUTADO INDIRETAMENTE |

## 10. Solicitações ao auditor

### 095-001 — TEST_REQUIRED — OPEN

**Encontrado:** o fixture possui branches HTTP e controles de falha sem teste focal próprio. `attachmentFailAttempts` e `attachmentDelayMs` aparecem apenas neste arquivo; também não foram localizadas assertions específicas para `OPTIONS`, `/health`, método inválido/405 da barreira, cleanup por desconexão, fallback de `manga-page.html`, resultado default e 404.

**Arquivo auditado:** `tests/fixtures/gemini-mock-server.js`.

**Arquivo externo sugerido:** novo teste dedicado, por exemplo `tests/e2e/gemini-mock-server-contract.spec.js`, se o auditor aprovar esse local.

**Evidência atual:** `translation-flow.spec.js` prova fortemente os caminhos E2E centrais e a API de barreira usada pelo FIFO, mas não cobre todas as superfícies configuráveis do servidor.

**Evidência ausente:** requests controladas com assertions diretas de status, headers, JSON, atraso/falhas configuráveis e fallbacks.

**Por que a evidência atual é insuficiente:** uma opção aparentemente disponível no fixture pode quebrar ou tornar-se código morto sem que os E2E atuais falhem.

**Ação solicitada:** adicionar, em mudança separada, testes contra a implementação real do servidor; não duplicar a lógica do fixture.

**Evidência esperada:** assertions de HTTP status/body/headers e efeitos temporais/contadores para cada branch listado.

**Possível regressão:** testes futuros podem depender de um knob/route que já esteja quebrado e obter falhas difíceis de diagnosticar.

**Impacto conhecido:** infraestrutura de teste, não código de produção.

**Severidade:** NORMAL.

### 095-002 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** entradas de `ATTACHMENT_BARRIERS` nunca são removidas do `Map`. `release` limpa apenas o Set de waiters; o ID e seu objeto permanecem até o processo encerrar.

**Contexto:** o teste FIFO gera IDs únicos por execução; em processos Playwright longos/repetidos, o número de entradas cresce monotonicamente.

**Evidência atual:** linhas 41-49 criam/reutilizam estados; linhas 529-542 liberam waiters, mas não chamam `ATTACHMENT_BARRIERS.delete(id)`.

**Evidência ausente:** teste de lifecycle e decisão explícita de que retenção até o término do processo é aceitável.

**Ação solicitada:** o auditor deve decidir se o lifetime do servidor torna a retenção irrelevante. Se não, implementar cleanup seguro após release/conclusão em alteração funcional separada e provar reuso/concorrência.

**Possível regressão:** crescimento de memória/estado stale em sessões E2E muito longas ou em uso manual repetido do mock.

**Impacto conhecido:** baixo no suite atual, potencial em execuções prolongadas.

**Severidade:** LOW.

### 095-003 — CONTRACT_REVIEW — OPEN

**Encontrado:** o comentário da linha 566 diz que `/health` é usado pelo `playwright.config.js` para aguardar o servidor, porém o config atual define `port: 3999` e `reuseExistingServer: true`, sem `url: .../health`.

**Arquivo externo relacionado:** `playwright.config.js`.

**Evidência atual:** `playwright.config.js:50-54` contém somente command/port/reuseExistingServer.

**Evidência ausente:** verificação de identidade/saúde do processo que já esteja ocupando a porta 3999.

**Por que importa:** com reuse ativo, um processo não relacionado na mesma porta pode ser aceito como servidor existente; além disso, o comentário/documentação do endpoint sugere um contrato que não está realmente conectado.

**Ação solicitada:** confirmar a intenção. Se a identidade do mock precisar ser verificada, alterar o config em trabalho autorizado separado e adicionar prova correspondente; se a espera por porta for intencional, corrigir a documentação em processo apropriado.

**Possível regressão:** E2E pode falhar de forma enganosa por reutilizar serviço errado, ou o endpoint `/health` pode degradar sem qualquer sinal.

**Impacto conhecido:** confiabilidade da infraestrutura E2E.

**Severidade:** NORMAL.

### 095-004 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** parsing de request é fail-fast sem tratamento local: `new URL(req.url, `http://${req.headers.host}`)` e `decodeURIComponent(barrierMatch[1])` podem lançar para input HTTP malformado.

**Evidência atual:** linhas 510 e 515 não ficam dentro de try/catch.

**Evidência ausente:** teste que envie Host/URL/percent-encoding inválido e confirme a política desejada (4xx versus encerramento do processo).

**Ação solicitada:** decidir se, por ser fixture estritamente local/controlada, fail-fast é aceitável. Se não for, endurecer parsing em alteração separada e adicionar regressão.

**Possível regressão:** request malformada pode derrubar o mock inteiro e transformar erro de um teste em cascata.

**Impacto conhecido:** infraestrutura local de testes.

**Severidade:** LOW.

## 11. Fonte integral auditada

```js
/**
 * gemini-mock-server.js
 * Servidor HTTP local para os testes E2E do Playwright.
 *
 * ARQUITETURA DE IMAGENS — POR QUE GERACAO EM MEMORIA:
 *
 * Historico de falhas:
 * 1. v1 (original): Escrevia string base64 falsa no arquivo .png.
 *    Chrome detectava arquivo corrompido → naturalWidth = 0 → 0 imagens detectadas.
 *
 * 2. v2 (Gemini SVG): Tentou SVGs com MIME image/svg+xml.
 *    Chrome reporta naturalWidth = 0 para SVGs carregados via <img> em modo headless
 *    quando o SVG nao tem dimensoes absolutas intrinsecas em pixels — o que e o caso
 *    de qualquer SVG que usa apenas viewBox sem width/height fixos em px.
 *    Resultado identico: naturalWidth = 0 → teste falhou.
 *
 * 3. v3 (este arquivo): PNGs binarios reais gerados EM MEMORIA ao iniciar o servidor.
 *    O formato PNG tem um campo IHDR que encapsula largura/altura em 4 bytes big-endian.
 *    O Chrome le o IHDR antes de decodificar os pixels e reporta naturalWidth/naturalHeight
 *    a partir desses valores IMEDIATAMENTE apos receber o header HTTP — mesmo antes
 *    de decodificar todos os IDAT. Resultado: naturalWidth = 800 garantido.
 *
 * FONTE UNICA DAS IMAGENS:
 * Os buffers vivem em ./manga-images.js. O servidor e o script de preparo usam
 * exatamente o mesmo Map, evitando imagens versionadas ou geradores divergentes.
 */

const http = require('http');
const path = require('path');
const fs   = require('fs');
const { PNG_IMAGES, writeImagesToDisk } = require('./manga-images');

const PORT     = 3999;
const FIXTURES = __dirname;

// Barreiras temporizadas por estado para testes FIFO. Cada ID é único por teste.
// O primeiro attachment fica bloqueado até o teste liberar explicitamente;
// attachments posteriores com o mesmo ID passam imediatamente.
const ATTACHMENT_BARRIERS = new Map();

function getAttachmentBarrier(id) {
    if (!ATTACHMENT_BARRIERS.has(id)) {
        ATTACHMENT_BARRIERS.set(id, {
            arrivals: 0,
            released: false,
            waiters: new Set(),
        });
    }
    return ATTACHMENT_BARRIERS.get(id);
}

function sendJson(res, payload, statusCode = 200) {
    if (res.writableEnded) return;
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function buildGeminiMockHtml() {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Gemini Mock</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #101418;
      color: #f5f7fa;
    }

    main {
      max-width: 920px;
      margin: 0 auto;
      min-height: 100vh;
      padding: 32px 24px 48px;
    }

    .shell {
      background: #1c232b;
      border: 1px solid #2d3742;
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .toolbar h1 {
      font-size: 16px;
      margin: 0;
      font-weight: 700;
    }

    .attachment-container {
      min-height: 64px;
      margin-bottom: 14px;
      padding: 12px;
      border: 1px dashed #4d6377;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .preview-image {
      max-width: 130px;
      max-height: 180px;
      border-radius: 8px;
      display: none;
    }

    .prompt-box {
      min-height: 120px;
      padding: 14px;
      border-radius: 14px;
      background: #0f1419;
      border: 1px solid #344150;
      outline: none;
      white-space: pre-wrap;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 14px;
    }

    button {
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      background: #3aa675;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    #result-zone {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #2d3742;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    #result-zone img {
      max-width: 100%;
      border-radius: 12px;
      display: block;
    }
  </style>
</head>
<body>
  <nav id="mock-side-nav" aria-label="Conversas" style="padding:8px 16px;background:#0b1015;border-bottom:1px solid #27323d;">
    <div id="mock-chat-list">
      <div class="mock-chat-row" data-chat-id="mock-chat">
        <a href="/app/mock-chat">Conversa do Manga Translator</a>
        <button type="button" data-test-id="chat-options" aria-haspopup="menu">Opções</button>
      </div>
      <div class="mock-chat-row" data-chat-id="other-chat">
        <a href="/app/other-chat">Outra conversa</a>
        <button type="button" aria-haspopup="menu">Opções</button>
      </div>
    </div>
  </nav>
  <main>
    <div class="shell">
      <div class="toolbar">
        <h1>Gemini Mock para Playwright</h1>
        <span id="mock-status">Aguardando entrada</span>
        <button data-test-id="temp-chat-button" aria-label="Desativar conversa temporária" style="display:none">Desativar conversa temporária</button>
        <div data-test-id="temp-chat-indicator" class="temp-chat-indicator" style="display:none">conversa temporária</div>
      </div>

      <div class="attachment-container">
        <img class="preview-image" alt="preview" />
        <span id="attachment-label">Nenhuma imagem anexada</span>
      </div>

      <div class="prompt-box" contenteditable="true" aria-label="Prompt" role="textbox"></div>

      <div class="actions">
        <button id="send-button" type="button" aria-label="Send message" title="Send message">Send</button>
      </div>

      <div id="result-zone"></div>
    </div>
  </main>

  <script>
    (() => {
      const editor = document.querySelector('[contenteditable="true"]');
      const preview = document.querySelector('.preview-image');
      const label = document.getElementById('attachment-label');
      const status = document.getElementById('mock-status');
      const resultZone = document.getElementById('result-zone');
      const sendButton = document.getElementById('send-button');
      const currentUrl = new URL(window.location.href);
      const jobIndex = currentUrl.searchParams.get('jobIndex') || '0';
      const attachmentBarrierId = currentUrl.searchParams.get('attachmentBarrierId') || '';
      const generationDelayParam = currentUrl.searchParams.get('generationDelayMs');
      const generationDelayMs = generationDelayParam === null
        ? 1200
        : Math.max(0, Number(generationDelayParam) || 0);
      const resultImageDelayParam = currentUrl.searchParams.get('resultImageDelayMs');
      const resultImageDelayMs = resultImageDelayParam === null
        ? 2000
        : Math.max(0, Number(resultImageDelayParam) || 0);
      const fastResult = currentUrl.searchParams.get('fastResult') === '1';
      const ignoreSubmit = currentUrl.searchParams.get('ignoreSubmit') === '1';
      const attachmentFails = currentUrl.searchParams.get('attachmentFails') === '1';
      const attachmentFailAttempts = Math.max(
        0,
        Number(currentUrl.searchParams.get('attachmentFailAttempts') || 0)
      );
      const attachmentDelayMs = Math.max(
        0,
        Number(currentUrl.searchParams.get('attachmentDelayMs') || 0)
      );
      const cloneInputIntoUserTurn =
        currentUrl.searchParams.get('cloneInputIntoUserTurn') === '1';
      const orphanImageBeforeResult =
        currentUrl.searchParams.get('orphanImageBeforeResult') === '1';
      const shadowResult =
        currentUrl.searchParams.get('shadowResult') === '1';
      const relaxedResultContainer =
        currentUrl.searchParams.get('relaxedResultContainer') === '1';
      const chatOptionsButton = document.querySelector('[data-chat-id="mock-chat"] [data-test-id="chat-options"]');

      let attachmentSeen = false;
      let attachmentAttempts = 0;
      let running = false;

      function commitPreview(event) {
        if (attachmentSeen) return;
        attachmentSeen = true;
        label.textContent = 'Imagem anexada pelo content script';
        preview.style.display = 'block';

        const firstFile =
          event.clipboardData &&
          event.clipboardData.files &&
          event.clipboardData.files.length > 0
            ? event.clipboardData.files[0]
            : null;

        if (firstFile) {
          preview.src = URL.createObjectURL(firstFile);
        } else {
          preview.src =
            'data:image/svg+xml;utf8,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220"><rect width="100%" height="100%" fill="#486581"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Arial" font-size="18">preview</text></svg>'
            );
        }
      }

      function showPreviewFromEvent(event) {
        if (attachmentSeen) return;
        attachmentAttempts += 1;

        if (attachmentFails || attachmentAttempts <= attachmentFailAttempts) {
          status.textContent = 'Attachment ignorado pelo mock';
          return;
        }

        const commitAfterOptionalDelay = () => {
          if (attachmentDelayMs > 0) {
            status.textContent = 'Attachment atrasado pelo mock';
            setTimeout(() => commitPreview(event), attachmentDelayMs);
            return;
          }
          commitPreview(event);
        };

        if (attachmentBarrierId) {
          status.textContent = 'Attachment aguardando barreira do teste';
          fetch(
            '/__test/attachment-barrier/' +
              encodeURIComponent(attachmentBarrierId) +
              '/arrive',
            { method: 'POST' }
          )
            .then(response => {
              if (!response.ok) throw new Error('barrier_arrive_failed');
              return response.json();
            })
            .then(() => commitAfterOptionalDelay())
            .catch(() => {
              status.textContent = 'Barreira indisponível; seguindo sem atraso';
              commitAfterOptionalDelay();
            });
          return;
        }

        commitAfterOptionalDelay();
      }

      function appendInputClone() {
        const userTurn = document.createElement('div');
        userTurn.setAttribute('data-message-author', 'user');
        userTurn.setAttribute('data-turn-role', 'user');

        const img = document.createElement('img');
        img.alt = 'Clone da imagem enviada pelo usuário';
        img.src =
          '/manga-images/page_001.png?userClone=' +
          encodeURIComponent(jobIndex) +
          '&t=' +
          Date.now();

        userTurn.appendChild(img);
        resultZone.appendChild(userTurn);
      }

      function appendOrphanImage() {
        const img = document.createElement('img');
        img.alt = 'Imagem grande fora de model turn';
        img.src =
          '/manga-images/page_002.png?orphan=' +
          encodeURIComponent(jobIndex) +
          '&t=' +
          Date.now();
        resultZone.appendChild(img);
      }

      function appendResultImage() {
        const response = relaxedResultContainer
          ? document.createElement('section')
          : document.createElement('model-response');

        if (relaxedResultContainer) {
          response.className = 'assistant-response-new-ui';
          response.setAttribute('data-message-author', 'assistant');
        } else {
          response.setAttribute('data-message-author', 'model');
        }

        const responseText = document.createElement('div');
        responseText.className = 'model-response-text';

        const img = document.createElement('img');
        img.alt = 'Imagem traduzida do mock';
        img.src =
          '/gemini-result-image?jobIndex=' +
          encodeURIComponent(jobIndex) +
          '&delayMs=' +
          encodeURIComponent(resultImageDelayMs) +
          '&t=' +
          Date.now();

        if (shadowResult) {
          const shadowHost = document.createElement('div');
          shadowHost.className = 'mock-generated-image-shadow-host';
          const shadow = shadowHost.attachShadow({ mode: 'open' });
          shadow.appendChild(img);
          responseText.appendChild(shadowHost);
        } else {
          responseText.appendChild(img);
        }

        response.appendChild(responseText);
        resultZone.appendChild(response);
        status.textContent = 'Imagem traduzida pronta';
      }

      async function runTranslation() {
        if (ignoreSubmit) {
          status.textContent = 'Submit ignorado pelo mock';
          return;
        }
        if (running) return;

        running = true;
        // O Gemini real associa a primeira mensagem a uma conversa e passa a
        // expor /app/<chatId>. O fluxo minimized_window precisa desse ID para
        // validar a exclusão segura antes da entrega; sem isso o mock forçava
        // artificialmente o caminho de recovery/reload.
        if (window.location.pathname === '/gemini/' || window.location.pathname === '/gemini') {
          history.replaceState({}, '', '/app/mock-chat');
        }
        status.textContent = 'Processando mock...';
        sendButton.disabled = true;
        if (editor) {
          editor.textContent = '';
          editor.innerText = '';
        }

        if (cloneInputIntoUserTurn) appendInputClone();
        if (orphanImageBeforeResult) appendOrphanImage();

        if (fastResult) {
          // A resposta aparece no mesmo task lógico do submit. O Observer V3
          // precisa ter sido instalado antes do click para capturá-la.
          appendResultImage();
          setTimeout(() => {
            sendButton.disabled = false;
          }, 0);
          return;
        }

        const stopBtn = document.createElement('button');
        stopBtn.setAttribute('data-test-id', 'stop-generating-button');
        stopBtn.setAttribute('aria-label', 'Stop generating');
        stopBtn.textContent = 'Stop';
        sendButton.parentNode.appendChild(stopBtn);

        if (generationDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, generationDelayMs));
        } else {
          // Mantém uma virada de task para que MutationObserver veja o estado
          // "gerando" sem impor latência artificial de parede ao teste.
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        stopBtn.remove();
        sendButton.disabled = false;
        appendResultImage();
      }

      if (chatOptionsButton) {
        chatOptionsButton.addEventListener('click', () => {
          document.getElementById('mock-delete-menu')?.remove();
          const menu = document.createElement('div');
          menu.id = 'mock-delete-menu';
          menu.setAttribute('role', 'menu');

          const deleteItem = document.createElement('div');
          deleteItem.setAttribute('role', 'menuitem');
          deleteItem.textContent = 'Excluir';
          deleteItem.tabIndex = 0;
          deleteItem.addEventListener('click', () => {
            menu.remove();
            document.getElementById('mock-delete-dialog')?.remove();

            const dialog = document.createElement('div');
            dialog.id = 'mock-delete-dialog';
            dialog.setAttribute('role', 'dialog');

            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.textContent = 'Excluir';
            confirm.addEventListener('click', () => {
              dialog.dataset.confirmed = 'true';
              document.querySelector('[data-chat-id="mock-chat"]')?.remove();
              history.replaceState({}, '', '/app');
              status.textContent = 'Conversa excluída pelo mock';
              dialog.remove();
            });

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = 'Cancelar';

            dialog.append(confirm, cancel);
            document.body.appendChild(dialog);
          });

          menu.appendChild(deleteItem);
          document.body.appendChild(menu);
        });
      }

      editor.addEventListener('drop', event => {
        event.preventDefault();
        showPreviewFromEvent(event);
      });

      editor.addEventListener('paste', event => {
        showPreviewFromEvent(event);
      });

      editor.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          runTranslation();
        }
      });

      sendButton.addEventListener('click', () => {
        runTranslation();
      });
    })();
  </script>
</body>
</html>`;
}

// Materializa as mesmas fixtures usadas em memória para consumidores que precisam de arquivo.
writeImagesToDisk(path.join(FIXTURES, 'manga-images'));
console.log('PNG images prepared from the shared fixture source.');

// ── Servidor HTTP ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const url = requestUrl.pathname;

    const barrierMatch = url.match(/^\/__test\/attachment-barrier\/([^/]+)\/(arrive|status|release)$/);
    if (barrierMatch) {
        const barrierId = decodeURIComponent(barrierMatch[1]);
        const action = barrierMatch[2];
        const barrier = getAttachmentBarrier(barrierId);

        if (action === 'status' && req.method === 'GET') {
            sendJson(res, {
                ok: true,
                arrivals: barrier.arrivals,
                waiting: barrier.waiters.size,
                released: barrier.released,
            });
            return;
        }

        if (action === 'release' && req.method === 'POST') {
            barrier.released = true;
            for (const waiter of barrier.waiters) {
                sendJson(waiter, { ok: true, released: true });
            }
            barrier.waiters.clear();
            sendJson(res, {
                ok: true,
                arrivals: barrier.arrivals,
                waiting: 0,
                released: true,
            });
            return;
        }

        if (action === 'arrive' && req.method === 'POST') {
            barrier.arrivals += 1;
            if (barrier.arrivals === 1 && !barrier.released) {
                barrier.waiters.add(res);
                req.on('close', () => {
                    if (!res.writableEnded) barrier.waiters.delete(res);
                });
                return;
            }
            sendJson(res, {
                ok: true,
                arrivals: barrier.arrivals,
                waiting: barrier.waiters.size,
                released: barrier.released,
            });
            return;
        }

        sendJson(res, { ok: false, error: 'invalid_barrier_request' }, 405);
        return;
    }

    // Health check — usado pelo playwright.config.js para aguardar o servidor
    if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', mock: true }));
        return;
    }

    // Gemini mock result image — simula resposta do Gemini apos traducao
    if (url === '/gemini-result-image') {
        const jobIndex = requestUrl.searchParams.get('jobIndex');
        const translatedKey = jobIndex === '0' || jobIndex === '1'
            ? `translated_result_${jobIndex}.png`
            : 'translated_result_default.png';
        const buf = PNG_IMAGES.get(translatedKey) || PNG_IMAGES.get('translated_result_default.png');
        const delayParam = requestUrl.searchParams.get('delayMs');
        const delayMs = delayParam === null ? 2000 : Math.max(0, Number(delayParam) || 0);
        const sendImage = () => {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(buf);
        };
        if (delayMs > 0) setTimeout(sendImage, delayMs);
        else sendImage();
        return;
    }

    if (
        url === '/gemini' ||
        url === '/gemini/' ||
        url === '/app/mock-chat'
    ) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildGeminiMockHtml());
        return;
    }

    // manga-page.html — pagina HTML com as 4 imagens de teste
    if (url === '/' || url === '/manga-page.html') {
        const htmlPath = path.join(FIXTURES, 'manga-page.html');
        const html = fs.existsSync(htmlPath)
            ? fs.readFileSync(htmlPath)
            : Buffer.from('<html><body>manga-page.html not found</body></html>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }

    // Imagens de manga: /manga-images/page_001.png etc.
    // Servidas da memoria — NUNCA do disco — para garantir validade.
    if (url.startsWith('/manga-images/')) {
        const file = path.basename(url);
        const buf  = PNG_IMAGES.get(file);
        if (buf) {
            res.writeHead(200, {
                'Content-Type':  'image/png',
                'Cache-Control': 'no-store', // evita cache stale no browser
            });
            res.end(buf);
            return;
        }
    }

    res.writeHead(404); res.end('Not found: ' + url);
});

server.listen(PORT, () => {
    console.log('Gemini Mock Server rodando na porta ' + PORT);
});
```

## 12. Mapa integral de linhas/posições

A tabela abaixo cobre todo o blob auditado sem lacunas. Linhas em branco e delimitadores também estão incluídos nos intervalos.

| Linhas | Responsabilidade | Evidência/risco |
|---:|---|---|
| 1–26 | comentário arquitetural e histórico das fixtures PNG | 🟦 contrato documental coerente com implementação |
| 27 | separador | estrutural |
| 28–31 | imports Node + fonte única de imagens | 🟨 executado pelo startup |
| 32 | separador | estrutural |
| 33–34 | porta fixa e diretório de fixtures | 🟦 wiring confirmado pelo config |
| 35 | separador | estrutural |
| 36–39 | contrato textual e Map de barreiras | ✅ FIFO usa a barreira real |
| 40 | separador | estrutural |
| 41–50 | criação/reuso do estado de barreira | ✅ exercitado no FIFO; cleanup do Map ausente |
| 51 | separador | estrutural |
| 52–56 | helper JSON e guard de response já encerrada | 🟨 usado pela barreira; guard sem teste focal |
| 57 | separador | estrutural |
| 58–64 | início do builder HTML e head | 🟨 carregado nos E2E |
| 65–160 | CSS da interface mock | 🟨 renderizado; estética não é assertion |
| 161–198 | DOM estático: chats, toolbar, attachment, editor, send, resultados | ✅/🟨 seletores centrais usados; estrutura interna parcial |
| 199–207 | bootstrap do script cliente e captura de elementos/URL | 🟨 caminho real E2E |
| 208–237 | parsing de todos os knobs por query string | misto: vários ✅, dois ⚠️ sem consumidor |
| 238–242 | estados locais de attachment/submissão | 🟨 exercitados |
| 243–265 | `commitPreview` e fallback de preview | 🟨 caminho File exercitado; fallback SVG sem prova focal |
| 266 | separador | estrutural |
| 267–306 | falha, tentativas, atraso e barreira do attachment | ✅ `attachmentFails`/barreira; ⚠️ attempts/delay |
| 307 | separador | estrutural |
| 308–323 | clone em user turn | ✅ rejeição provada |
| 324 | separador | estrutural |
| 325–334 | imagem órfã | ✅ rejeição provada |
| 335 | separador | estrutural |
| 336–374 | criação do model result, wrapper alternativo e Shadow DOM | ✅ cenários padrão + relaxed/shadow |
| 375 | separador | estrutural |
| 376–390 | guards de submit/reentrada e transição `/gemini→/app/mock-chat` | ✅ ignoreSubmit; 🟨 reentrada/transição |
| 391–399 | estado visual, limpeza do editor e decoys opcionais | ✅ decoys; demais 🟨 |
| 400 | separador | estrutural |
| 401–409 | fast result e re-enable assíncrono | ✅ teste de resposta rápida |
| 410 | separador | estrutural |
| 411–427 | stop button, delay normal e resultado | ✅ fluxo padrão; timing exato 🟨 |
| 428 | fim de `runTranslation` | estrutural |
| 429 | separador | estrutural |
| 430–471 | menu/dialog de exclusão e mudança para `/app` | 🟨 efeito E2E observado via DELETE_OK |
| 472 | separador | estrutural |
| 473–491 | listeners drop/paste/Enter/click | 🟨 attachment/click exercitados; Enter sem prova focal |
| 492–496 | fim do IIFE/template/builder | estrutural |
| 497 | separador | estrutural |
| 498–500 | materialização das imagens e log de startup | 🟨 executado; arquivos sem assertion focal aqui |
| 501 | separador | estrutural |
| 502–503 | criação do HTTP server | 🟨 execução E2E |
| 504–508 | CORS e preflight OPTIONS | 🟨 CORS indireto; ⚠️ OPTIONS sem assertion |
| 509 | separador | estrutural |
| 510–517 | parsing URL e roteamento inicial da barreira | ✅ FIFO; ⚠️ malformed input sem prova |
| 518 | separador | estrutural |
| 519–527 | GET status da barreira | ✅ assertion direta |
| 528 | separador | estrutural |
| 529–542 | POST release + drenagem de waiters | ✅ assertion direta |
| 543 | separador | estrutural |
| 544–560 | POST arrive, primeiro waiter e chegadas posteriores | ✅ primeira chegada; branches posteriores/close parcialmente indiretos |
| 561 | separador | estrutural |
| 562–564 | 405 para combinação inválida | ⚠️ sem teste focal |
| 565 | separador | estrutural |
| 566–571 | `/health` | ⚠️ não conectado ao config atual |
| 572 | separador | estrutural |
| 573–589 | imagem final por job index e delay | ✅ 0/1; ⚠️ default sem assertion focal |
| 590 | separador | estrutural |
| 591–599 | rotas Gemini servindo HTML | ✅ usadas nos E2E |
| 600 | separador | estrutural |
| 601–610 | rota manga HTML e fallback se arquivo ausente | ✅ caminho presente; ⚠️ fallback ausente |
| 611 | separador | estrutural |
| 612–625 | imagens do Map em memória + no-store | ✅ imagens reais; ⚠️ header sem assertion |
| 626 | separador | estrutural |
| 627–628 | 404 e fim do handler | ⚠️ 404 sem teste focal |
| 629 | separador | estrutural |
| 630–632 | listen em 3999 e log de prontidão | 🟦/🟨 config coincide; startup E2E |
| posição 633 | newline final | 🟦 leitura integral do blob |

## 13. Unidades semânticas

### U01 — linhas 1–34 — propósito, dependências e identidade local

Explica a razão dos PNGs válidos, importa o runtime e fixa a porta. Alterar a porta isoladamente rompe o contrato com Playwright e URLs hardcoded dos E2E.

### U02 — linhas 36–56 — primitive de sincronização HTTP

Fornece barreira determinística e helper JSON. A barreira elimina sleeps arbitrários no teste FIFO e torna explícito o instante em que A segura o scheduler.

### U03 — linhas 58–198 — documento mock

Cria a superfície mínima do Gemini. Manter seletores deliberadamente simples reduz fragilidade de teste; ao mesmo tempo, qualquer seletor alterado aqui precisa continuar correspondendo aos heurísticos da extensão que o E2E pretende exercitar.

### U04 — linhas 199–306 — knobs e attachment

Transforma parâmetros de URL em comportamento controlável e implementa o protocolo paste/drop → confirmação. A distinção entre falha total, falha nas primeiras N tentativas, atraso e barreira permite modelar classes diferentes de race/timeout.

### U05 — linhas 308–374 — ownership do resultado

Constrói candidatos falsos e verdadeiro. Essa unidade é essencial para provar que o código não seleciona imagem apenas por tamanho/ordem, mas por autoria e container de resposta.

### U06 — linhas 376–428 — lifecycle de submissão

Modela ignore, deduplicação local, URL de conversa, sinal de “gerando”, atraso e conclusão. O branch fast existe especificamente para testar a instalação antecipada do observer.

### U07 — linhas 430–491 — interação humana simulada

Implementa exclusão e listeners de entrada/submissão. O mock oferece os elementos que a automação real clica, sem substituir o código de produção por helper de teste.

### U08 — linhas 498–500 — side effect de bootstrap

Materializa fixtures em disco a partir da mesma fonte usada em memória. Isso evita geradores divergentes, mas faz o simples startup do servidor escrever no workspace.

### U09 — linhas 503–564 — protocolo HTTP e barreiras

Aplica CORS, preflight e API test-only. A primeira chegada pode manter uma response aberta; release fecha todas. O lifecycle do Map permanece até o fim do processo.

### U10 — linhas 566–625 — conteúdo servido

Entrega health, imagem traduzida, HTML Gemini, HTML mangá e PNGs. As imagens de mangá vêm do Map, não do disco, para preservar validade determinística.

### U11 — linhas 627–632 — fallback e processo servidor

Tudo não reconhecido termina em 404; o processo escuta na porta canônica.

### U12 — posição 633 — newline

O blob termina com newline: 632 linhas textuais e 633 posições documentais.

## 14. Invariantes

1. a porta usada pelo fixture e pelo Playwright deve permanecer coerente;
2. `PNG_IMAGES` é a fonte efetiva das respostas PNG;
3. `/manga-images/*` não depende do conteúdo materializado em disco;
4. o primeiro `arrive` de uma barreira não liberada permanece pendente;
5. `release` deve terminar responses pendentes antes de responder seu próprio estado;
6. attachment só é comprometido uma vez por página mock;
7. `attachmentFails` impede confirmação;
8. resultado legítimo sempre pertence a model/assistant container;
9. clone de input e imagem órfã são semanticamente diferentes do resultado;
10. fast result não cria stop button nem espera generation delay;
11. modo normal expõe stop-generating durante a espera;
12. confirmar exclusão remove a conversa mock e navega para `/app`;
13. request de imagem conhecida retorna PNG; desconhecida cai no 404 geral;
14. o servidor não é uma API de produção e aceita CORS amplo por design de fixture.

## 15. Casos-limite e riscos

- query temporal omitida usa default; query inválida explícita vira zero;
- `attachmentFailAttempts` pode rejeitar várias tentativas, mas não há consumidor atual localizado;
- `attachmentSeen` faz callbacks atrasados posteriores virarem no-op;
- falha da barreira no browser é fail-open: o mock continua o attachment;
- `running` nunca volta para false;
- o Map de barreiras cresce por ID e não expira;
- response pendente depende de release ou fechamento do request;
- a rota de manga lê HTML do disco, mas imagens vêm da memória;
- ausência de `manga-page.html` retorna 200 com fallback, não 404;
- rotas não limitam método salvo a API da barreira;
- `reuseExistingServer:true` pode reutilizar qualquer processo na porta se o mecanismo do Playwright considerar a porta pronta;
- parsing HTTP malformado não possui catch local.

## 16. O que este arquivo NÃO prova

Este fixture não prova por si só:
- compatibilidade com o Gemini real ou seus seletores atuais;
- comportamento de rede pública, autenticação ou CSP do Gemini;
- funcionamento de navegador diferente do projeto Playwright configurado;
- ausência de leaks no código de produção;
- semântica completa de todas as APIs do browser;
- correção do `manga-images.js` além do que os E2E observam;
- que knobs sem consumidor permanecem necessários;
- que `/health` está sendo usado pela infraestrutura.

Ele fornece um ambiente controlado para provar comportamentos da extensão. As conclusões da Bíblia não promovem execução indireta a prova direta.

## 17. Autoauditoria do AGENTE 17

- [x] reserva exclusiva criada via CREATE ONLY;
- [x] reserva relida e proprietário confirmado como `AGENTE 17`;
- [x] SHA do source reconfirmado antes da escrita;
- [x] código, testes, fixtures externos, workflows e configurações permaneceram read-only;
- [x] fonte integral do blob foi incorporada sem modificação;
- [x] 632 linhas textuais + newline final = 633 posições cobertas;
- [x] chamadores, consumidores, dependências, side effects e rotas foram identificados;
- [x] assertions E2E foram lidas antes da classificação de evidência;
- [x] caminhos diretos, indiretos, gates estáticos e ausência de prova foram separados;
- [x] quatro necessidades externas foram registradas como solicitações ao auditor;
- [x] nenhuma prova foi fabricada por alteração do objeto auditado.

**Resultado:** a Bíblia documenta o comportamento real do blob `1cd13486bf3a6c1a3d5d4b645e5564be108d6ad4`. As solicitações 095-001 a 095-004 não bloqueiam a conclusão documental.

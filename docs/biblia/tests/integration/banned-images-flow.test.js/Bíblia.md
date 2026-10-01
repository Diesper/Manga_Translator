# Bíblia técnica — tests/integration/banned-images-flow.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 23  
> **SHA auditado:** 7624e120e7ffac4efd5abe5c68fc5706aea35017  
> **Agente responsável:** AGENTE 23  
> **Índice do corpus:** 106  
> **Tipo:** teste Jest de integração por nomenclatura / modelo sintético de banimento sobre ChromeStorageMock  
> **Linhas textuais:** **211**  
> **Posições documentais:** **212**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible  
> **Escopo de escrita respeitado:** somente esta Bíblia, a reserva e o state #106; código, testes, fixtures, workflows e arquivos globais permaneceram somente leitura.

## 1. Papel arquitetural

Este arquivo pretende proteger a regressão histórica **BUG #9 + INCONS #2**: uma URL banida no popup deve deixar de ser elegível quando o content script lista/auto-seleciona imagens, inclusive no caminho do botão flutuante.

O papel **real** do arquivo é mais estreito que o cabeçalho. A suíte usa o `ChromeStorageMock` real do harness Jest, mas implementa localmente três funções de produção em versão simplificada:

- `simulateGetPageImages`;
- `simulateBanImages`;
- `simulateUnbanImages`.

Ela não importa nem executa `extension/popup/popup.js`, `extension/content/content_manga.js` ou `extension/content/cm-dom-replace.js`. Portanto, suas assertions provam diretamente o **modelo sintético desta suíte** e o comportamento do storage mock sob esse modelo; não devem ser citadas isoladamente como prova do fluxo real completo.

A proteção real do produto existe em outras suítes focais e foi lida separadamente nesta auditoria. O principal valor residual do #106 é documentar o contrato conceitual da regressão e exercitar persistência/isolamento/idempotência no mock, mas o nome “integração” e os comentários de “fluxo completo” superestimam sua própria força probatória.

## 2. Dependências diretas

### 2.1 `path`

Importado na linha 19 e usado na linha 26 para montar o caminho absoluto do mock. É dependência Node.js real e utilizada.

### 2.2 `fs`

Importado na linha 20, porém não existe consumo posterior. É import morto no SHA auditado. A presença não altera o teste, mas adiciona ruído e pode induzir a impressão de que o arquivo lê código/fixtures reais do filesystem — ele não lê.

### 2.3 `tests/helpers/repo-root.js`

SHA observado: **b2520d65820e7b9072602018b0f46609ac967c58**.

`findRepoRoot(__dirname)` sobe diretórios até localizar `extension/manifest.json`, permitindo resolver a raiz independentemente do cwd. Neste arquivo, a raiz serve apenas para localizar `tests/mocks/chrome-api.mock.js`.

### 2.4 `tests/mocks/chrome-api.mock.js`

SHA observado: **c1d9a056b7777183bfd3f540c49811335f410425**.

O `ChromeStorageMock`:

- mantém estado em memória;
- suporta `get(keys, callback)` e retorna Promise;
- suporta `set(items, callback)` e retorna Promise;
- agenda callbacks/resolve com timers;
- é resetado pelo setup Jest entre testes;
- é exposto por `getStorageMock()`.

O #106 usa tanto a forma callback (`simulate*`) quanto a forma Promise direta (linhas 82 e 206).

## 3. Wiring real da suíte

### 3.1 Jest

`jest.config.js` observado no SHA **f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc** define o projeto `integration` com:

- ambiente `jsdom`;
- `testMatch: <rootDir>/tests/integration/**/*.test.js`;
- setup de `chrome-api.mock.js`;
- setup de `dom-environment.js`.

Logo, este arquivo pertence estruturalmente ao projeto Jest de integração.

### 3.2 package.json

`package.json` observado no SHA **51bbd80a5a8a6c49385ce7aa4ec10afc79c7aa48**:

- `test:integration` executa Jest com `--selectProjects integration`;
- `test:ci` executa `scripts/ci/run-jest-ci.js`;
- o runner de CI inventaria todos os `.test.js` sob `tests/integration/`.

### 3.3 GitHub Actions

`.github/workflows/ci.yml` observado no SHA **ebee75820db9bfab618bf3c3016065c5bc857ed7**:

- job Linux `unit-and-integration` executa `npm run test:ci` em Node 20 e 22;
- o job de portabilidade também possui etapa explícita `npm run test:integration`.

Isto prova wiring estático e participação esperada na CI. **Nenhuma execução nova foi fabricada por esta auditoria**, e esta Bíblia não reivindica que a sessão atual tenha executado Jest.

## 4. Fluxo interno do arquivo

O fluxo da suíte é:

`beforeEach`
→ obtém `storageMock`
→ zera `bannedImages_testmanga.com`
→ cada teste usa uma ou mais funções `simulate*`
→ assertions verificam listas/URLs/cardinalidade
→ setup global do mock faz cleanup posterior.

Os helpers locais modelam três operações:

1. **Listagem:** lê `bannedImages_<host>`, filtra largura ≥300, altura ≥400 e URL não banida, depois projeta campos básicos.
2. **Ban:** lê array atual, adiciona URLs ainda ausentes e persiste.
3. **Unban:** lê array atual, remove URLs selecionadas e persiste.

## 5. Comparação com as implementações reais

### 5.1 Popup real

`extension/popup/popup.js`, SHA observado **300cfe9a9c81814443c9d52a17915d851408748b**:

- deriva `bannedKey = bannedImages_<hostname>`;
- o handler de `btnBanSelected` coleta `data-src` das cards selecionadas, evita duplicatas em `bannedUrls` e grava em `chrome.storage.local`;
- o desbanimento real suporta agrupamento por host e atualização de múltiplas chaves.

`simulateBanImages` captura somente o núcleo “array por host + dedupe + set”. Não modela DOM, seleção de cards, recarregamento de grids ou fluxo multi-host do desbanimento.

### 5.2 Content script real

`extension/content/content_manga.js`, SHA observado **a8b3698019f6f22027f09f544f15c0563a9f6515**:

- no `GET_PAGE_IMAGES`, lê `bannedImages_<hostname>`;
- delega a elegibilidade a `getScanEligibleImages(banned, imageMinDimensions)`;
- o caminho de auto-seleção do botão flutuante também lê a mesma chave e usa o mesmo helper real.

### 5.3 Filtro real

`extension/content/cm-dom-replace.js`, SHA observado **d3fc72032dbddc81eae8fadc5e4da89b13a3bb79**, implementa `getScanEligibleImages` com regras ausentes da simulação:

- mínimos configuráveis, com fallbacks 300×400;
- preservação do **índice original do DOM**;
- exclusão de `data-translated="true"`;
- exclusão por lista banida;
- normalização/agrupamento por URL limpa;
- tratamento de backdrop/blur;
- deduplicação;
- ordenação final pelo índice original.

A linha 42 do #106 usa o índice `i` **depois** de filtrar, portanto a simulação pode produzir índices diferentes do produto.

## 6. Provas reais externas lidas

Estas provas são independentes do #106 e evitam confundir sua simulação com o produto real.

### 6.1 Ban do popup real

`tests/integration/popup.advanced.ui.test.js`, SHA **dd15edcefd5963fea83a72801b1d3c00b7e37453**:

- carrega `extension/popup/popup.html` e `popup.js` reais via `loadExtensionPage`;
- clica `#btn-ban-selected`;
- lê `bannedImages_<host>` no storage;
- exige 21 URLs banidas;
- verifica que o grid principal é esvaziado e a aba de banidas contém 21 cards;
- possui caso real de desbanimento que exige array vazio e reintegração ao grid.

**Classificação:** ✅ PROVADO DIRETAMENTE para o comportamento do popup real coberto por essas assertions.

### 6.2 `GET_PAGE_IMAGES` real

`tests/unit/content-manga/extraction-and-handlers-real.test.js`, SHA **038961e8228c7b5f1a87023a739ad5f33288423b**:

- carrega o content script real por `loadContentScript`;
- prepara uma URL banida, uma pequena e uma já traduzida;
- envia `GET_PAGE_IMAGES`;
- exige resposta exata contendo somente a imagem elegível remanescente.

**Classificação:** ✅ PROVADO DIRETAMENTE para a filtragem real exercitada.

### 6.3 Auto-seleção do botão flutuante real

`tests/unit/content-manga/extract-flow-real.test.js`, SHA **1bbc481d426bf7471eb655cf514e20d2b323902b**:

- carrega o content script real com uma URL banida e uma imagem pequena;
- clica `#manga-main-content`, caminho operacional do botão;
- captura a mensagem real `START_BATCH`;
- exige `images: [{index:0},{index:3}]`, excluindo a banida de índice 1 e a pequena de índice 2.

**Classificação:** ✅ PROVADO DIRETAMENTE para a auto-seleção real coberta.

### 6.4 Todas banidas no handler real

`tests/unit/content-manga/auto-restorer-real.test.js`, SHA **cf792733e62f4b787073f1f7257e2701d29547a6**, carrega o content script real com todas as imagens banidas e exige resposta vazia de `GET_PAGE_IMAGES`.

**Classificação:** ✅ PROVADO DIRETAMENTE para esse caso real.

## 7. Matriz de evidência deste arquivo

| Comportamento alegado | Evidência dentro do #106 | Evidência real externa | Classificação correta |
|---|---|---|---|
| helper local exclui URL banida | assertions 107, 141 e outras sobre `simulateGetPageImages` | há testes reais separados | ✅ PROVADO DIRETAMENTE **apenas para a simulação** |
| ban local persiste entre chamadas | linhas 114–128 | storage mock real é usado | ✅ PROVADO DIRETAMENTE para o modelo da suíte |
| unban local restaura URL | linhas 133–150 | popup real tem teste externo | ✅ PROVADO DIRETAMENTE para a simulação |
| chave é isolada por hostname | linhas 154–165 | contrato real usa chave por hostname | ✅ PROVADO DIRETAMENTE para o modelo da suíte |
| múltiplos bans são aceitos | linhas 188–198 | popup real tem caso de 21 imagens | ✅ PROVADO DIRETAMENTE para a simulação |
| helper local evita duplicata | linhas 201–208 | popup real também usa `includes` | ✅ PROVADO DIRETAMENTE para a simulação |
| popup real grava bans | não executado aqui | `popup.advanced.ui.test.js` executa implementação real | ✅ PROVADO DIRETAMENTE fora deste arquivo |
| `GET_PAGE_IMAGES` real exclui banidas | não executado aqui | `extraction-and-handlers-real.test.js` | ✅ PROVADO DIRETAMENTE fora deste arquivo |
| botão flutuante real exclui banidas ao auto-selecionar | não executado aqui | `extract-flow-real.test.js` | ✅ PROVADO DIRETAMENTE fora deste arquivo |
| popup real → mesmo storage → botão flutuante real no **mesmo teste** | não | não foi localizada prova única acoplando ambos | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do fluxo ponta a ponta |
| “popup e botão retornam o mesmo resultado” do Cenário 4 | chama a mesma função duas vezes | provas reais dos lados existem separadamente | ⚠️ SEM PROVA ESPECÍFICA de equivalência entre dois caminhos reais |
| arquivo é selecionado pelo projeto Jest integration | não é assertion do #106 | `jest.config.js` inclui `tests/integration/**/*.test.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI pretende executar a suíte | não é assertion do #106 | workflow chama `test:ci`/integração | 🟨 EXECUTADO INDIRETAMENTE no pipeline configurado; nenhuma execução desta sessão foi reivindicada |

## 8. Invariantes

1. O contrato de storage conceitual é `bannedImages_<hostname> -> string[]`.
2. Bans de um hostname não devem contaminar outro hostname.
3. Banir a mesma URL repetidamente deve ser idempotente.
4. Desbanir deve retirar somente as URLs solicitadas.
5. URLs banidas não devem aparecer na lista elegível de tradução.
6. O produto real deve preservar o índice original do DOM ao listar candidatos.
7. A regra real de tamanho deve seguir `imageMinWidth/imageMinHeight`, não valores hardcoded fora do fallback.
8. Imagens já traduzidas e backdrops/deduplicatas também participam da elegibilidade real.
9. O popup e o content script precisam concordar no nome/formato da chave de storage.
10. Uma prova de integração desse contrato deve executar implementações reais dos dois lados; duplicar a regra em helpers não basta.

## 9. Casos-limite e riscos

- chave ausente: helpers locais usam `[]`;
- hostname vazio ou inesperado: geraria `bannedImages_`; não há cenário;
- valor de storage não-array: os helpers assumem `includes/filter`; não há validação nem cenário;
- URLs equivalentes com diferenças de query/hash: o #106 compara strings cruas; o filtro real possui normalização para deduplicação visual, mas ban continua por `img.src` exato;
- primeira imagem banida: a simulação renumera a seguinte para índice 0; o real preserva índice 1;
- `imageMinWidth/imageMinHeight` customizados: não modelados aqui;
- `data-translated=true`: não modelado;
- backdrops/blur/URLs duplicadas: não modelados;
- popup multi-host no desbanimento: não modelado;
- falha/rejeição de storage: não modelada;
- concorrência de duas escritas de ban: não modelada;
- `BANNER` do caso nominal é válido, mas a assertion não exige sua presença;
- Cenário 4 é tautológico do ponto de vista de implementação: mesma função + mesmos argumentos + mesmo estado deve produzir a mesma saída.

## 10. Análise crítica

1. **Nome e comentário superestimam a integração.** O teste é um modelo sobre storage, não fluxo completo de UI + content script.
2. **Duplicação de lógica cria risco de falso verde.** Produção pode mudar e as funções `simulate*` permanecerem inalteradas.
3. **Índice divergente.** A simulação recompacta índices após `filter`; o produto preserva posição original do DOM.
4. **Filtro incompleto.** Não cobre traduzidas, configuração dinâmica, URL limpa, backdrop ou deduplicação.
5. **Cenário 4 não compara duas implementações.** Compara duas chamadas do mesmo helper.
6. **Caso “todas válidas” é incompleto.** O próprio comentário reconhece que `BANNER` é válido e opta por não assertá-lo.
7. **`fs` é import morto.**
8. **Há valor documental/histórico.** A suíte registra o contrato regressivo e cobre idempotência/isolamento de maneira simples.
9. **O produto não depende exclusivamente deste teste.** As suítes reais externas fornecem provas diretas mais fortes para cada lado.
10. **A lacuna é o acoplamento real ponta a ponta.** Esse é exatamente o objetivo que o cabeçalho atribui ao #106 e que ainda não foi localizado em uma única prova automatizada.

## 11. Solicitações ao auditor

### 106-001 — TEST_REQUIRED — ACCEPTED

- **Arquivo alvo:** `tests/integration/banned-images-flow.test.js`
- **Encontrado ao auditar:** este arquivo.
- **Achado:** a suíte se apresenta como integração completa popup → storage → `GET_PAGE_IMAGES`/botão flutuante, porém nunca carrega `popup.js`, `content_manga.js` ou `cm-dom-replace.js`; ela reimplementa três caminhos locais em `simulateGetPageImages`, `simulateBanImages` e `simulateUnbanImages`.
- **Evidência atual:** o arquivo prova diretamente a semântica de suas simulações sobre `ChromeStorageMock`. Em arquivos externos existem provas reais separadas: `popup.advanced.ui.test.js` prova o clique real de ban; `extraction-and-handlers-real.test.js` prova o handler real `GET_PAGE_IMAGES`; `extract-flow-real.test.js` prova a auto-seleção real do botão excluindo banidas.
- **Evidência ausente:** uma prova única de integração em que o **popup real** grave `bannedImages_<host>` e, no mesmo storage/contexto controlado, o **content script real** consuma esse estado pelo `GET_PAGE_IMAGES` e/ou clique do botão flutuante, sem duplicar a lógica.
- **Por que a evidência atual é insuficiente:** uma mudança incompatível entre os dois lados (nome da chave, formato dos valores, momento da leitura ou regra de elegibilidade) pode quebrar a integração real enquanto as funções `simulate*` continuam verdes.
- **Ação solicitada:** em alteração de teste separada, substituir ou complementar a suíte com carregamento das implementações reais por meio de `loadExtensionPage` e `loadContentScript`, compartilhando o mesmo mock de storage; alternativamente, reclassificar explicitamente este arquivo como teste de modelo e deixar a integração real em outra suíte focal.
- **Evidência esperada:** após clicar `btn-ban-selected` no popup real, a chave correta deve conter a URL; em seguida, o content script real no mesmo hostname deve omiti-la de `GET_PAGE_IMAGES` e não incluí-la em `START_BATCH` disparado pela auto-seleção do botão.
- **Regressão possível:** o popup e o content script podem divergir no contrato de storage e o teste atual continuar passando por testar apenas cópias locais da regra.
- **Impacto:** a regressão que o próprio cabeçalho identifica como BUG #9 + INCONS #2 pode voltar sem ser detectada por esta suíte específica.
- **Severidade:** HIGH.

### 106-002 — TEST_QUALITY — ACCEPTED

- **Arquivo alvo:** `tests/integration/banned-images-flow.test.js`
- **Encontrado ao auditar:** fidelidade das fixtures/assertions deste arquivo em relação ao comportamento real.
- **Achado:** o primeiro caso se chama “todas as imagens válidas são retornadas”, reconhece que `BANNER` (960×480) é válido, mas não o assert; além disso, `simulateGetPageImages` renumera índices depois do filtro, enquanto a implementação real preserva o índice original do DOM e aplica regras adicionais de traduzida/deduplicação/backdrop e limites configuráveis.
- **Evidência atual:** assertions de presença das duas páginas, exclusão por URL, cardinalidade, isolamento por host e não duplicação do array simulado.
- **Evidência ausente:** assertion da lista completa no caso nominal, do índice original após remover uma imagem anterior, e de equivalência/fidelidade do helper simulado à implementação atual.
- **Por que importa:** o modelo local pode se afastar silenciosamente do produto e manter a suíte verde; em especial, índices recompactados podem mascarar seleção da imagem errada.
- **Ação solicitada:** preferir a implementação real. Se a simulação for mantida, restringir explicitamente seu contrato, assertar o conjunto completo esperado e adicionar caso que detecte renumeração indevida de índice.
- **Evidência esperada:** lista exata contendo as três imagens no caso nominal; após banir a imagem de índice 0, a imagem seguinte deve conservar o índice DOM original na prova que representa o produto real.
- **Regressão possível:** seleção/roteamento por índice pode se deslocar sem quebrar assertions baseadas apenas em `src`.
- **Impacto:** qualidade e confiabilidade da suíte; não invalida as provas reais existentes em outras suítes.
- **Severidade:** NORMAL.


## 12. Invariantes documentais desta Bíblia

- O SHA auditado é válido somente para **7624e120e7ffac4efd5abe5c68fc5706aea35017**.
- A fonte integral abaixo deve permanecer byte-equivalente ao blob auditado.
- As 212 posições, incluindo o newline final, estão documentadas.
- Afirmações sobre código real são separadas das assertions do helper simulado.
- Nenhuma alteração externa foi feita para fabricar prova.
- As duas solicitações externas permanecem registradas em `.state/106.json` sem bloquear a conclusão documental.

## 13. Fonte integral auditada

~~~javascript
/**
 * banned-images-flow.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste de integração: Fluxo completo de banimento de imagens.
 *
 * CENÁRIO: O usuário bane uma imagem via popup. Depois, ao clicar no botão
 * flutuante (sem passar pelo popup), a imagem banida NÃO deve aparecer na
 * lista de imagens a traduzir.
 *
 * Testa a correção de BUG #9 + INCONS #2: antes da correção, o popup filtrava
 * mas o botão flutuante não. Após a correção, GET_PAGE_IMAGES filtra na fonte.
 *
 * Este é um teste de INTEGRAÇÃO porque cobre:
 * 1. Armazenamento de ban no chrome.storage (popup.js → storage)
 * 2. Leitura do ban no GET_PAGE_IMAGES (content_manga.js ← storage)
 * 3. Consistência entre os dois caminhos de tradução
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

describe('Fluxo de Banimento de Imagens — Integração (BUG #9 + INCONS #2)', () => {

    const HOSTNAME = 'testmanga.com';
    const BAN_KEY  = `bannedImages_${HOSTNAME}`;

    // Simulação do handler GET_PAGE_IMAGES (content_manga.js v3.1)
    async function simulateGetPageImages(chromeStorage, hostname, domImages) {
        return new Promise(resolve => {
            chromeStorage.get([`bannedImages_${hostname}`], (data) => {
                const banned = data[`bannedImages_${hostname}`] || [];
                const validImages = domImages.filter(img =>
                    img.naturalWidth >= 300 &&
                    img.naturalHeight >= 400 &&
                    !banned.includes(img.src)
                ).map((img, i) => ({ index: i, src: img.src, width: img.naturalWidth, height: img.naturalHeight }));
                resolve(validImages);
            });
        });
    }

    // Simulação do handler de ban do popup.js
    async function simulateBanImages(chromeStorage, hostname, urlsToBan) {
        return new Promise(resolve => {
            const banKey = `bannedImages_${hostname}`;
            chromeStorage.get([banKey], (data) => {
                const existing = data[banKey] || [];
                urlsToBan.forEach(url => {
                    if (!existing.includes(url)) existing.push(url);
                });
                chromeStorage.set({ [banKey]: existing }, resolve);
            });
        });
    }

    // Simulação do handler de unban
    async function simulateUnbanImages(chromeStorage, hostname, urlsToUnban) {
        return new Promise(resolve => {
            const banKey = `bannedImages_${hostname}`;
            chromeStorage.get([banKey], (data) => {
                const updated = (data[banKey] || []).filter(url => !urlsToUnban.includes(url));
                chromeStorage.set({ [banKey]: updated }, resolve);
            });
        });
    }

    const MANGA_PAGE_1 = { src: 'https://cdn.manga.com/page1.png', naturalWidth: 800, naturalHeight: 1200 };
    const MANGA_PAGE_2 = { src: 'https://cdn.manga.com/page2.png', naturalWidth: 800, naturalHeight: 1200 };
    const BANNER       = { src: 'https://cdn.manga.com/banner.png', naturalWidth: 960, naturalHeight: 480 };

    let storageMock;

    beforeEach(async () => {
        storageMock = getStorageMock();
        // Estado inicial: sem banidas
        await storageMock.set({ [BAN_KEY]: [] });
    });

    describe('Cenário 1: Ban via popup afeta o botão flutuante', () => {
        test('antes do ban: todas as imagens válidas são retornadas', async () => {
            const images = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]
            );
            // BANNER não passa pelo filtro de tamanho (altura 480 < 400? Não, 480 > 400)
            // Na verdade 480 > 400 então BANNER seria incluído
            // Vamos verificar apenas as páginas de mangá
            expect(images.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);
            expect(images.some(img => img.src === MANGA_PAGE_2.src)).toBe(true);
        });

        test('após ban de uma imagem: imagem banida não aparece no botão', async () => {
            // 1. Usuário bane BANNER via popup
            await simulateBanImages(storageMock, HOSTNAME, [BANNER.src]);

            // 2. Botão flutuante chama GET_PAGE_IMAGES
            const images = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]
            );

            // BANNER deve ser excluído
            expect(images.some(img => img.src === BANNER.src)).toBe(false);

            // Páginas de mangá devem continuar
            expect(images.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);
            expect(images.some(img => img.src === MANGA_PAGE_2.src)).toBe(true);
        });

        test('ban é persistido entre chamadas ao GET_PAGE_IMAGES', async () => {
            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_2.src]);

            // Primeira chamada
            const result1 = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]
            );
            expect(result1).toHaveLength(1);

            // Segunda chamada (simula nova abertura do popup ou clique no botão)
            const result2 = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]
            );
            expect(result2).toHaveLength(1);
            expect(result2[0].src).toBe(MANGA_PAGE_1.src);
        });
    });

    describe('Cenário 2: Desbanimento restaura imagem', () => {
        test('após unban: imagem volta a aparecer', async () => {
            // 1. Bana
            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);

            // 2. Confirma ban
            const afterBan = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]
            );
            expect(afterBan.some(img => img.src === MANGA_PAGE_1.src)).toBe(false);

            // 3. Desbanir
            await simulateUnbanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);

            // 4. Imagem volta
            const afterUnban = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]
            );
            expect(afterUnban.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);
        });
    });

    describe('Cenário 3: Ban é isolado por domínio', () => {
        test('ban em domínio A não afeta domínio B', async () => {
            const HOSTNAME_B = 'outromanga.com';

            // Bana no domínio A
            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);

            // Domínio B não deve ter nenhum ban
            const imagesB = await simulateGetPageImages(
                storageMock, HOSTNAME_B, [MANGA_PAGE_1, MANGA_PAGE_2]
            );
            expect(imagesB.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);
        });
    });

    describe('Cenário 4: Consistência popup vs botão flutuante (INCONS #2)', () => {
        test('popup e botão retornam o mesmo resultado para o mesmo estado', async () => {
            await simulateBanImages(storageMock, HOSTNAME, [BANNER.src]);

            // Simula o que o popup faz (após receber a lista do content script)
            const fromContentScript = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]
            );

            // Simula o que o botão flutuante faz diretamente
            const fromButton = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]
            );

            expect(fromContentScript).toEqual(fromButton);
        });
    });

    describe('Cenário 5: Múltiplos bans simultâneos', () => {
        test('bana várias imagens de uma vez (btnBanSelected)', async () => {
            await simulateBanImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1.src, BANNER.src]
            );

            const images = await simulateGetPageImages(
                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]
            );

            expect(images).toHaveLength(1);
            expect(images[0].src).toBe(MANGA_PAGE_2.src);
        });

        test('ban não cria duplicatas na lista', async () => {
            // Bana a mesma imagem duas vezes
            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);
            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);

            const data = await storageMock.get([BAN_KEY]);
            const count = data[BAN_KEY].filter(url => url === MANGA_PAGE_1.src).length;
            expect(count).toBe(1);
        });
    });
});
~~~

## 14. Análise posicional linha a linha

### Linha 001

- **Conteúdo:** `/**`
- **Papel:** Abre o comentário de cabeçalho que define a intenção histórica do arquivo.

### Linha 002

- **Conteúdo:** ` * banned-images-flow.test.js`
- **Papel:** Nomeia o próprio teste; serve como identificação humana, sem efeito executável.

### Linha 003

- **Conteúdo:** ` * ─────────────────────────────────────────────────────────────────────────────`
- **Papel:** Separador visual do cabeçalho.

### Linha 004

- **Conteúdo:** ` * Teste de integração: Fluxo completo de banimento de imagens.`
- **Papel:** Declara o arquivo como teste de integração de fluxo completo. A implementação atual não sustenta integralmente essa alegação porque usa funções `simulate*` locais.

### Linha 005

- **Conteúdo:** ` *`
- **Papel:** Linha vazia interna ao comentário.

### Linha 006

- **Conteúdo:** ` * CENÁRIO: O usuário bane uma imagem via popup. Depois, ao clicar no botão`
- **Papel:** Inicia a narrativa do cenário: banimento originado no popup.

### Linha 007

- **Conteúdo:** ` * flutuante (sem passar pelo popup), a imagem banida NÃO deve aparecer na`
- **Papel:** Continua a narrativa, afirmando consumo posterior pelo botão flutuante.

### Linha 008

- **Conteúdo:** ` * lista de imagens a traduzir.`
- **Papel:** Conclui a expectativa de que a URL banida desapareça da lista de tradução.

### Linha 009

- **Conteúdo:** ` *`
- **Papel:** Separador dentro do comentário de cabeçalho.

### Linha 010

- **Conteúdo:** ` * Testa a correção de BUG #9 + INCONS #2: antes da correção, o popup filtrava`
- **Papel:** Vincula o teste às regressões históricas BUG #9 e INCONS #2.

### Linha 011

- **Conteúdo:** ` * mas o botão flutuante não. Após a correção, GET_PAGE_IMAGES filtra na fonte.`
- **Papel:** Afirma que `GET_PAGE_IMAGES` passou a filtrar na fonte; isso é verdadeiro no código atual, mas este arquivo não chama o handler real.

### Linha 012

- **Conteúdo:** ` *`
- **Papel:** Separador interno do comentário.

### Linha 013

- **Conteúdo:** ` * Este é um teste de INTEGRAÇÃO porque cobre:`
- **Papel:** Introduz a justificativa para chamar a suíte de integração.

### Linha 014

- **Conteúdo:** ` * 1. Armazenamento de ban no chrome.storage (popup.js → storage)`
- **Papel:** Alega cobrir popup → `chrome.storage`; neste arquivo esse caminho é modelado por `simulateBanImages`, não por `popup.js`.

### Linha 015

- **Conteúdo:** ` * 2. Leitura do ban no GET_PAGE_IMAGES (content_manga.js ← storage)`
- **Papel:** Alega cobrir `content_manga.js` ← storage; aqui a leitura é modelada por `simulateGetPageImages`, não pelo content script real.

### Linha 016

- **Conteúdo:** ` * 3. Consistência entre os dois caminhos de tradução`
- **Papel:** Alega consistência entre dois caminhos de tradução; o Cenário 4 chama a mesma função simulada duas vezes, portanto não compara dois caminhos reais.

### Linha 017

- **Conteúdo:** ` */`
- **Papel:** Fecha o comentário de cabeçalho.

### Linha 018

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de imports e bootstrap; não possui efeito em runtime.

### Linha 019

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa `path`, usado para montar o caminho absoluto do mock de Chrome.

### Linha 020

- **Conteúdo:** `const fs   = require('fs');`
- **Papel:** Importa `fs`, porém nenhum uso de `fs` existe no restante do arquivo; é dependência morta neste teste.

### Linha 021

- **Conteúdo:** `// Portable root finder — works regardless of where this file is placed in the tree.`
- **Papel:** Comentário explica a intenção portável do localizador da raiz.

### Linha 022

- **Conteúdo:** `// Walks up from __dirname until it finds the folder containing extension/manifest.json.`
- **Papel:** Detalha o sentinela `extension/manifest.json` usado pelo helper externo.

### Linha 023

- **Conteúdo:** `const { findRepoRoot } = require('../helpers/repo-root');`
- **Papel:** Importa `findRepoRoot` do helper real de testes.

### Linha 024

- **Conteúdo:** `const ROOT = findRepoRoot(__dirname);`
- **Papel:** Resolve a raiz do repositório a partir de `__dirname`, permitindo que o require do mock não dependa do cwd.

### Linha 025

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de imports e bootstrap; não possui efeito em runtime.

### Linha 026

- **Conteúdo:** `const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));`
- **Papel:** Importa apenas `getStorageMock` do mock real de Chrome; nenhuma implementação de popup/content é importada.

### Linha 027

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de simulação de GET_PAGE_IMAGES; não possui efeito em runtime.

### Linha 028

- **Conteúdo:** `describe('Fluxo de Banimento de Imagens — Integração (BUG #9 + INCONS #2)', () => {`
- **Papel:** Abre a suíte Jest principal e registra os identificadores históricos BUG #9 + INCONS #2.

### Linha 029

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de simulação de GET_PAGE_IMAGES; não possui efeito em runtime.

### Linha 030

- **Conteúdo:** `    const HOSTNAME = 'testmanga.com';`
- **Papel:** Define o hostname sintético usado pela maioria dos casos.

### Linha 031

- **Conteúdo:** `    const BAN_KEY  = \`bannedImages_${HOSTNAME}\`;`
- **Papel:** Deriva a chave de banimento exatamente no formato `bannedImages_<hostname>`.

### Linha 032

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de simulação de GET_PAGE_IMAGES; não possui efeito em runtime.

### Linha 033

- **Conteúdo:** `    // Simulação do handler GET_PAGE_IMAGES (content_manga.js v3.1)`
- **Papel:** Rotula o próximo helper como simulação do handler `GET_PAGE_IMAGES`; esta linha explicita que não é o handler real.

### Linha 034

- **Conteúdo:** `    async function simulateGetPageImages(chromeStorage, hostname, domImages) {`
- **Papel:** Declara `simulateGetPageImages`, recebendo storage, hostname e uma lista de objetos-imagem sintéticos.

### Linha 035

- **Conteúdo:** `        return new Promise(resolve => {`
- **Papel:** Cria Promise para adaptar o callback de `chromeStorage.get` ao uso com `await` nos testes.

### Linha 036

- **Conteúdo:** `            chromeStorage.get([\`bannedImages_${hostname}\`], (data) => {`
- **Papel:** Lê do mock a chave de banimento específica do hostname recebido.

### Linha 037

- **Conteúdo:** `                const banned = data[\`bannedImages_${hostname}\`] || [];`
- **Papel:** Usa lista vazia quando a chave não existe.

### Linha 038

- **Conteúdo:** `                const validImages = domImages.filter(img =>`
- **Papel:** Inicia filtro dos objetos de imagem fornecidos pela fixture.

### Linha 039

- **Conteúdo:** `                    img.naturalWidth >= 300 &&`
- **Papel:** Aplica largura mínima fixa de 300 px; diverge do código real, que usa configuração dinâmica com fallback 300.

### Linha 040

- **Conteúdo:** `                    img.naturalHeight >= 400 &&`
- **Papel:** Aplica altura mínima fixa de 400 px; diverge do código real, que usa configuração dinâmica com fallback 400.

### Linha 041

- **Conteúdo:** `                    !banned.includes(img.src)`
- **Papel:** Exclui URLs presentes na lista banida.

### Linha 042

- **Conteúdo:** `                ).map((img, i) => ({ index: i, src: img.src, width: img.naturalWidth, height: img.naturalHeight }));`
- **Papel:** Mapeia o resultado para `{index,src,width,height}` usando `i` após o filtro; isso renumera índices, enquanto `getScanEligibleImages` real preserva o índice original do DOM.

### Linha 043

- **Conteúdo:** `                resolve(validImages);`
- **Papel:** Resolve a Promise com a lista simulada.

### Linha 044

- **Conteúdo:** `            });`
- **Papel:** Fecha callback de `get`.

### Linha 045

- **Conteúdo:** `        });`
- **Papel:** Fecha o executor da Promise.

### Linha 046

- **Conteúdo:** `    }`
- **Papel:** Fecha `simulateGetPageImages`.

### Linha 047

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de simulação de ban; não possui efeito em runtime.

### Linha 048

- **Conteúdo:** `    // Simulação do handler de ban do popup.js`
- **Papel:** Rotula o próximo helper como simulação do handler de ban do popup.

### Linha 049

- **Conteúdo:** `    async function simulateBanImages(chromeStorage, hostname, urlsToBan) {`
- **Papel:** Declara `simulateBanImages` para persistir URLs no storage sintético.

### Linha 050

- **Conteúdo:** `        return new Promise(resolve => {`
- **Papel:** Cria Promise para tornar a sequência callback-based aguardável.

### Linha 051

- **Conteúdo:** `            const banKey = \`bannedImages_${hostname}\`;`
- **Papel:** Deriva localmente a chave `bannedImages_<hostname>`.

### Linha 052

- **Conteúdo:** `            chromeStorage.get([banKey], (data) => {`
- **Papel:** Lê o valor atual da chave no mock.

### Linha 053

- **Conteúdo:** `                const existing = data[banKey] || [];`
- **Papel:** Usa array vazio quando não há bans prévios.

### Linha 054

- **Conteúdo:** `                urlsToBan.forEach(url => {`
- **Papel:** Itera cada URL solicitada para banimento.

### Linha 055

- **Conteúdo:** `                    if (!existing.includes(url)) existing.push(url);`
- **Papel:** Evita duplicatas por `includes` antes de fazer `push`, espelhando a intenção do popup real.

### Linha 056

- **Conteúdo:** `                });`
- **Papel:** Fecha o `forEach` de URLs.

### Linha 057

- **Conteúdo:** `                chromeStorage.set({ [banKey]: existing }, resolve);`
- **Papel:** Persiste o array no mock e usa o callback de `set` para resolver a Promise.

### Linha 058

- **Conteúdo:** `            });`
- **Papel:** Fecha callback de leitura.

### Linha 059

- **Conteúdo:** `        });`
- **Papel:** Fecha executor da Promise.

### Linha 060

- **Conteúdo:** `    }`
- **Papel:** Fecha `simulateBanImages`.

### Linha 061

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de simulação de unban; não possui efeito em runtime.

### Linha 062

- **Conteúdo:** `    // Simulação do handler de unban`
- **Papel:** Rotula o helper seguinte como simulação de desbanimento.

### Linha 063

- **Conteúdo:** `    async function simulateUnbanImages(chromeStorage, hostname, urlsToUnban) {`
- **Papel:** Declara `simulateUnbanImages` para remover URLs do array persistido.

### Linha 064

- **Conteúdo:** `        return new Promise(resolve => {`
- **Papel:** Cria Promise aguardável.

### Linha 065

- **Conteúdo:** `            const banKey = \`bannedImages_${hostname}\`;`
- **Papel:** Deriva a chave do hostname recebido.

### Linha 066

- **Conteúdo:** `            chromeStorage.get([banKey], (data) => {`
- **Papel:** Lê o valor atual da chave.

### Linha 067

- **Conteúdo:** `                const updated = (data[banKey] || []).filter(url => !urlsToUnban.includes(url));`
- **Papel:** Filtra para manter apenas URLs que não estão em `urlsToUnban`.

### Linha 068

- **Conteúdo:** `                chromeStorage.set({ [banKey]: updated }, resolve);`
- **Papel:** Persiste o array filtrado e resolve após o callback de `set`.

### Linha 069

- **Conteúdo:** `            });`
- **Papel:** Fecha callback de leitura.

### Linha 070

- **Conteúdo:** `        });`
- **Papel:** Fecha executor da Promise.

### Linha 071

- **Conteúdo:** `    }`
- **Papel:** Fecha `simulateUnbanImages`.

### Linha 072

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de fixtures e beforeEach; não possui efeito em runtime.

### Linha 073

- **Conteúdo:** `    const MANGA_PAGE_1 = { src: 'https://cdn.manga.com/page1.png', naturalWidth: 800, naturalHeight: 1200 };`
- **Papel:** Define fixture de página de mangá 1 com dimensões claramente elegíveis.

### Linha 074

- **Conteúdo:** `    const MANGA_PAGE_2 = { src: 'https://cdn.manga.com/page2.png', naturalWidth: 800, naturalHeight: 1200 };`
- **Papel:** Define fixture de página de mangá 2 com dimensões claramente elegíveis.

### Linha 075

- **Conteúdo:** `    const BANNER       = { src: 'https://cdn.manga.com/banner.png', naturalWidth: 960, naturalHeight: 480 };`
- **Papel:** Define fixture `BANNER` com 960×480; ela também satisfaz os limites fixos 300×400.

### Linha 076

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de fixtures e beforeEach; não possui efeito em runtime.

### Linha 077

- **Conteúdo:** `    let storageMock;`
- **Papel:** Declara referência mutável para o singleton de storage mock fornecido pelo setup Jest.

### Linha 078

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de fixtures e beforeEach; não possui efeito em runtime.

### Linha 079

- **Conteúdo:** `    beforeEach(async () => {`
- **Papel:** Abre `beforeEach` assíncrono da suíte.

### Linha 080

- **Conteúdo:** `        storageMock = getStorageMock();`
- **Papel:** Obtém o `ChromeStorageMock` já inicializado pelo setup `chrome-api.mock.js`.

### Linha 081

- **Conteúdo:** `        // Estado inicial: sem banidas`
- **Papel:** Comentário explicita o estado inicial esperado.

### Linha 082

- **Conteúdo:** `        await storageMock.set({ [BAN_KEY]: [] });`
- **Papel:** Zera somente a chave principal de banimento antes de cada teste.

### Linha 083

- **Conteúdo:** `    });`
- **Papel:** Fecha o `beforeEach`.

### Linha 084

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 085

- **Conteúdo:** `    describe('Cenário 1: Ban via popup afeta o botão flutuante', () => {`
- **Papel:** Abre o grupo de cenários que pretende representar a integração popup → botão flutuante.

### Linha 086

- **Conteúdo:** `        test('antes do ban: todas as imagens válidas são retornadas', async () => {`
- **Papel:** Abre caso nominal antes de qualquer ban.

### Linha 087

- **Conteúdo:** `            const images = await simulateGetPageImages(`
- **Papel:** Inicia chamada à simulação de `GET_PAGE_IMAGES`.

### Linha 088

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]`
- **Papel:** Fornece storage, host e as três imagens sintéticas.

### Linha 089

- **Conteúdo:** `            );`
- **Papel:** Fecha e aguarda a simulação.

### Linha 090

- **Conteúdo:** `            // BANNER não passa pelo filtro de tamanho (altura 480 < 400? Não, 480 > 400)`
- **Papel:** Comentário registra uma hipótese incorreta e imediatamente a questiona: 480 não é menor que 400.

### Linha 091

- **Conteúdo:** `            // Na verdade 480 > 400 então BANNER seria incluído`
- **Papel:** Corrige o comentário anterior e reconhece que `BANNER` é elegível.

### Linha 092

- **Conteúdo:** `            // Vamos verificar apenas as páginas de mangá`
- **Papel:** Decide verificar apenas as duas páginas de mangá, deixando `BANNER` sem assertion neste caso.

### Linha 093

- **Conteúdo:** `            expect(images.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);`
- **Papel:** Afirma diretamente que a simulação inclui `MANGA_PAGE_1`.

### Linha 094

- **Conteúdo:** `            expect(images.some(img => img.src === MANGA_PAGE_2.src)).toBe(true);`
- **Papel:** Afirma diretamente que a simulação inclui `MANGA_PAGE_2`.

### Linha 095

- **Conteúdo:** `        });`
- **Papel:** Fecha o primeiro teste.

### Linha 096

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 097

- **Conteúdo:** `        test('após ban de uma imagem: imagem banida não aparece no botão', async () => {`
- **Papel:** Abre caso que pretende provar efeito do ban sobre o botão.

### Linha 098

- **Conteúdo:** `            // 1. Usuário bane BANNER via popup`
- **Papel:** Comentário descreve banimento do banner como se viesse do popup.

### Linha 099

- **Conteúdo:** `            await simulateBanImages(storageMock, HOSTNAME, [BANNER.src]);`
- **Papel:** Executa `simulateBanImages`; não dispara UI nem `popup.js` real.

### Linha 100

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 101

- **Conteúdo:** `            // 2. Botão flutuante chama GET_PAGE_IMAGES`
- **Papel:** Comentário descreve a próxima chamada como botão flutuante → `GET_PAGE_IMAGES`.

### Linha 102

- **Conteúdo:** `            const images = await simulateGetPageImages(`
- **Papel:** Inicia chamada à simulação de leitura/filtro.

### Linha 103

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]`
- **Papel:** Passa as três imagens ao helper sintético.

### Linha 104

- **Conteúdo:** `            );`
- **Papel:** Fecha e aguarda a simulação.

### Linha 105

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 106

- **Conteúdo:** `            // BANNER deve ser excluído`
- **Papel:** Comentário define a expectativa principal sobre o banner.

### Linha 107

- **Conteúdo:** `            expect(images.some(img => img.src === BANNER.src)).toBe(false);`
- **Papel:** Assertion direta de que a lista simulada não contém a URL banida.

### Linha 108

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 109

- **Conteúdo:** `            // Páginas de mangá devem continuar`
- **Papel:** Comentário exige preservação das páginas não banidas.

### Linha 110

- **Conteúdo:** `            expect(images.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);`
- **Papel:** Assertion direta de presença da primeira página.

### Linha 111

- **Conteúdo:** `            expect(images.some(img => img.src === MANGA_PAGE_2.src)).toBe(true);`
- **Papel:** Assertion direta de presença da segunda página.

### Linha 112

- **Conteúdo:** `        });`
- **Papel:** Fecha o segundo teste.

### Linha 113

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 114

- **Conteúdo:** `        test('ban é persistido entre chamadas ao GET_PAGE_IMAGES', async () => {`
- **Papel:** Abre caso de persistência do ban entre leituras.

### Linha 115

- **Conteúdo:** `            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_2.src]);`
- **Papel:** Bane a segunda página por meio do helper local.

### Linha 116

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 117

- **Conteúdo:** `            // Primeira chamada`
- **Papel:** Marca a primeira leitura da mesma chave persistida.

### Linha 118

- **Conteúdo:** `            const result1 = await simulateGetPageImages(`
- **Papel:** Inicia a primeira simulação de `GET_PAGE_IMAGES`.

### Linha 119

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]`
- **Papel:** Passa duas páginas ao filtro.

### Linha 120

- **Conteúdo:** `            );`
- **Papel:** Fecha a primeira chamada.

### Linha 121

- **Conteúdo:** `            expect(result1).toHaveLength(1);`
- **Papel:** Exige exatamente uma imagem após o ban.

### Linha 122

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 1; não possui efeito em runtime.

### Linha 123

- **Conteúdo:** `            // Segunda chamada (simula nova abertura do popup ou clique no botão)`
- **Papel:** Marca a segunda leitura, interpretada como nova abertura/clique.

### Linha 124

- **Conteúdo:** `            const result2 = await simulateGetPageImages(`
- **Papel:** Inicia segunda simulação com o mesmo estado do mock.

### Linha 125

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]`
- **Papel:** Passa novamente as duas páginas.

### Linha 126

- **Conteúdo:** `            );`
- **Papel:** Fecha a segunda chamada.

### Linha 127

- **Conteúdo:** `            expect(result2).toHaveLength(1);`
- **Papel:** Exige que a cardinalidade continue em um, demonstrando persistência no mock.

### Linha 128

- **Conteúdo:** `            expect(result2[0].src).toBe(MANGA_PAGE_1.src);`
- **Papel:** Exige que a sobrevivente seja `MANGA_PAGE_1`.

### Linha 129

- **Conteúdo:** `        });`
- **Papel:** Fecha o teste de persistência.

### Linha 130

- **Conteúdo:** `    });`
- **Papel:** Fecha o grupo do Cenário 1.

### Linha 131

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 2; não possui efeito em runtime.

### Linha 132

- **Conteúdo:** `    describe('Cenário 2: Desbanimento restaura imagem', () => {`
- **Papel:** Abre grupo de desbanimento.

### Linha 133

- **Conteúdo:** `        test('após unban: imagem volta a aparecer', async () => {`
- **Papel:** Abre caso que espera restauração da imagem.

### Linha 134

- **Conteúdo:** `            // 1. Bana`
- **Papel:** Comentário marca a etapa de ban.

### Linha 135

- **Conteúdo:** `            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);`
- **Papel:** Bane a primeira página com a simulação.

### Linha 136

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 2; não possui efeito em runtime.

### Linha 137

- **Conteúdo:** `            // 2. Confirma ban`
- **Papel:** Comentário marca a confirmação do ban.

### Linha 138

- **Conteúdo:** `            const afterBan = await simulateGetPageImages(`
- **Papel:** Inicia leitura simulada após o ban.

### Linha 139

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]`
- **Papel:** Fornece as duas páginas.

### Linha 140

- **Conteúdo:** `            );`
- **Papel:** Fecha a leitura pós-ban.

### Linha 141

- **Conteúdo:** `            expect(afterBan.some(img => img.src === MANGA_PAGE_1.src)).toBe(false);`
- **Papel:** Confirma que a primeira página está ausente.

### Linha 142

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 2; não possui efeito em runtime.

### Linha 143

- **Conteúdo:** `            // 3. Desbanir`
- **Papel:** Comentário marca a etapa de desbanimento.

### Linha 144

- **Conteúdo:** `            await simulateUnbanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);`
- **Papel:** Remove a primeira página da lista persistida com o helper sintético.

### Linha 145

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 2; não possui efeito em runtime.

### Linha 146

- **Conteúdo:** `            // 4. Imagem volta`
- **Papel:** Comentário marca a leitura de restauração.

### Linha 147

- **Conteúdo:** `            const afterUnban = await simulateGetPageImages(`
- **Papel:** Inicia nova leitura simulada.

### Linha 148

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2]`
- **Papel:** Fornece as duas páginas novamente.

### Linha 149

- **Conteúdo:** `            );`
- **Papel:** Fecha a leitura pós-unban.

### Linha 150

- **Conteúdo:** `            expect(afterUnban.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);`
- **Papel:** Confirma que a primeira página reaparece na lista simulada.

### Linha 151

- **Conteúdo:** `        });`
- **Papel:** Fecha o teste.

### Linha 152

- **Conteúdo:** `    });`
- **Papel:** Fecha o grupo de desbanimento.

### Linha 153

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 3; não possui efeito em runtime.

### Linha 154

- **Conteúdo:** `    describe('Cenário 3: Ban é isolado por domínio', () => {`
- **Papel:** Abre grupo de isolamento por domínio.

### Linha 155

- **Conteúdo:** `        test('ban em domínio A não afeta domínio B', async () => {`
- **Papel:** Abre caso de separação entre domínio A e B.

### Linha 156

- **Conteúdo:** `            const HOSTNAME_B = 'outromanga.com';`
- **Papel:** Define hostname B distinto do hostname principal.

### Linha 157

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 3; não possui efeito em runtime.

### Linha 158

- **Conteúdo:** `            // Bana no domínio A`
- **Papel:** Comentário marca o ban somente no domínio A.

### Linha 159

- **Conteúdo:** `            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);`
- **Papel:** Persiste a primeira página na chave de A.

### Linha 160

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 3; não possui efeito em runtime.

### Linha 161

- **Conteúdo:** `            // Domínio B não deve ter nenhum ban`
- **Papel:** Comentário declara expectativa de ausência de bans em B.

### Linha 162

- **Conteúdo:** `            const imagesB = await simulateGetPageImages(`
- **Papel:** Inicia consulta simulada usando hostname B.

### Linha 163

- **Conteúdo:** `                storageMock, HOSTNAME_B, [MANGA_PAGE_1, MANGA_PAGE_2]`
- **Papel:** Fornece as duas páginas ao filtro de B.

### Linha 164

- **Conteúdo:** `            );`
- **Papel:** Fecha a chamada.

### Linha 165

- **Conteúdo:** `            expect(imagesB.some(img => img.src === MANGA_PAGE_1.src)).toBe(true);`
- **Papel:** Confirma que a página banida em A ainda aparece para B.

### Linha 166

- **Conteúdo:** `        });`
- **Papel:** Fecha o teste.

### Linha 167

- **Conteúdo:** `    });`
- **Papel:** Fecha o grupo de isolamento.

### Linha 168

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 4; não possui efeito em runtime.

### Linha 169

- **Conteúdo:** `    describe('Cenário 4: Consistência popup vs botão flutuante (INCONS #2)', () => {`
- **Papel:** Abre grupo denominado consistência popup vs botão.

### Linha 170

- **Conteúdo:** `        test('popup e botão retornam o mesmo resultado para o mesmo estado', async () => {`
- **Papel:** Abre teste que afirma comparar os dois caminhos.

### Linha 171

- **Conteúdo:** `            await simulateBanImages(storageMock, HOSTNAME, [BANNER.src]);`
- **Papel:** Bane o banner com o helper local.

### Linha 172

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 4; não possui efeito em runtime.

### Linha 173

- **Conteúdo:** `            // Simula o que o popup faz (após receber a lista do content script)`
- **Papel:** Comentário chama a primeira execução de caminho do popup após receber lista do content script.

### Linha 174

- **Conteúdo:** `            const fromContentScript = await simulateGetPageImages(`
- **Papel:** Inicia primeira chamada a `simulateGetPageImages`.

### Linha 175

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]`
- **Papel:** Fornece as três imagens.

### Linha 176

- **Conteúdo:** `            );`
- **Papel:** Fecha a primeira chamada.

### Linha 177

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 4; não possui efeito em runtime.

### Linha 178

- **Conteúdo:** `            // Simula o que o botão flutuante faz diretamente`
- **Papel:** Comentário chama a segunda execução de caminho do botão flutuante.

### Linha 179

- **Conteúdo:** `            const fromButton = await simulateGetPageImages(`
- **Papel:** Inicia segunda chamada à MESMA função `simulateGetPageImages` com o mesmo estado.

### Linha 180

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]`
- **Papel:** Fornece exatamente os mesmos argumentos efetivos da primeira chamada.

### Linha 181

- **Conteúdo:** `            );`
- **Papel:** Fecha a segunda chamada.

### Linha 182

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 4; não possui efeito em runtime.

### Linha 183

- **Conteúdo:** `            expect(fromContentScript).toEqual(fromButton);`
- **Papel:** Exige igualdade entre duas execuções determinísticas do mesmo helper; não prova equivalência entre implementações diferentes.

### Linha 184

- **Conteúdo:** `        });`
- **Papel:** Fecha o teste.

### Linha 185

- **Conteúdo:** `    });`
- **Papel:** Fecha o grupo de consistência.

### Linha 186

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 5; não possui efeito em runtime.

### Linha 187

- **Conteúdo:** `    describe('Cenário 5: Múltiplos bans simultâneos', () => {`
- **Papel:** Abre grupo de múltiplos bans.

### Linha 188

- **Conteúdo:** `        test('bana várias imagens de uma vez (btnBanSelected)', async () => {`
- **Papel:** Abre caso associado ao botão `btnBanSelected` por nome, mas não clica no botão real.

### Linha 189

- **Conteúdo:** `            await simulateBanImages(`
- **Papel:** Inicia chamada ao helper de ban.

### Linha 190

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1.src, BANNER.src]`
- **Papel:** Fornece duas URLs de uma vez: primeira página e banner.

### Linha 191

- **Conteúdo:** `            );`
- **Papel:** Fecha a chamada.

### Linha 192

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 5; não possui efeito em runtime.

### Linha 193

- **Conteúdo:** `            const images = await simulateGetPageImages(`
- **Papel:** Inicia leitura/filtro simulado após os dois bans.

### Linha 194

- **Conteúdo:** `                storageMock, HOSTNAME, [MANGA_PAGE_1, MANGA_PAGE_2, BANNER]`
- **Papel:** Fornece as três imagens.

### Linha 195

- **Conteúdo:** `            );`
- **Papel:** Fecha a leitura.

### Linha 196

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 5; não possui efeito em runtime.

### Linha 197

- **Conteúdo:** `            expect(images).toHaveLength(1);`
- **Papel:** Exige uma única imagem remanescente.

### Linha 198

- **Conteúdo:** `            expect(images[0].src).toBe(MANGA_PAGE_2.src);`
- **Papel:** Confirma que a sobrevivente é a segunda página.

### Linha 199

- **Conteúdo:** `        });`
- **Papel:** Fecha o teste de múltiplos bans.

### Linha 200

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 5; não possui efeito em runtime.

### Linha 201

- **Conteúdo:** `        test('ban não cria duplicatas na lista', async () => {`
- **Papel:** Abre caso de idempotência do ban.

### Linha 202

- **Conteúdo:** `            // Bana a mesma imagem duas vezes`
- **Papel:** Comentário descreve o duplo ban intencional.

### Linha 203

- **Conteúdo:** `            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);`
- **Papel:** Primeira chamada adiciona a URL ao array.

### Linha 204

- **Conteúdo:** `            await simulateBanImages(storageMock, HOSTNAME, [MANGA_PAGE_1.src]);`
- **Papel:** Segunda chamada tenta adicionar a mesma URL; o `includes` da simulação deve impedir duplicação.

### Linha 205

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco usada como separador visual na seção de Cenário 5; não possui efeito em runtime.

### Linha 206

- **Conteúdo:** `            const data = await storageMock.get([BAN_KEY]);`
- **Papel:** Lê diretamente a chave no storage mock usando a API Promise do mock.

### Linha 207

- **Conteúdo:** `            const count = data[BAN_KEY].filter(url => url === MANGA_PAGE_1.src).length;`
- **Papel:** Conta ocorrências exatas da URL no array persistido.

### Linha 208

- **Conteúdo:** `            expect(count).toBe(1);`
- **Papel:** Exige contagem 1, provando idempotência do helper simulado.

### Linha 209

- **Conteúdo:** `        });`
- **Papel:** Fecha o teste de duplicatas.

### Linha 210

- **Conteúdo:** `    });`
- **Papel:** Fecha o grupo de múltiplos bans.

### Linha 211

- **Conteúdo:** `});`
- **Papel:** Fecha a suíte Jest principal.

### Linha 212

- **Conteúdo:** _linha em branco_
- **Papel:** Posição terminal correspondente ao newline final do arquivo.


## 15. Autoauditoria documental

- **SHA do fonte reconfirmado antes da materialização:** sim — `7624e120e7ffac4efd5abe5c68fc5706aea35017`.
- **Reserva reconfirmada:** sim — proprietário `AGENTE 23`.
- **Fonte integral embutida:** sim.
- **Cobertura:** 211 linhas textuais + newline final = **212/212 posições**.
- **Headings de posição:** Linha 001 → Linha 212, sem lacunas.
- **Dependências reais lidas:** `repo-root.js`, `chrome-api.mock.js`.
- **Implementações reais comparadas:** `popup.js`, `content_manga.js`, `cm-dom-replace.js`.
- **Provas externas reais lidas:** `popup.advanced.ui.test.js`, `extraction-and-handlers-real.test.js`, `extract-flow-real.test.js`, `auto-restorer-real.test.js`.
- **Wiring lido:** `jest.config.js`, `package.json`, `.github/workflows/ci.yml`, `scripts/ci/run-jest-ci.js`.
- **Classificação de evidência conservadora:** sim; simulação não foi promovida a prova do código real.
- **Mudanças funcionais/testes/fixtures para fabricar prova:** nenhuma.
- **Solicitações externas registradas:** 106-001 e 106-002.
- **Linhas desta Bíblia:** 1582.
- **AUDITORIA/STATUS/CHECKLIST globais:** não modificados, por regra de escopo multiagente.
- **Estado documental individual:** concluído e autoauditado segundo o escopo do AGENTE 23.

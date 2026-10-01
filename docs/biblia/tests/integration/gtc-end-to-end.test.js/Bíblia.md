# Bíblia técnica — tests/integration/gtc-end-to-end.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 9042b3b5370afdbce3baf31b01ce3fa9c49b34dc  
> **Agente responsável:** AGENTE 24  
> **Tipo:** suíte Jest de integração baseada em simulações locais de Auto-Restore/GTC/restoreMap  
> **Linhas textuais:** 254  
> **Posições documentais:** 255, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é uma suíte Jest localizada em tests/integration e descoberta pelo projeto Jest chamado integration. Seu objetivo declarado é representar uma jornada de usuário que combina persistência por capítulo, restoreMap e Global Translation Cache (GTC).

O ponto técnico mais importante é que o arquivo **não carrega a implementação de produção dessa jornada**. Ele define quatro implementações espelho dentro do próprio teste:

- getCleanUrl;
- simulateUpdateImage;
- simulateAutoRestore;
- simulateGTCLookup.

A única dependência funcional externa exercitada diretamente é o ChromeStorageMock compartilhado, obtido por getStorageMock. O helper findRepoRoot é usado para localizar o repositório. Portanto, as assertions desta suíte são provas diretas do **modelo local implementado no próprio teste + comportamento do mock de storage**, e não, por si sós, prova end-to-end de content_manga.js, background.js, IndexedDB, Gemini ou IPC real.

Esse limite é especialmente relevante porque o código de produção atual já evoluiu além do modelo descrito aqui: o GTC primário passa por mensagens GTC_QUERY_MANY e pelo repositório IndexedDB; storage.local com chaves gtc_<hash> aparece como fallback legado. A suíte #108 ainda grava e consulta diretamente essas chaves legadas.

## 2. Descoberta e execução pela infraestrutura

### Jest

jest.config.js define o projeto integration com:

- displayName integration;
- ambiente jsdom;
- testMatch tests/integration/**/*.test.js;
- setupFilesAfterEnv apontando para chrome-api.mock.js e dom-environment.js.

Assim, este arquivo é incluído automaticamente no projeto integration por convenção de caminho/nome.

### package.json

- linha 16: test:integration executa Jest selecionando integration;
- linha 26: test:ci usa scripts/ci/run-jest-ci.js;
- linha 27: test:coverage usa o mesmo runner com --coverage.

### GitHub Actions

No workflow ci.yml:

- Unit + Integration roda npm run test:ci em Node 20 e Node 22;
- Code Coverage roda npm run test:coverage;
- Windows Portability roda a validação e também npm run test:ci/test:coverage.

## 3. Dependências reais do arquivo

### Dependências Node/Jest

- path: usado na linha 27 para compor o caminho do mock;
- fs: importado na linha 21, mas **não utilizado** depois;
- findRepoRoot: helper real que sobe pelos diretórios até localizar extension/manifest.json;
- getStorageMock: retorna o singleton ChromeStorageMock criado pelo setup Jest.

### Ambiente implícito

O arquivo depende dos globals Jest describe, test, expect e beforeEach, além de Promise e URL. Como pertence ao projeto integration, roda em jsdom e recebe automaticamente os mocks/configurações de setup.

### Reset de storage

chrome-api.mock.js recria ou limpa o estado entre testes no beforeEach global e limpa timers/mocks no afterEach. O beforeEach local da linha 111 apenas recupera a instância atual por getStorageMock; ele não implementa o reset por conta própria.

## 4. Contratos dos helpers locais

### 4.1 getCleanUrl — linhas 31–37

Contrato do espelho local:

1. entrada vazia ou data URL → null;
2. URL parseável → origin + pathname;
3. query e hash são descartados;
4. URL relativa usa https://siteA.com como base;
5. se new URL lançar, fallback textual remove ? e #.

A linha 137 comprova a normalização do hostname siteA.com para sitea.com no runtime URL usado pelo teste.

**Limite:** este helper é definido no próprio teste. A assertion não fica automaticamente ligada à função de produção que calcula clean URL.

### 4.2 simulateUpdateImage — linhas 39–64

O helper:

1. calcula origCleanUrl;
2. lê <chapterId>_images e <chapterId>_restoreMap;
3. grava translatedBase64 em imgs[index];
4. grava restoreMap[cleanUrl] quando a clean URL existe;
5. cria toSet com as duas estruturas;
6. se origHash existir, grava diretamente gtc_<origHash> em storageMock;
7. persiste tudo com storageMock.set.

O parâmetro chapterList é recebido na assinatura, mas não é usado.

**Diferença para produção:** a implementação real atual de UPDATE_IMAGE em extension/content/content_manga.js substitui a imagem no DOM, coleta múltiplos fingerprints, chama saveGlobalTranslationCacheEntry e persiste a página por um fluxo próprio. O modelo local desta suíte não exercita essas funções.

### 4.3 simulateAutoRestore — linhas 66–82

O helper consulta restoreMap do chapterId e percorre um array fornecido pelo teste. Para cada item, limpa a URL e apenas adiciona um objeto {src, translated} à resposta.

Ele não:

- consulta document.querySelectorAll;
- altera elemento img;
- marca data-translated;
- usa MutationObserver;
- verifica configurações/disabledSites;
- lida com reentrância;
- carrega assets sob demanda.

Esses comportamentos pertencem ao Auto-Restore real e são exercitados em outras suítes, como auto-restorer-real.test.js.

### 4.4 simulateGTCLookup — linhas 84–98

O helper converte hashes em chaves gtc_<hash>, faz um único storageMock.get e devolve hits/misses preservando índices.

Isso modela o cache legado em storage.local. No código atual de produção, content_manga.js tenta primeiro GTC_QUERY_MANY e somente depois usa gtc_<hash> como fallback legacy quando a resposta IPC não entrega entriesByHash.

## 5. Casos de teste e o que realmente provam

### Jornada 1 — linhas 115–141

Prova diretamente, no modelo local, que simulateUpdateImage grava:

- <chapterId>_images[0];
- <chapterId>_restoreMap[cleanUrl];
- gtc_<HASH_P1>.

As três assertions são específicas e falhariam se o helper local deixasse de gravar qualquer uma dessas estruturas.

**Não prova diretamente:** o handler UPDATE_IMAGE real, IndexedDB, GTC_SAVE, DOM replacement, ACK, batch identity ou persistTranslatedPage.

### Jornada 2 — linhas 143–167

O caso positivo mostra que duas URLs que diferem apenas por query token convergem para a mesma clean URL local e recuperam a tradução do restoreMap.

O caso negativo mostra que restoreMap vazio gera zero restaurações.

**Não prova diretamente:** inicialização real do auto-restorer, MutationObserver, DOM replacement ou ausência de chamadas Gemini.

### Jornada 3 — linhas 169–209

O primeiro teste grava um hash fixo e consulta exatamente o mesmo hash. Isso prova que a tabela local indexada por hash é independente da URL originalmente usada para gravá-la.

Porém SITE_B_URL **não participa do cálculo do hash** nesse caso; nenhum fingerprint é gerado a partir da imagem do site B.

O segundo teste prova, no modelo local, duas propriedades separadas:

- restoreMap é segregado por chapterId;
- a chave GTC global continua acessível pelo mesmo hash.

### Jornada 4 — linhas 211–228

Pré-carrega apenas HASH_P1 e confirma:

- hits = [0];
- misses = [1, 2].

O nome do teste diz que o restante “vai para Gemini”, mas não existe chamada a Gemini, START_BATCH ou outro roteador. A assertion comprova **classificação de misses**, não o encaminhamento subsequente.

### Consistência — linhas 230–254

Chama simulateUpdateImage três vezes e confirma cardinalidade de três índices no mapa _images; as assertions verificam explicitamente os valores dos índices 0 e 2. Não há assertion específica para o valor data:T1 do índice 1, portanto a Bíblia não promove esse valor intermediário a prova direta.

## 6. Relação com a implementação de produção atual

A inspeção do branch docs/project-bible mostra:

### content_manga.js

- linha 470 envia action GTC_QUERY_MANY com hashes normalizados;
- linhas 478–485 usam storage.local gtc_<hash> somente como fallback legacy;
- linha 1681 inicia applyAutoRestore real, que trabalha sobre DOM, estado de configuração e reentrância;
- linha 2546 inicia o handler real UPDATE_IMAGE;
- a partir da região 2569 o handler recupera clean URL/fingerprints do elemento real, chama applyImageReplacement, salva GTC pelo helper real e persiste a página.

### gtc-indexeddb.js

- linhas 992–996 tratam GTC_QUERY_MANY chamando repository.getMany e retornando entriesByHash.

### Testes reais correlatos

- auto-restorer-real.test.js carrega o content script real e verifica restauração posterior após UPDATE_IMAGE;
- extraction-and-handlers-real.test.js despacha UPDATE_IMAGE para o listener real e verifica DOM, _images, _restoreMap e mensagem GTC_SAVE;
- gtc-indexeddb-deep.test.js usa repositório IndexedDB real, IPC e loadContentScript;
- gtc-runtime-bridge.test.js cobre roteamento real das mensagens GTC no background.

Essas suítes mitigam parte da lacuna deste arquivo, mas não transformam as simulações locais de #108 em prova da implementação real.

## 7. Evidência automatizada observada

Foi localizado um run de CI anterior no PR/branch em que o **mesmo blob exato** deste arquivo foi executado:

- run MangaTranslator CI #36577447500;
- blob de tests/integration/gtc-end-to-end.test.js nesse run: 9042b3b5370afdbce3baf31b01ce3fa9c49b34dc, idêntico ao auditado;
- Unit + Integration (20.x), job 109437162616: PASS;
- Unit + Integration (22.x), job 109437162754: PASS;
- Code Coverage, job 109437162502: PASS;
- Windows Portability, job 109437162789: PASS do mesmo arquivo durante as passagens Jest observadas.

Nos jobs Node 20 e Node 22, o log reportou 109 suites e 851 testes aprovados; este arquivo aparece nominalmente como PASS integration tests/integration/gtc-end-to-end.test.js.

Isso comprova que o arquivo auditado é executável, descoberto pela suíte e que suas assertions passam em múltiplos ambientes. Não amplia o objeto dessas assertions para código de produção que não é importado.

## 8. Matriz de evidência

| Propriedade | Evidência atual | Classificação |
|---|---|---|
| arquivo é descoberto pelo projeto integration | jest.config.js testMatch + execução nominal no CI | ✅ PROVADO DIRETAMENTE |
| suíte passa em Node 20 | job 109437162616, mesmo blob | ✅ PROVADO DIRETAMENTE |
| suíte passa em Node 22 | job 109437162754, mesmo blob | ✅ PROVADO DIRETAMENTE |
| suíte passa no caminho coverage | job 109437162502, mesmo blob | ✅ PROVADO DIRETAMENTE |
| suíte executa em Windows | job 109437162789, mesmo blob | ✅ PROVADO DIRETAMENTE |
| helper local grava _images | assertion linha 132 | ✅ PROVADO DIRETAMENTE |
| helper local grava restoreMap por clean URL | assertion linha 137 | ✅ PROVADO DIRETAMENTE |
| helper local grava gtc_<hash> em storageMock | assertion linha 139 | ✅ PROVADO DIRETAMENTE |
| token de query diferente converge no restoreMap local | assertions 158–159 | ✅ PROVADO DIRETAMENTE |
| restoreMap local vazio não restaura | assertion 165 | ✅ PROVADO DIRETAMENTE |
| mesmo hash local produz hit independentemente da URL de origem | assertions 183–185 | ✅ PROVADO DIRETAMENTE |
| restoreMap é segregado pelo chapterId no modelo local | assertion 203 | ✅ PROVADO DIRETAMENTE |
| lookup local parcial preserva índices de hit/miss | assertions 225–226 | ✅ PROVADO DIRETAMENTE |
| múltiplas páginas persistem por índice no modelo local | assertions 249–251 | ✅ PROVADO DIRETAMENTE |
| UPDATE_IMAGE real salva DOM/_images/_restoreMap/GTC | outra suíte real correlata, não este arquivo | 🟨 EXECUTADO INDIRETAMENTE PARA A JORNADA #108 |
| Auto-Restore real trabalha com DOM/MutationObserver | outra suíte real correlata, não este arquivo | 🟨 EXECUTADO INDIRETAMENTE PARA A JORNADA #108 |
| GTC primário real usa IndexedDB/IPC | implementação + outras suítes reais | 🟨 EXECUTADO INDIRETAMENTE PARA A JORNADA #108 |
| miss realmente é enviado ao Gemini | nenhuma assertion neste arquivo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| hit evita Gemini | nenhuma spy/chamada Gemini neste arquivo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| URL do site B gera o mesmo fingerprint | hash é injetado manualmente; SITE_B_URL não gera fingerprint | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |

## 9. Solicitações ao auditor

### 108-001 — TEST_DESIGN_REVIEW — ACCEPTED

**Encontrado:** a suíte é nomeada e comentada como “GTC End-to-End — Jornada Completa”, mas seus fluxos centrais são implementações espelho locais. Ela não importa content_manga.js, gtc-indexeddb.js, background.js nem os helpers reais que implementam a jornada.

**Arquivo auditado/relacionado:** tests/integration/gtc-end-to-end.test.js.

**Evidência atual:** o mesmo blob passa em CI Node 20/22/Windows/coverage e as assertions provam os helpers locais. Outras suítes do repositório exercitam partes da implementação real.

**Evidência ausente:** uma assertion única/focal de jornada que falhe quando a implementação real de UPDATE_IMAGE → persistência → restauração/GTC quebrar, sem depender de lógica espelho duplicada.

**Por que a evidência atual é insuficiente:** uma regressão em produção pode coexistir com todos os helpers locais inalterados e esta suíte continuar verde.

**Ação solicitada:** decidir se esta suíte deve ser renomeada/reclassificada como model test ou reescrita/acompanha por teste que carregue a implementação real. Não copiar a lógica de produção para o teste.

**Evidência esperada:** execução da implementação real com assertions sobre efeitos reais (DOM/storage/IPC/IndexedDB) ao longo da jornada escolhida.

**Possível regressão:** falso senso de cobertura end-to-end; divergência silenciosa entre o espelho e o produto.

**Impacto:** qualidade probatória da suíte de integração.

**Severidade:** NORMAL.

### 108-002 — STALE_ARCHITECTURE_TEST — ACCEPTED

**Encontrado:** simulateUpdateImage e simulateGTCLookup modelam GTC por escrita/leitura direta de storage.local em chaves gtc_<hash>. O código atual usa GTC_QUERY_MANY/IndexedDB como caminho primário e mantém storage.local como fallback legado.

**Arquivo auditado/relacionado:** tests/integration/gtc-end-to-end.test.js.

**Evidência atual:** content_manga.js linhas 464–486 e gtc-indexeddb.js linhas 992–996 mostram o contrato atual; gtc-indexeddb-deep.test.js cobre a arquitetura nova.

**Evidência ausente:** alinhamento explícito desta suíte com o caminho primário atual ou indicação formal de que ela testa somente compatibilidade legacy.

**Por que é necessário:** o nome “GTC End-to-End” sugere arquitetura atual, mas o modelo central corresponde ao storage legado.

**Ação solicitada:** revisar o propósito da suíte; atualizar para o fluxo atual ou tornar explícito que o escopo é legacy/modelado.

**Evidência esperada:** caso que usa a implementação real de IPC/IndexedDB, ou contrato/test name que não atribua ao modelo legado a semântica do GTC atual.

**Possível regressão:** mudanças no GTC primário podem não ser percebidas por esta suíte enquanto a simulação antiga continua verde.

**Impacto:** precisão da documentação/testes e detecção de regressões de cache.

**Severidade:** NORMAL.

### 108-003 — ASSERTION_GAP — ACCEPTED

**Encontrado:** o caso da Jornada 4 afirma que misses “vão para Gemini”, e comentários anteriores afirmam restauração “SEM Gemini”, mas o arquivo não cria spy/chamada Gemini/START_BATCH. Na Jornada 3, SITE_B_URL não é usado para calcular fingerprint; o mesmo hash é injetado diretamente.

**Arquivo auditado/relacionado:** tests/integration/gtc-end-to-end.test.js.

**Evidência atual:** linhas 225–226 provam somente a classificação hit/miss; linhas 181 e 206 consultam HASH_P1 diretamente.

**Evidência ausente:** assertion de roteamento real dos misses, ausência de envio para hits e produção do mesmo fingerprint para conteúdo equivalente em URLs diferentes.

**Por que é necessário:** os nomes dos testes atribuem propriedades que extrapolam o que as assertions observam.

**Ação solicitada:** adicionar, em alteração de teste separada, spies/integração real para roteamento e fingerprint ou reduzir a redação dos casos ao comportamento efetivamente provado.

**Evidência esperada:** mensagem real de envio apenas para misses, zero envio para hits e cálculo de fingerprint pela implementação real a partir de entradas representativas.

**Possível regressão:** roteamento Gemini/fingerprint pode quebrar sem falhar esta suíte.

**Impacto:** precisão das garantias de cache-hit/cache-miss e cross-site.

**Severidade:** NORMAL.

## 10. Fonte integral auditada

~~~js
/**
 * gtc-end-to-end.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste de integração end-to-end das features v3.2:
 * Auto-Restore + GTC + restoreMap trabalhando juntos.
 *
 * JORNADA DO USUÁRIO SIMULADA:
 * 1. Usuário traduz "One Piece Cap 1050" no site A pela primeira vez
 *    → Gemini processa → UPDATE_IMAGE salva _images + restoreMap + GTC
 * 2. Usuário dá F5 na mesma página (tokens de CDN mudam)
 *    → initializeAutoRestorer carrega restoreMap
 *    → applyAutoRestore encontra imagem pela clean URL
 *    → Imagem restaurada SEM Gemini
 * 3. Usuário acessa o mesmo capítulo no site B (site espelho)
 *    → extractAndSendImages gera fingerprint
 *    → GTC contém o hash → cache hit
 *    → Imagem restaurada SEM Gemini
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

// ── Implementações espelho completas ─────────────────────────────────────────

function getCleanUrl(urlStr) {
    if (!urlStr || urlStr.startsWith('data:')) return null;
    try {
        const u = new URL(urlStr, 'https://siteA.com');
        return u.origin + u.pathname;
    } catch(e) { return urlStr.split('?')[0].split('#')[0]; }
}

async function simulateUpdateImage(storageMock, {
    chapterId, index, origUrl, origHash, translatedBase64, chapterList = []
}) {
    const origCleanUrl = getCleanUrl(origUrl);

    return new Promise(resolve => {
        storageMock.get([
            `${chapterId}_images`,
            `${chapterId}_restoreMap`,
        ], (data) => {
            const imgs = data[`${chapterId}_images`] || {};
            imgs[index] = translatedBase64;

            const restoreMap = data[`${chapterId}_restoreMap`] || {};
            if (origCleanUrl) restoreMap[origCleanUrl] = translatedBase64;

            const toSet = {
                [`${chapterId}_images`]: imgs,
                [`${chapterId}_restoreMap`]: restoreMap,
            };
            if (origHash) toSet[`gtc_${origHash}`] = translatedBase64;

            storageMock.set(toSet, resolve);
        });
    });
}

async function simulateAutoRestore(storageMock, chapterId, domImages) {
    return new Promise(resolve => {
        storageMock.get([`${chapterId}_restoreMap`], (data) => {
            const restoreMap = data[`${chapterId}_restoreMap`] || {};
            if (Object.keys(restoreMap).length === 0) { resolve([]); return; }

            const restored = [];
            for (const img of domImages) {
                const cleanUrl = getCleanUrl(img.src);
                if (cleanUrl && restoreMap[cleanUrl]) {
                    restored.push({ src: img.src, translated: restoreMap[cleanUrl] });
                }
            }
            resolve(restored);
        });
    });
}

async function simulateGTCLookup(storageMock, hashes) {
    const keys = hashes.filter(Boolean).map(h => `gtc_${h}`);
    if (keys.length === 0) return { hits: [], misses: hashes.map((_, i) => i) };

    return new Promise(resolve => {
        storageMock.get(keys, (data) => {
            const hits = [], misses = [];
            hashes.forEach((hash, i) => {
                if (hash && data[`gtc_${hash}`]) hits.push({ index: i, base64: data[`gtc_${hash}`] });
                else misses.push(i);
            });
            resolve({ hits, misses });
        });
    });
}

describe('GTC End-to-End — Jornada Completa do Usuário (v3.2)', () => {

    const CHAPTER_ID  = 'chap_test_e2e';
    const SITE_A_URL  = 'https://siteA.com/manga/one-piece/cap-1050/pag1.jpg';
    const SITE_A_TOKEN_2 = 'https://siteA.com/manga/one-piece/cap-1050/pag1.jpg?token=NEW123';
    const SITE_B_URL  = 'https://siteB.com/mirror/one-piece/1050/001.jpg'; // Site espelho
    const HASH_P1     = 'd'.repeat(64); // Fingerprint da imagem (mesmo conteúdo de pixels)
    const TRANSLATED  = 'data:image/png;base64,ONE_PIECE_1050_P1_TRANSLATED';

    let storageMock;

    beforeEach(() => {
        storageMock = getStorageMock();
    });

    describe('Jornada 1: Primeira tradução (Gemini processsa)', () => {
        test('UPDATE_IMAGE salva nas 3 estruturas simultaneamente', async () => {
            await simulateUpdateImage(storageMock, {
                chapterId: CHAPTER_ID,
                index: 0,
                origUrl: SITE_A_URL,
                origHash: HASH_P1,
                translatedBase64: TRANSLATED,
            });

            const data = await storageMock.get([
                `${CHAPTER_ID}_images`,
                `${CHAPTER_ID}_restoreMap`,
                `gtc_${HASH_P1}`,
            ]);

            // Leitor offline
            expect(data[`${CHAPTER_ID}_images`][0]).toBe(TRANSLATED);
            // Auto-Restore
            // CORREÇÃO: new URL('https://siteA.com/...') normaliza o hostname para MINÚSCULAS
            // (RFC 3986 — hostnames são case-insensitive, browsers normalizam para lowercase).
            // Portanto a chave do restoreMap é 'https://sitea.com/...' não 'https://siteA.com/...'
            expect(data[`${CHAPTER_ID}_restoreMap`]['https://sitea.com/manga/one-piece/cap-1050/pag1.jpg']).toBe(TRANSLATED);
            // GTC
            expect(data[`gtc_${HASH_P1}`]).toBe(TRANSLATED);
        });
    });

    describe('Jornada 2: F5 com token de CDN rotacionado', () => {
        test('imagem é restaurada automaticamente mesmo com token diferente', async () => {
            // Setup: imagem foi traduzida na sessão anterior
            await simulateUpdateImage(storageMock, {
                chapterId: CHAPTER_ID,
                index: 0,
                origUrl: SITE_A_URL,
                origHash: HASH_P1,
                translatedBase64: TRANSLATED,
            });

            // F5: DOM tem imagem com NOVO token
            const domAfterF5 = [{ src: SITE_A_TOKEN_2 }]; // Token mudou!
            const restored = await simulateAutoRestore(storageMock, CHAPTER_ID, domAfterF5);

            expect(restored).toHaveLength(1);
            expect(restored[0].translated).toBe(TRANSLATED);
        });

        test('sem tradução prévia, F5 não restaura nada (não há restoreMap)', async () => {
            const domAfterF5 = [{ src: SITE_A_URL }];
            const restored = await simulateAutoRestore(storageMock, CHAPTER_ID, domAfterF5);
            expect(restored).toHaveLength(0);
        });
    });

    describe('Jornada 3: Mesma imagem em site espelho (cross-URL)', () => {
        test('GTC reconhece a imagem pelo fingerprint, mesmo em site diferente', async () => {
            // Pré-condição: imagem foi traduzida em siteA
            await simulateUpdateImage(storageMock, {
                chapterId: CHAPTER_ID,
                index: 0,
                origUrl: SITE_A_URL,
                origHash: HASH_P1,
                translatedBase64: TRANSLATED,
            });

            // siteB: mesmo fingerprint (mesma imagem física, URL diferente)
            const { hits, misses } = await simulateGTCLookup(storageMock, [HASH_P1]);

            expect(hits).toHaveLength(1);
            expect(hits[0].base64).toBe(TRANSLATED);
            expect(misses).toHaveLength(0);
        });

        test('restoreMap de siteA NÃO restaura em siteB (restoreMap é por chapterId)', async () => {
            await simulateUpdateImage(storageMock, {
                chapterId: CHAPTER_ID, // chapterId de siteA
                index: 0,
                origUrl: SITE_A_URL,
                origHash: HASH_P1,
                translatedBase64: TRANSLATED,
            });

            // siteB usa um chapterId diferente (URL diferente = capítulo diferente no banco)
            const CHAPTER_ID_SITE_B = 'chap_siteb_001';
            const domSiteB = [{ src: SITE_B_URL }];

            const restored = await simulateAutoRestore(storageMock, CHAPTER_ID_SITE_B, domSiteB);
            // restoreMap de siteB está vazio — correto, restoreMap é por capítulo
            expect(restored).toHaveLength(0);

            // Mas o GTC encontra pelo hash — a funcionalidade cross-site!
            const { hits } = await simulateGTCLookup(storageMock, [HASH_P1]);
            expect(hits).toHaveLength(1); // GTC é GLOBAL
        });
    });

    describe('Jornada 4: Capítulo parcialmente no cache', () => {
        test('páginas no GTC são restauradas instantaneamente, resto vai para Gemini', async () => {
            const HASH_P2 = 'e'.repeat(64);
            const HASH_P3 = 'f'.repeat(64);

            // Página 1 já foi traduzida
            await storageMock.set({ [`gtc_${HASH_P1}`]: TRANSLATED });

            // Páginas 2 e 3 são novas
            const { hits, misses } = await simulateGTCLookup(
                storageMock,
                [HASH_P1, HASH_P2, HASH_P3]
            );

            expect(hits.map(h => h.index)).toEqual([0]);      // Página 1 = cache
            expect(misses).toEqual([1, 2]);                    // Páginas 2 e 3 = Gemini
        });
    });

    describe('Consistência dos dados', () => {
        test('múltiplas páginas do mesmo capítulo são armazenadas independentemente', async () => {
            const pages = [
                { index: 0, url: 'https://siteA.com/pag1.jpg', hash: '0'.repeat(64), trans: 'data:T0' },
                { index: 1, url: 'https://siteA.com/pag2.jpg', hash: '1'.repeat(64), trans: 'data:T1' },
                { index: 2, url: 'https://siteA.com/pag3.jpg', hash: '2'.repeat(64), trans: 'data:T2' },
            ];

            for (const p of pages) {
                await simulateUpdateImage(storageMock, {
                    chapterId: CHAPTER_ID,
                    index: p.index,
                    origUrl: p.url,
                    origHash: p.hash,
                    translatedBase64: p.trans,
                });
            }

            const data = await storageMock.get([`${CHAPTER_ID}_images`]);
            expect(Object.keys(data[`${CHAPTER_ID}_images`])).toHaveLength(3);
            expect(data[`${CHAPTER_ID}_images`][0]).toBe('data:T0');
            expect(data[`${CHAPTER_ID}_images`][2]).toBe('data:T2');
        });
    });
});
~~~

## 11. Cobertura posição por posição

A tabela abaixo cobre todas as 255 posições documentais. As classificações “diretas” nesta tabela referem-se ao **objeto realmente executado por esta suíte**; quando a linha pertence a uma implementação espelho, isso não é promovido a prova da implementação de produção.

| Posição | Papel | Evidência |
|---:|---|---|
| 1 | Abre bloco de comentário documental. | — |
| 2 | Comentário documental: gtc-end-to-end.test.js | — |
| 3 | Comentário documental: ───────────────────────────────────────────────────────────────────────────── | — |
| 4 | Comentário documental: Teste de integração end-to-end das features v3.2: | — |
| 5 | Comentário documental: Auto-Restore + GTC + restoreMap trabalhando juntos. | — |
| 6 | Comentário documental:  | — |
| 7 | Comentário documental: JORNADA DO USUÁRIO SIMULADA: | — |
| 8 | Comentário documental: 1. Usuário traduz "One Piece Cap 1050" no site A pela primeira vez | — |
| 9 | Comentário documental:    → Gemini processa → UPDATE_IMAGE salva _images + restoreMap + GTC | — |
| 10 | Comentário documental: 2. Usuário dá F5 na mesma página (tokens de CDN mudam) | — |
| 11 | Comentário documental:    → initializeAutoRestorer carrega restoreMap | — |
| 12 | Comentário documental:    → applyAutoRestore encontra imagem pela clean URL | — |
| 13 | Comentário documental:    → Imagem restaurada SEM Gemini | — |
| 14 | Comentário documental: 3. Usuário acessa o mesmo capítulo no site B (site espelho) | — |
| 15 | Comentário documental:    → extractAndSendImages gera fingerprint | — |
| 16 | Comentário documental:    → GTC contém o hash → cache hit | — |
| 17 | Comentário documental:    → Imagem restaurada SEM Gemini | — |
| 18 | Fecha bloco de comentário documental. | — |
| 19 | Separador visual; sem efeito de runtime. | — |
| 20 | Importa path, usado para compor o caminho absoluto do mock Chrome a partir do root descoberto. | 🟦 GATE/ESTRUTURA ESPECÍFICA |
| 21 | Importa fs, porém o identificador não é referenciado novamente neste arquivo; é dependência morta no estado auditado. | 🟦 GATE/ESTRUTURA ESPECÍFICA |
| 22 | Comentário de intenção/manutenção: Portable root finder — works regardless of where this file is placed in the tree. | — |
| 23 | Comentário de intenção/manutenção: Walks up from __dirname until it finds the folder containing extension/manifest.json. | — |
| 24 | Importa findRepoRoot do helper real tests/helpers/repo-root.js. | 🟦 GATE/ESTRUTURA ESPECÍFICA |
| 25 | Resolve ROOT caminhando pelos ancestrais até encontrar extension/manifest.json. | 🟦 GATE/ESTRUTURA ESPECÍFICA |
| 26 | Separador visual; sem efeito de runtime. | — |
| 27 | Importa somente getStorageMock do mock compartilhado de Chrome. | 🟦 GATE/ESTRUTURA ESPECÍFICA |
| 28 | Separador visual; sem efeito de runtime. | — |
| 29 | Comentário de intenção/manutenção: ── Implementações espelho completas ───────────────────────────────────────── | — |
| 30 | Separador visual; sem efeito de runtime. | — |
| 31 | Define getCleanUrl local; esta é uma implementação espelho do conceito de URL limpa, não a função de produção. | — |
| 32 | Guard retorna null para valor ausente e data URLs. | — |
| 33 | Parte executável/estrutural do bloco corrente: try { | — |
| 34 | Normaliza a entrada com URL e base https://siteA.com para entradas relativas. | — |
| 35 | Retorna somente origin + pathname, descartando query e hash. | — |
| 36 | Fallback textual remove query e fragmento quando URL lança; não há teste neste arquivo que force o catch. | — |
| 37 | Fecha o bloco/expressão imediatamente anterior. | — |
| 38 | Separador visual; sem efeito de runtime. | — |
| 39 | Define simulateUpdateImage, helper local que espelha parte do fluxo UPDATE_IMAGE sem carregar content_manga.js. | — |
| 40 | Desestrutura parâmetros; chapterList recebe default mas nunca é lido pelo helper. | — |
| 41 | Parte executável/estrutural do bloco corrente: }) { | — |
| 42 | Deriva a clean URL usando o helper local. | — |
| 43 | Separador visual; sem efeito de runtime. | — |
| 44 | Converte API callback-style do storageMock em Promise. | — |
| 45 | Lê simultaneamente imagens e restoreMap do capítulo simulado. | — |
| 46 | Parte executável/estrutural do bloco corrente: `${chapterId}_images`, | — |
| 47 | Parte executável/estrutural do bloco corrente: `${chapterId}_restoreMap`, | — |
| 48 | Parte executável/estrutural do bloco corrente: ], (data) => { | — |
| 49 | Usa objeto de imagens existente ou cria objeto vazio. | — |
| 50 | Grava a tradução pelo índice lógico no mapa local. | — |
| 51 | Separador visual; sem efeito de runtime. | — |
| 52 | Usa restoreMap existente ou cria objeto vazio. | — |
| 53 | Mapeia clean URL para a tradução quando a URL é válida. | — |
| 54 | Separador visual; sem efeito de runtime. | — |
| 55 | Constrói objeto de persistência local com as duas estruturas por capítulo. | — |
| 56 | Parte executável/estrutural do bloco corrente: [`${chapterId}_images`]: imgs, | — |
| 57 | Parte executável/estrutural do bloco corrente: [`${chapterId}_restoreMap`]: restoreMap, | — |
| 58 | Fecha o bloco/expressão imediatamente anterior. | — |
| 59 | Modela GTC legado gravando diretamente gtc_<hash> em storage.local quando há hash. | — |
| 60 | Separador visual; sem efeito de runtime. | — |
| 61 | Persiste no ChromeStorageMock e resolve a Promise ao callback. | — |
| 62 | Fecha o bloco/expressão imediatamente anterior. | — |
| 63 | Fecha o bloco/expressão imediatamente anterior. | — |
| 64 | Fecha o bloco/expressão imediatamente anterior. | — |
| 65 | Separador visual; sem efeito de runtime. | — |
| 66 | Define simulateAutoRestore; percorre dados simulados, não o DOM/MutationObserver da implementação real. | — |
| 67 | Retorna/resolve o valor indicado pelo helper: return new Promise(resolve => { | — |
| 68 | Lê somente o restoreMap do chapterId informado. | — |
| 69 | Normaliza ausência para objeto vazio. | — |
| 70 | Sem entradas, resolve imediatamente uma lista vazia. | — |
| 71 | Separador visual; sem efeito de runtime. | — |
| 72 | Inicializa lista das restaurações simuladas. | — |
| 73 | Percorre objetos de imagem fornecidos pelo próprio teste. | — |
| 74 | Calcula clean URL local da src. | — |
| 75 | Só considera match quando cleanUrl existe e há chave no restoreMap. | — |
| 76 | Registra src observada e tradução encontrada, sem alterar DOM real. | — |
| 77 | Fecha o bloco/expressão imediatamente anterior. | — |
| 78 | Fecha o bloco/expressão imediatamente anterior. | — |
| 79 | Resolve a lista acumulada. | — |
| 80 | Fecha o bloco/expressão imediatamente anterior. | — |
| 81 | Fecha o bloco/expressão imediatamente anterior. | — |
| 82 | Fecha o bloco/expressão imediatamente anterior. | — |
| 83 | Separador visual; sem efeito de runtime. | — |
| 84 | Define simulateGTCLookup; consulta diretamente chaves storage.local gtc_<hash>. | — |
| 85 | Remove hashes falsy e cria chaves do cache legado. | — |
| 86 | Caso nenhum hash válido exista, retorna todos os índices como misses. | — |
| 87 | Separador visual; sem efeito de runtime. | — |
| 88 | Converte storageMock.get em Promise. | — |
| 89 | Faz um get em lote das chaves gtc_<hash>. | — |
| 90 | Inicializa hits e misses. | — |
| 91 | Percorre a lista original para preservar índices. | — |
| 92 | Hash presente e valor truthy no mock vira hit com índice e base64. | — |
| 93 | Qualquer outra condição vira miss. | — |
| 94 | Fecha o bloco/expressão imediatamente anterior. | — |
| 95 | Resolve o resultado agregado. | — |
| 96 | Fecha o bloco/expressão imediatamente anterior. | — |
| 97 | Fecha o bloco/expressão imediatamente anterior. | — |
| 98 | Fecha o bloco/expressão imediatamente anterior. | — |
| 99 | Separador visual; sem efeito de runtime. | — |
| 100 | Abre a suíte Jest principal intitulada como jornada GTC end-to-end. | 🟦 GATE/ESTRUTURA ESPECÍFICA |
| 101 | Separador visual; sem efeito de runtime. | — |
| 102 | Define chapterId sintético compartilhado pelos casos. | — |
| 103 | Define URL inicial do site A. | — |
| 104 | Define a mesma URL com query token rotacionado. | — |
| 105 | Define URL de site B; ela é usada no teste de isolamento de restoreMap, mas não entra no lookup GTC por hash. | — |
| 106 | Define hash sintético fixo de 64 caracteres; nenhum fingerprint real é calculado neste arquivo. | — |
| 107 | Define data URL sintética usada como tradução. | — |
| 108 | Separador visual; sem efeito de runtime. | — |
| 109 | Declara estado mutável local: let storageMock; | — |
| 110 | Separador visual; sem efeito de runtime. | — |
| 111 | beforeEach obtém o singleton ChromeStorageMock já resetado pelo setup global da suíte. | 🟦 GATE/ESTRUTURA ESPECÍFICA |
| 112 | Parte executável/estrutural do bloco corrente: storageMock = getStorageMock(); | — |
| 113 | Fecha o bloco/expressão imediatamente anterior. | — |
| 114 | Separador visual; sem efeito de runtime. | — |
| 115 | Abre Jornada 1, focada na persistência simulada da primeira tradução. | 🟨 EXECUTADO INDIRETAMENTE |
| 116 | Caso Jest que afirma salvar três estruturas, mas por meio de simulateUpdateImage local. | 🟨 EXECUTADO INDIRETAMENTE |
| 117 | Executa o helper local com o storageMock. | — |
| 118 | Parte executável/estrutural do bloco corrente: chapterId: CHAPTER_ID, | — |
| 119 | Parte executável/estrutural do bloco corrente: index: 0, | — |
| 120 | Parte executável/estrutural do bloco corrente: origUrl: SITE_A_URL, | — |
| 121 | Parte executável/estrutural do bloco corrente: origHash: HASH_P1, | — |
| 122 | Parte executável/estrutural do bloco corrente: translatedBase64: TRANSLATED, | — |
| 123 | Fecha o bloco/expressão imediatamente anterior. | — |
| 124 | Separador visual; sem efeito de runtime. | — |
| 125 | Relê as três chaves do mock para assertions. | — |
| 126 | Parte executável/estrutural do bloco corrente: `${CHAPTER_ID}_images`, | — |
| 127 | Parte executável/estrutural do bloco corrente: `${CHAPTER_ID}_restoreMap`, | — |
| 128 | Parte executável/estrutural do bloco corrente: `gtc_${HASH_P1}`, | — |
| 129 | Fecha o bloco/expressão imediatamente anterior. | — |
| 130 | Separador visual; sem efeito de runtime. | — |
| 131 | Comentário de intenção/manutenção: Leitor offline | — |
| 132 | Assertion direta: _images[0] contém TRANSLATED no modelo local. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 133 | Comentário de intenção/manutenção: Auto-Restore | — |
| 134 | Comentário de intenção/manutenção: CORREÇÃO: new URL('https://siteA.com/...') normaliza o hostname para MINÚSCULAS | — |
| 135 | Comentário de intenção/manutenção: (RFC 3986 — hostnames são case-insensitive, browsers normalizam para lowercase). | — |
| 136 | Comentário de intenção/manutenção: Portanto a chave do restoreMap é 'https://sitea.com/...' não 'https://siteA.com/...' | — |
| 137 | Assertion direta: restoreMap usa hostname normalizado em minúsculas e clean URL sem query. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 138 | Comentário de intenção/manutenção: GTC | — |
| 139 | Assertion direta: chave gtc_<HASH_P1> contém TRANSLATED no storage mock legado. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 140 | Fecha o bloco/expressão imediatamente anterior. | — |
| 141 | Fecha o bloco/expressão imediatamente anterior. | — |
| 142 | Separador visual; sem efeito de runtime. | — |
| 143 | Abre Jornada 2, sobre token CDN rotacionado. | 🟨 EXECUTADO INDIRETAMENTE |
| 144 | Caso positivo de restauração simulada após token mudar. | 🟨 EXECUTADO INDIRETAMENTE |
| 145 | Comentário de intenção/manutenção: Setup: imagem foi traduzida na sessão anterior | — |
| 146 | Prepara estado anterior pelo helper local. | — |
| 147 | Parte executável/estrutural do bloco corrente: chapterId: CHAPTER_ID, | — |
| 148 | Parte executável/estrutural do bloco corrente: index: 0, | — |
| 149 | Parte executável/estrutural do bloco corrente: origUrl: SITE_A_URL, | — |
| 150 | Parte executável/estrutural do bloco corrente: origHash: HASH_P1, | — |
| 151 | Parte executável/estrutural do bloco corrente: translatedBase64: TRANSLATED, | — |
| 152 | Fecha o bloco/expressão imediatamente anterior. | — |
| 153 | Separador visual; sem efeito de runtime. | — |
| 154 | Comentário de intenção/manutenção: F5: DOM tem imagem com NOVO token | — |
| 155 | Cria DOM lógico como array simples; não cria elemento img real. | — |
| 156 | Executa simulateAutoRestore local. | — |
| 157 | Separador visual; sem efeito de runtime. | — |
| 158 | Assertion direta: um match foi encontrado. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 159 | Assertion direta: tradução recuperada é a esperada. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 160 | Fecha o bloco/expressão imediatamente anterior. | — |
| 161 | Separador visual; sem efeito de runtime. | — |
| 162 | Caso negativo sem tradução prévia. | 🟨 EXECUTADO INDIRETAMENTE |
| 163 | Declara dado/valor local usado pelo fluxo do teste: const domAfterF5 = [{ src: SITE_A_URL }]; | — |
| 164 | Consulta restoreMap vazio via helper local. | — |
| 165 | Assertion direta: nenhuma restauração é retornada. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 166 | Fecha o bloco/expressão imediatamente anterior. | — |
| 167 | Fecha o bloco/expressão imediatamente anterior. | — |
| 168 | Separador visual; sem efeito de runtime. | — |
| 169 | Abre Jornada 3, rotulada como cross-URL/site espelho. | 🟨 EXECUTADO INDIRETAMENTE |
| 170 | Caso GTC cross-site injeta diretamente o mesmo hash; não calcula hash a partir de SITE_B_URL. | 🟨 EXECUTADO INDIRETAMENTE |
| 171 | Comentário de intenção/manutenção: Pré-condição: imagem foi traduzida em siteA | — |
| 172 | Prepara entrada GTC local usando URL de site A. | — |
| 173 | Parte executável/estrutural do bloco corrente: chapterId: CHAPTER_ID, | — |
| 174 | Parte executável/estrutural do bloco corrente: index: 0, | — |
| 175 | Parte executável/estrutural do bloco corrente: origUrl: SITE_A_URL, | — |
| 176 | Parte executável/estrutural do bloco corrente: origHash: HASH_P1, | — |
| 177 | Parte executável/estrutural do bloco corrente: translatedBase64: TRANSLATED, | — |
| 178 | Fecha o bloco/expressão imediatamente anterior. | — |
| 179 | Separador visual; sem efeito de runtime. | — |
| 180 | Comentário de intenção/manutenção: siteB: mesmo fingerprint (mesma imagem física, URL diferente) | — |
| 181 | Consulta GTC local apenas com HASH_P1. | — |
| 182 | Separador visual; sem efeito de runtime. | — |
| 183 | Assertion direta: há um hit. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 184 | Assertion direta: hit devolve TRANSLATED. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 185 | Assertion direta: não há misses. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 186 | Fecha o bloco/expressão imediatamente anterior. | — |
| 187 | Separador visual; sem efeito de runtime. | — |
| 188 | Caso prova isolamento de restoreMap por chapterId no modelo local. | 🟨 EXECUTADO INDIRETAMENTE |
| 189 | Prepara restoreMap do chapterId de site A. | — |
| 190 | Parte executável/estrutural do bloco corrente: chapterId: CHAPTER_ID, // chapterId de siteA | — |
| 191 | Parte executável/estrutural do bloco corrente: index: 0, | — |
| 192 | Parte executável/estrutural do bloco corrente: origUrl: SITE_A_URL, | — |
| 193 | Parte executável/estrutural do bloco corrente: origHash: HASH_P1, | — |
| 194 | Parte executável/estrutural do bloco corrente: translatedBase64: TRANSLATED, | — |
| 195 | Fecha o bloco/expressão imediatamente anterior. | — |
| 196 | Separador visual; sem efeito de runtime. | — |
| 197 | Comentário de intenção/manutenção: siteB usa um chapterId diferente (URL diferente = capítulo diferente no banco) | — |
| 198 | Define chapterId distinto para o site B. | — |
| 199 | Cria objeto lógico com SITE_B_URL. | — |
| 200 | Separador visual; sem efeito de runtime. | — |
| 201 | Consulta restoreMap do chapterId distinto. | — |
| 202 | Comentário de intenção/manutenção: restoreMap de siteB está vazio — correto, restoreMap é por capítulo | — |
| 203 | Assertion direta: restoreMap de outro chapterId não restaura a imagem. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 204 | Separador visual; sem efeito de runtime. | — |
| 205 | Comentário de intenção/manutenção: Mas o GTC encontra pelo hash — a funcionalidade cross-site! | — |
| 206 | Consulta GTC legado pelo mesmo hash, sem usar a URL do site B para gerar fingerprint. | — |
| 207 | Assertion direta: o hash previamente salvo continua produzindo hit global no modelo local. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 208 | Fecha o bloco/expressão imediatamente anterior. | — |
| 209 | Fecha o bloco/expressão imediatamente anterior. | — |
| 210 | Separador visual; sem efeito de runtime. | — |
| 211 | Abre Jornada 4, cache parcial. | 🟨 EXECUTADO INDIRETAMENTE |
| 212 | Caso rotulado como 'resto vai para Gemini'; o teste apenas calcula misses e não chama/espiona Gemini/START_BATCH. | 🟨 EXECUTADO INDIRETAMENTE |
| 213 | Cria hash sintético da página 2. | — |
| 214 | Cria hash sintético da página 3. | — |
| 215 | Separador visual; sem efeito de runtime. | — |
| 216 | Comentário de intenção/manutenção: Página 1 já foi traduzida | — |
| 217 | Pré-carrega somente HASH_P1 no storageMock legado. | — |
| 218 | Separador visual; sem efeito de runtime. | — |
| 219 | Comentário de intenção/manutenção: Páginas 2 e 3 são novas | — |
| 220 | Executa lookup local em lote de três hashes. | — |
| 221 | Parte executável/estrutural do bloco corrente: storageMock, | — |
| 222 | Parte executável/estrutural do bloco corrente: [HASH_P1, HASH_P2, HASH_P3] | — |
| 223 | Fecha a expressão/estrutura imediatamente anterior. | — |
| 224 | Separador visual; sem efeito de runtime. | — |
| 225 | Assertion direta: somente índice 0 é hit. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 226 | Assertion direta: índices 1 e 2 são misses; não há assertion de envio efetivo ao Gemini. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 227 | Fecha o bloco/expressão imediatamente anterior. | — |
| 228 | Fecha o bloco/expressão imediatamente anterior. | — |
| 229 | Separador visual; sem efeito de runtime. | — |
| 230 | Abre grupo de consistência de dados. | 🟨 EXECUTADO INDIRETAMENTE |
| 231 | Caso grava três páginas independentes do mesmo capítulo. | 🟨 EXECUTADO INDIRETAMENTE |
| 232 | Declara vetor de páginas sintéticas com índices/URLs/hashes/traduções diferentes. | — |
| 233 | Parte executável/estrutural do bloco corrente: { index: 0, url: 'https://siteA.com/pag1.jpg', hash: '0'.repeat(64), trans: 'data:T0' }, | — |
| 234 | Parte executável/estrutural do bloco corrente: { index: 1, url: 'https://siteA.com/pag2.jpg', hash: '1'.repeat(64), trans: 'data:T1' }, | — |
| 235 | Parte executável/estrutural do bloco corrente: { index: 2, url: 'https://siteA.com/pag3.jpg', hash: '2'.repeat(64), trans: 'data:T2' }, | — |
| 236 | Fecha a expressão/estrutura imediatamente anterior. | — |
| 237 | Separador visual; sem efeito de runtime. | — |
| 238 | Percorre cada página e chama simulateUpdateImage sequencialmente. | — |
| 239 | Aguarda a operação assíncrona local/mock: await simulateUpdateImage(storageMock, { | — |
| 240 | Parte executável/estrutural do bloco corrente: chapterId: CHAPTER_ID, | — |
| 241 | Parte executável/estrutural do bloco corrente: index: p.index, | — |
| 242 | Parte executável/estrutural do bloco corrente: origUrl: p.url, | — |
| 243 | Parte executável/estrutural do bloco corrente: origHash: p.hash, | — |
| 244 | Parte executável/estrutural do bloco corrente: translatedBase64: p.trans, | — |
| 245 | Fecha o bloco/expressão imediatamente anterior. | — |
| 246 | Fecha o bloco/expressão imediatamente anterior. | — |
| 247 | Separador visual; sem efeito de runtime. | — |
| 248 | Relê apenas o mapa _images do capítulo. | — |
| 249 | Assertion direta: há três índices armazenados. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 250 | Assertion direta: índice 0 preserva data:T0. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 251 | Assertion direta: índice 2 preserva data:T2. | ✅ PROVADO DIRETAMENTE (sobre a simulação local) |
| 252 | Fecha o bloco/expressão imediatamente anterior. | — |
| 253 | Fecha o bloco/expressão imediatamente anterior. | — |
| 254 | Fecha a suíte principal. | — |
| 255 | Newline final do blob; posição documental explícita. | 🟦 LEITURA INTEGRAL DO BLOB |

## 12. Unidades semânticas

### U01 — posições 1–18 — intenção declarada

O comentário apresenta uma jornada completa Auto-Restore + GTC + restoreMap. Ele é documentação, não execução. A auditoria separa essa intenção do objeto efetivamente carregado.

### U02 — posições 20–27 — bootstrap

Resolve o root do repositório e obtém o storage mock. fs é importado, mas permanece sem uso. Nenhum módulo de produção da jornada é requerido.

### U03 — posições 31–37 — clean URL espelhada

Define normalização local de URL. A suíte depende dessa cópia para demonstrar rotação de token. Qualquer divergência futura entre esta cópia e a função real pode manter o teste verde.

### U04 — posições 39–64 — persistência simulada

Modela _images, restoreMap e GTC legado em uma única escrita ao ChromeStorageMock. O desenho é simples e determinístico, útil para testar o modelo, mas não representa todos os side effects do handler real.

### U05 — posições 66–82 — restauração simulada

Modela matching por clean URL sobre objetos simples. Não usa DOM real nem mecanismos reativos do Auto-Restore.

### U06 — posições 84–98 — lookup GTC simulado

Modela batch lookup do cache legado preservando índices. A propriedade hit/miss local é diretamente testável, mas a arquitetura primária atual é outra.

### U07 — posições 100–141 — primeira tradução

Inicializa constantes, recupera storageMock e prova três gravações do helper local.

### U08 — posições 143–167 — token rotacionado

Prova que query string diferente não impede match quando a clean URL local é a mesma, e que mapa vazio retorna zero.

### U09 — posições 169–209 — isolamento por capítulo e cache global

Prova segregação local do restoreMap e globalidade da chave de hash. Não prova geração de fingerprint cross-site, porque o hash é fornecido pronto.

### U10 — posições 211–228 — cache parcial

Prova particionamento de índices entre hits e misses. A etapa “vai para Gemini” existe apenas no nome/comentário, não na execução.

### U11 — posições 230–254 — consistência multi-página

Prova que três gravações sequenciais atualizam o objeto _images por índices independentes sem sobrescrever os anteriores.

### U12 — posição 255 — newline final

O blob termina em newline. A posição final é registrada para assegurar leitura integral e correspondência do SHA.

## 13. Invariantes observáveis deste arquivo

1. Cada teste começa com storage mock limpo pelo setup global.
2. Todas as URLs/hashes/traduções são sintéticas; não existe rede.
3. Nenhum Gemini real ou simulado por IPC é chamado.
4. Nenhum arquivo de produção da jornada é importado.
5. O GTC deste arquivo é um mapa storage.local gtc_<hash>.
6. restoreMap é particionado pelo chapterId.
7. GTC local é global porque a chave contém apenas o hash.
8. Hits e misses preservam o índice original.
9. Query/hash falsy só é tratado explicitamente dentro do helper; a suíte não possui caso focal para lista somente falsy.
10. O teste é determinístico: não usa tempo, aleatoriedade ou I/O externo.
11. SITE_B_URL não gera o hash do caso cross-site.
12. chapterList e fs estão presentes, mas sem uso executável.

## 14. Limites e riscos de interpretação

Este arquivo **não deve ser usado isoladamente** como prova de:

- comunicação real com Gemini;
- handler UPDATE_IMAGE real;
- IndexedDB real;
- background bridge real;
- fingerprint visual real;
- DOM replacement real;
- MutationObserver/auto-restorer real;
- download/ACK/batch lifecycle;
- performance end-to-end;
- persistência real do chapter asset system.

O valor atual da suíte está em documentar e verificar um modelo conceitual simples de três estruturas de cache/persistência. As suítes “real” e “deep” do repositório fornecem evidência mais forte para a implementação atual.

## 15. Autoauditoria do AGENTE 24

- [x] PR #66 e branch docs/project-bible confirmados;
- [x] reserva exclusiva #108 criada via CREATE ONLY;
- [x] reserva relida e ownership AGENTE 24 confirmado;
- [x] reservas extras acidentais #109–#111 liberadas antes de iniciar qualquer state/Bíblia desses arquivos;
- [x] state/108.json criado como unidade independente;
- [x] SHA do fonte confirmado como 9042b3b5370afdbce3baf31b01ce3fa9c49b34dc;
- [x] fonte integral incorporada sem alteração;
- [x] 254 linhas textuais + newline final = 255 posições;
- [x] descoberta Jest/package/CI verificada;
- [x] execução real do mesmo blob localizada em Node 20, Node 22, coverage e Windows;
- [x] assertions locais separadas das alegações sobre implementação de produção;
- [x] arquitetura GTC atual cruzada com content_manga.js/gtc-indexeddb.js;
- [x] testes reais correlatos identificados sem modificá-los;
- [x] três lacunas persistidas como solicitações ao auditor;
- [x] nenhum código, teste, fixture, workflow, configuração ou tracker global foi alterado para fabricar evidência.

**Resultado documental:** Bíblia concluída para o blob 9042b3b5370afdbce3baf31b01ce3fa9c49b34dc. As solicitações 108-001, 108-002 e 108-003 permanecem ACCEPTED e não bloqueiam por si só a conclusão documental quando as lacunas são descritas honestamente.

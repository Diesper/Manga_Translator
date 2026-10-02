# Bíblia técnica — tests/unit/background/regex-escape.test.js

> **Estado documental:** CORRIGIDA — aguardando auditoria independente
> **SHA auditado:** 8ef5c927d8666f5b4f3fc113c818f642058cf9e7
> **Agente responsável:** AGENTE 17
> **Tipo:** suíte Jest unitária de regressão para escape de regex no fluxo SHOW_EXISTING_FOLDER
> **Linhas textuais:** 179
> **Posições documentais:** 180, contando o newline final
> **PR:** #66
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo protege a regressão identificada como BUG #14 / REG-REGEX-FOLDER: caminhos de pasta usados em chrome.downloads.search({ filenameRegex }) precisam ser transformados em uma expressão regular literal, sem permitir que metacaracteres do nome do mangá alterem o significado do padrão ou provoquem SyntaxError.

A suíte não testa uma cópia local da regra. Ela carrega extension/background.js pela infraestrutura real de testes; esse bootstrap requer extension/background/router.js e extension/background/actions/open-existing-folder.js. O roteador converte SHOW_EXISTING_FOLDER em open-existing-folder e a ação executa fallbackSearch(), onde folderPath é escapado por uma classe que inclui ponto, asterisco, mais, interrogação, circunflexo, dólar, chaves, parênteses, pipe, colchetes e barra invertida antes de chamar chrome.downloads.search.

Portanto, as assertions principais desta suíte atravessam o caminho real de roteamento e observam o argumento efetivamente enviado ao mock de chrome.downloads.search.

## 2. Fluxo real exercitado

O caminho técnico é:

1. beforeEach instala o rastreador de timers tardios;
2. obtém os mocks compartilhados de downloads e runtime;
3. limpa downloads anteriores e registra um download realista de One.Piece;
4. zera listeners do runtime;
5. resolve extension/background.js;
6. loadBackgroundModule() lê e executa o background real;
7. background.js requer router.js e open-existing-folder.js no caminho Node/Jest;
8. open-existing-folder registra a ação canônica open-existing-folder;
9. o listener do background recebe SHOW_EXISTING_FOLDER;
10. router.js resolve o nome legado para open-existing-folder;
11. execute() da ação entra em fallbackSearch() quando não há anchorId;
12. folderPath é escapado e enviado como filenameRegex;
13. ChromeDownloadsMock.search() constrói new RegExp(query.filenameRegex) e filtra os downloads;
14. o teste também reconstrói a RegExp diretamente para verificar semântica positiva/negativa;
15. afterEach cancela timers tardios e restaura spies.

Isso é mais forte que um teste puramente estático da expressão de replace porque passa pelo listener real do background e pelo roteador registrado.

## 3. Dependências diretas

### path

Linhas 9 e 48 usam path.resolve para localizar extension/background.js a partir do diretório da suíte.

### loadBackgroundModule

Importado na linha 10. O helper lê o background real, acrescenta apenas instrumentação de exportação/estado usada pela infraestrutura e executa o código em um módulo Node criado com Module.createRequire.

O comportamento de interesse não é reimplementado nesse helper.

### trackBackgroundDelayTimers

Importado na linha 11. O helper intercepta timers deliberadamente tardios do background, incluindo o timer de 4 segundos usado por handleMarkerAndShow() para remover o arquivo-âncora.

Nesta suíte ele é infraestrutura de teardown; não é a propriedade funcional principal sob teste.

### getDownloadsMock / getRuntimeMock

Importados na linha 12. O runtime mock armazena listeners em _messageListeners. O downloads mock implementa search(query) construindo new RegExp(query.filenameRegex), o que faz a suíte falhar também quando um padrão inválido produz SyntaxError.

## 4. Helpers locais

### getBackgroundListener(runtimeMock) — linhas 14–17

Obtém o último listener registrado em runtimeMock._messageListeners.

A escolha do último listener pressupõe que o background carregado registrou o listener relevante depois de o array ter sido zerado no beforeEach.

### dispatchToBackground(runtimeMock, request, sender) — linhas 19–29

Cria uma Promise e chama diretamente o listener real com request, sender e sendResponse.

Se o listener retorna valor falsy, a Promise resolve undefined imediatamente. Para a ação registrada assíncrona SHOW_EXISTING_FOLDER, o roteador retorna true, mantendo o canal lógico aberto até sendResponse ser chamado.

Essa função não simula o algoritmo de escape; ela apenas transporta a mensagem até o listener real.

## 5. Setup e isolamento — linhas 31–58

O describe identifica explicitamente SHOW_EXISTING_FOLDER e BUG #14.

No beforeEach:

- trackBackgroundDelayTimers() é ativado;
- downloadsMock é obtido;
- o mapa interno de downloads é limpo;
- é inserido o download id 1 com filename /home/user/Downloads/MangaTranslator/One.Piece/p1.png;
- runtimeMock é obtido;
- _messageListeners é zerado;
- extension/background.js é resolvido e carregado.

O download inicial é importante para o primeiro caso: permite provar que o padrão escapado One\.Piece encontra One.Piece e não interpreta o ponto como wildcard.

No afterEach:

- timers tardios conhecidos são cancelados;
- jest.restoreAllMocks() remove spies.

O comentário de teardown está alinhado com handleMarkerAndShow(): casos que não acham uma pasta existente podem criar _anchor.png e agendar removeFile/erase para 4 segundos depois.

## 6. Caso 1 — ponto literal — linhas 60–75

Entrada:

- action = SHOW_EXISTING_FOLDER;
- folderPath = MangaTranslator/One.Piece;
- safeTitle = One.Piece.

Provas diretas:

- downloads.search foi chamado;
- o primeiro query.filenameRegex é exatamente MangaTranslator/One\.Piece;
- a RegExp aceita /home/user/Downloads/MangaTranslator/One.Piece;
- a mesma RegExp rejeita /home/user/Downloads/MangaTranslator/OneXPiece.

A última assertion é especialmente relevante: prova que o ponto deixou de ter semântica de “qualquer caractere”.

Classificação: ✅ PROVADO DIRETAMENTE.

## 7. Caso 2 — parênteses literais — linhas 77–92

Entrada:

MangaTranslator/One Piece (Fan Sub)

Provas diretas:

- search é acionado;
- filenameRegex contém parênteses escapados;
- o padrão aceita a forma com parênteses reais;
- rejeita MangaTranslator/One Piece xFan Subx.

Isso prova que os parênteses não são usados como grupo de captura/agrupamento semântico.

Classificação: ✅ PROVADO DIRETAMENTE.

## 8. Caso 3 — sinal de mais literal — linhas 94–109

Entrada:

MangaTranslator/Dragon+Ball

Provas diretas:

- filenameRegex é MangaTranslator/Dragon\+Ball;
- o padrão aceita Dragon+Ball;
- rejeita DragonBall.

A rejeição de DragonBall prova que + não permaneceu como quantificador da expressão regular.

Classificação: ✅ PROVADO DIRETAMENTE.

## 9. Caso 4 — asterisco e interrogação — linhas 111–126

Entrada:

MangaTranslator/Title*Name?

Provas diretas:

- filenameRegex contém asterisco e interrogação escapados;
- o padrão resultante compila;
- o padrão aceita a string literal Title*Name?.

Além da igualdade exata do filenameRegex, a assertion negativa rejeita TitleName: os símbolos não podem voltar a agir como quantificadores.

Classificação do escape: ✅ PROVADO DIRETAMENTE.

## 10. Caso 5 — caminho complexo — linhas 128–143

Entrada:

MangaTranslator/Test (Arc) v2.0+/page_001.png

Esse caso combina espaço, parênteses, ponto, sinal de mais e separador /.

Provas diretas:

- search é chamado;
- new RegExp(query.filenameRegex) não lança;
- a RegExp resultante aceita exatamente complexPath.

Esse caso é o marcador usado por scripts/ci/data/regression-matrix.json para REG-REGEX-FOLDER.

Classificação do comportamento executado: ✅ PROVADO DIRETAMENTE.

Classificação da presença do marcador no contrato de regressão: 🟦 GATE ESTÁTICO ESPECÍFICO.

## 11. Implementação real correlacionada

Em extension/background/actions/open-existing-folder.js, fallbackSearch() aplica replace sobre os metacaracteres de regex de folderPath antes de chamar chrome.downloads.search.

O arquivo extension/background/router.js mapeia SHOW_EXISTING_FOLDER para open-existing-folder.

No caminho Node/Jest de extension/background.js, open-existing-folder.js é requerido junto dos demais módulos de background. routeRegisteredAction() cria o contexto do roteador e entrega handleMarkerAndShow como fallback quando a busca não encontra download.

A suíte, portanto, deve ser descrita como um teste do background real por integração unitária com a ação modular registrada. O algoritmo de escape já não reside fisicamente dentro de background.js.

## 12. Força real da evidência

| Propriedade | Evidência atual | Classificação |
|---|---|---|
| extension/background.js real é carregado | path.resolve + loadBackgroundModule | ✅ PROVADO DIRETAMENTE |
| SHOW_EXISTING_FOLDER chega à ação registrada | listener real + efeito em downloads.search; identidade da ação confirmada no bootstrap e router | 🟨 EXECUTADO INDIRETAMENTE / PROVA DE CONSUMER |
| ponto é escapado | igualdade de filenameRegex + match/near-miss | ✅ PROVADO DIRETAMENTE |
| parênteses são escapados | igualdade de filenameRegex + match/near-miss | ✅ PROVADO DIRETAMENTE |
| + é escapado | igualdade de filenameRegex + match/near-miss | ✅ PROVADO DIRETAMENTE |
| * e ? são escapados | igualdade exata de filenameRegex | ✅ PROVADO DIRETAMENTE |
| caminho complexo compila e encontra a string | not.toThrow + regex.test | ✅ PROVADO DIRETAMENTE |
| REG-REGEX-FOLDER continua apontando para esta suíte e marcador | regression-matrix.json | 🟦 GATE ESTÁTICO ESPECÍFICO |
| teardown chama cancelador de timers atrasados | afterEach executa helper | 🟨 EXECUTADO INDIRETAMENTE |
| ^, $, {, }, [, ], pipe e barra invertida são cobertos individualmente | test.each nas linhas 145–162: padrão exato, compilação, match e dois near-misses por símbolo | ✅ PROVADO DIRETAMENTE |
| caminho Windows com separadores por barra invertida é provado por esta suíte | linhas 164–178: padrão exato, match e três near-misses | ✅ PROVADO DIRETAMENTE |
| near-miss negativo para o caso * / ? | linha 125 rejeita TitleName | ✅ PROVADO DIRETAMENTE |

## 13. Evidência complementar encontrada

tests/unit/background/open-existing-folder-action.test.js também verifica diretamente um folderPath com Chap.1 e espera filenameRegex MangaTranslator/Chap\.1.

Outras suítes reais exercitam SHOW_EXISTING_FOLDER com paths comuns e com anchorId existente, provando roteamento e reuso de downloads, mas não adicionam cobertura específica para todos os metacaracteres restantes da classe de escape.

A revisão atual cobre diretamente todos os metacaracteres da classe de replace. A tabela adicional não depende de uma cópia do algoritmo: cada símbolo tem um padrão literal esperado e near-misses explícitos. O caminho Windows inclui separadores, colchetes e ponto.

## 14. Correções e execução na CI

162-001 foi corrigida pelos oito casos tabelados das linhas 145–162 e pelo caso Windows das linhas 164–178. Cada símbolo restante tem padrão esperado, compilação, match positivo e dois near-misses. O caso Windows rejeita remoção de colchetes, substituição do ponto e troca de separadores. O near-miss de * e ? também foi adicionado.

162-002 foi corrigida no comentário inicial: o teste carrega o background real e executa fallbackSearch na ação modular open-existing-folder.js. O status canônico das requests permanece no .state.

O consumer de execução é o projeto background de jest.config.js (linhas 7–9), cujo testMatch inclui tests/unit/background/**/*.test.js. scripts/ci/run-jest-ci.js resolve jest.config.js na linha 14, inclui background em unitProjects na linha 15 e executa essa seleção. package.json, em test:ci, chama esse runner. O job unit-and-integration de .github/workflows/ci.yml executa npm run test:ci (linha 145). Esse encadeamento prova por inspeção de consumers como a suíte entra na CI; uma execução focal local não equivale a afirmar que a CI inteira está verde.

O wiring até a ação registrada é EXECUTADO INDIRETAMENTE e confirmado por inspeção de bootstrap/router. A suíte observa downloads.search e seu padrão; não observa diretamente actionRegistry.get ou a identidade da função execute.

### Casos adicionais e limites

Nas linhas 145–162, test.each executa ^, $, {, }, [, ], pipe e barra invertida separadamente. Nas linhas 164–178, a string Windows preserva separadores literais. A RegExp usada pela ação é uma busca não ancorada: o nome histórico do caso complexo diz “match exato”, mas sua assertion prova aceitação da string literal, sem provar exclusão de prefixos ou sufixos.

## 15. O que esta suíte não pretende provar

Este arquivo não prova integralmente:

- comportamento de anchorId válido;
- escolha de results[0] quando existem múltiplos downloads;
- fallback de criação do arquivo-âncora;
- chrome.downloads.show em todos os ramos;
- validade/normalização de safeTitle;
- comportamento de folderPath ausente ou não-string;
- política de origem do roteador;
- comportamento do popup que constrói folderPath;
- ausência de timers pendentes após cada caso por assertion explícita.

Esses pontos pertencem a outras suítes ou permanecem como lacunas específicas.

## 16. Fonte integral auditada

~~~js
/**
 * regex-escape.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Carrega o background real e executa fallbackSearch da ação modular
 * extension/background/actions/open-existing-folder.js (BUG #14 Fix).
 * Verifica escape literal de metacaracteres em downloads.search({ filenameRegex }).
 */

const path = require('path');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');
const { getDownloadsMock, getRuntimeMock } = require('../../mocks/chrome-api.mock.js');

function getBackgroundListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    return listeners[listeners.length - 1];
}

function dispatchToBackground(runtimeMock, request, sender = { tab: null }) {
    return new Promise((resolve) => {
        const sendResponse = (response) => {
            resolve(response);
        };
        const keepAlive = getBackgroundListener(runtimeMock)(request, sender, sendResponse);
        if (!keepAlive) {
            resolve(undefined);
        }
    });
}

describe('SHOW_EXISTING_FOLDER - Escape de Metacaracteres para Regex no background.js (BUG #14)', () => {
    let downloadsMock;
    let runtimeMock;
    let cancelBackgroundDelayTimers;

    beforeEach(() => {
        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();
        downloadsMock = getDownloadsMock();
        downloadsMock._downloads.clear();
        downloadsMock._downloads.set(1, {
            id: 1,
            filename: '/home/user/Downloads/MangaTranslator/One.Piece/p1.png',
            state: 'complete',
            exists: true,
        });
        runtimeMock = getRuntimeMock();
        runtimeMock._messageListeners = [];
        const bgPath = path.resolve(__dirname, '../../../extension/background.js');
        loadBackgroundModule(bgPath);
    });

    afterEach(() => {
        // Os casos sem pasta existente caem em handleMarkerAndShow(), que cria
        // _anchor.png e agenda removeFile/erase para 4 s depois. Esse timer
        // pertence ao caso atual e não pode sobreviver ao worker Jest.
        cancelBackgroundDelayTimers();
        jest.restoreAllMocks();
    });

    test('escapa ponto "." evitando tratar como qualquer caractere', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/One.Piece',
            safeTitle: 'One.Piece',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/One\\.Piece');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('/home/user/Downloads/MangaTranslator/One.Piece')).toBe(true);
        expect(regex.test('/home/user/Downloads/MangaTranslator/OneXPiece')).toBe(false);
    });

    test('escapa parênteses "(" e ")"', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/One Piece (Fan Sub)',
            safeTitle: 'One Piece (Fan Sub)',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/One Piece \\(Fan Sub\\)');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('MangaTranslator/One Piece (Fan Sub)')).toBe(true);
        expect(regex.test('MangaTranslator/One Piece xFan Subx')).toBe(false);
    });

    test('escapa sinal de mais "+"', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/Dragon+Ball',
            safeTitle: 'Dragon+Ball',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/Dragon\\+Ball');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('MangaTranslator/Dragon+Ball')).toBe(true);
        expect(regex.test('MangaTranslator/DragonBall')).toBe(false);
    });

    test('escapa asterisco "*" e ponto de interrogação "?"', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/Title*Name?',
            safeTitle: 'Title*Name?',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/Title\\*Name\\?');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('MangaTranslator/Title*Name?')).toBe(true);
        expect(regex.test('MangaTranslator/TitleName')).toBe(false);
    });

    test('path complexo do mundo real não lança SyntaxError e faz match exato', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        const complexPath = 'MangaTranslator/Test (Arc) v2.0+/page_001.png';
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: complexPath,
            safeTitle: 'Test',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(() => new RegExp(query.filenameRegex)).not.toThrow();

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test(complexPath)).toBe(true);
    });

    test.each(['^', '$', '{', '}', '[', ']', '|', '\\'])(
        'escapa o metacaractere restante %s como literal', async (symbol) => {
            const searchSpy = jest.spyOn(downloadsMock, 'search');
            const folderPath = `MangaTranslator/Before${symbol}After`;
            await dispatchToBackground(runtimeMock, {
                action: 'SHOW_EXISTING_FOLDER', folderPath, safeTitle: 'Literal',
            });

            expect(searchSpy).toHaveBeenCalled();
            const query = searchSpy.mock.calls[0][0];
            expect(query.filenameRegex).toBe(`MangaTranslator/Before\\${symbol}After`);
            expect(() => new RegExp(query.filenameRegex)).not.toThrow();
            const regex = new RegExp(query.filenameRegex);
            expect(regex.test(folderPath)).toBe(true);
            expect(regex.test('MangaTranslator/BeforeXAfter')).toBe(false);
            expect(regex.test('MangaTranslator/BeforeAfter')).toBe(false);
        }
    );

    test('escapa separadores e metacaracteres de um caminho Windows', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        const folderPath = 'C:\\Users\\Reader\\MangaTranslator\\Arc[2]\\One.Piece';
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER', folderPath, safeTitle: 'One.Piece',
        });

        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('C:\\\\Users\\\\Reader\\\\MangaTranslator\\\\Arc\\[2\\]\\\\One\\.Piece');
        const regex = new RegExp(query.filenameRegex);
        expect(regex.test(folderPath)).toBe(true);
        expect(regex.test(folderPath.replace('Arc[2]', 'Arc2'))).toBe(false);
        expect(regex.test(folderPath.replace('One.Piece', 'OneXPiece'))).toBe(false);
        expect(regex.test(folderPath.replace(/\\/g, '/'))).toBe(false);
    });
});
~~~

## 17. Mapa integral por linhas

| Linhas | Papel técnico |
|---:|---|
| 1–7 | comentário de finalidade e regressão BUG #14 |
| 8 | linha vazia de separação |
| 9–12 | imports de path, loader, timer tracker e mocks |
| 13 | separação |
| 14–17 | getBackgroundListener |
| 18 | separação |
| 19–29 | dispatchToBackground |
| 30 | separação |
| 31–34 | describe e variáveis de fixture |
| 35 | separação |
| 36–50 | beforeEach: timers, mocks, download fixture e carga do background real |
| 51 | separação |
| 52–58 | afterEach e cleanup |
| 59 | separação |
| 60–75 | caso do ponto literal |
| 76 | separação |
| 77–92 | caso dos parênteses |
| 93 | separação |
| 94–109 | caso do sinal de mais |
| 110 | separação |
| 111–126 | caso de * e ?, com near-miss |
| 127 | separação |
| 128–143 | caminho complexo / não lançar SyntaxError |
| 144 | separação |
| 145–162 | oito metacaracteres restantes: tabela, padrão, match e near-misses |
| 163 | separação |
| 164–178 | caminho Windows: padrão, match e near-misses |
| 179 | fechamento do describe |
| posição 180 | newline final |

Todas as 179 linhas textuais e a posição final de newline estão cobertas pelo mapa acima.

## 18. Revalidação da correção — AGENTE 2

Fonte integral relida, implementação real e consumers inspecionados, assertions diretas separadas de wiring indireto. Não há skip/only no arquivo. Os casos novos preservam o fluxo real pelo listener e usam expectativas literais independentes da classe de replace. O teardown continua cancelando os timers tardios da ação.

Validação focal: regex-escape.test.js e open-existing-folder-action.test.js passaram em 16/16 testes com --runInBand --detectOpenHandles. A primeira suíte contém 14 casos executados. A suíte background completa passou em 45/45 suítes e 237/237 testes. Os testes do protocolo de transições, reconciliação e auditoria também passaram. A aprovação final depende de PRIMARY e ADVERSARIAL independentes para os novos blobs; esta correção não atribui 100/100 por conta própria.

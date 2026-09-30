# Bíblia técnica — tests/integration/reader.ui.test.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE 7 — consolidação global fora do escopo deste agente  
> **SHA auditado:** `810a207f1264d78836b6e72c6f701bfc0cbce447`  
> **Agente responsável:** AGENTE 7  
> **Tipo:** suíte Jest/jsdom de integração real `reader.html` + `reader.js`  
> **Linhas textuais:** **149**  
> **Posições documentais:** **150**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`reader.ui.test.js` é a suíte de integração que materializa o HTML real do leitor, carrega o `reader.js` real e observa o DOM final usando storage/localStorage controlados. Seu foco é a superfície inicial do reader: renderização de capítulo, preferência de largura, fechamento e estados vazios.

O harness `loadExtensionPage` remove tags `<script src>` do HTML injetado para evitar execução automática duplicada, resolve as dependências que aparecem antes do script alvo e as carrega junto ao módulo real dentro de `jest.isolateModules`. Portanto as assertions desta suíte exercitam a implementação de produção, não uma cópia das funções do reader.

## 2. Dependências, consumidores e isolamento

- **Harness:** `tests/helpers/load-extension-page.js` (`loadExtensionPage`, `flushAsyncTasks`).
- **Mocks:** `tests/mocks/chrome-api.mock.js` fornece `chrome.storage.local`; o project `integration` do Jest também instala mocks de Chrome/DOM.
- **Objeto auditado indiretamente:** `extension/reader/reader.html` SHA `065fc4e...` e `extension/reader/reader.js` SHA `490bbb1...`.
- **Runner:** `jest.config.js` inclui `tests/integration/**/*.test.js` no project `integration` com jsdom.
- **Isolamento por caso:** módulos, storage, localStorage e DOM são reinicializados; spies são restaurados no `afterEach`.

## 3. Cenários cobertos

1. capítulo salvo com duas páginas → título, contador/progresso e elementos renderizados;
2. largura válida salva → reaplicada; slider → atualiza e persiste nova largura;
3. largura 5000 → fallback 800;
4. botão Fechar → `window.close`;
5. ausência de `id` → estado inválido;
6. capítulo conhecido sem imagens → estado vazio com contador 0/0.

## 4. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| HTML e JS de produção são executados | `loadExtensionPage` lê `extension/reader/reader.html`, injeta o DOM, carrega dependências anteriores e `require()` o `reader.js` real em `jest.isolateModules` | ✅ PROVADO DIRETAMENTE |
| Renderização de capítulo com 2 páginas | assertions de título, `1 / 2`, 50%, 2 wrappers, 2 imgs e label `Página 1` após script real | ✅ PROVADO DIRETAMENTE |
| Preferência de largura válida | `readerWidth=950` resulta em maxWidth/texto 950px | ✅ PROVADO DIRETAMENTE |
| Slider persiste nova largura | evento `input` em 1100 altera UI e `localStorage` para `1100` | ✅ PROVADO DIRETAMENTE |
| Fallback para largura acima do máximo | `5000` resulta em 800px no container/slider/label | ✅ PROVADO DIRETAMENTE |
| Botão Fechar chama `window.close` | clique no `close-btn` real seguido de `toHaveBeenCalledTimes(1)` | ✅ PROVADO DIRETAMENTE |
| URL sem chapter id | título `ID inválido` + mensagem de capítulo não especificado | ✅ PROVADO DIRETAMENTE |
| Capítulo sem imagens | título preservado + mensagem vazia + contador `0 / 0` | ✅ PROVADO DIRETAMENTE |
| Atualização dinâmica do contador por IntersectionObserver | não é testada aqui; `tests/unit/reader/page-counter.test.js` possui assertions focais | ✅ PROVADO DIRETAMENTE em outra suíte |
| Navegação por teclado | não é testada aqui; `tests/unit/reader/keyboard-nav.test.js` cobre setas/scroll | ✅ PROVADO DIRETAMENTE em outra suíte |
| Limites 399/400/1200/1201 e NaN de `readerWidth` | nenhuma assertion focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

A lista `RD-01/.../RD-19` no nome do `describe` não foi usada como prova por si só. Cada conclusão acima está ligada à assertion concreta desta suíte ou, quando explicitamente indicado, a outra suíte real de reader.

## 5. Invariantes do teste

1. Cada cenário deve carregar os artefatos reais `reader.html` e `reader.js`.
2. Storage/localStorage/DOM precisam iniciar limpos para evitar dependência de ordem.
3. O teste de renderização deve verificar simultaneamente metadados visuais e cardinalidade das páginas.
4. O teste de largura deve observar a UI e o valor persistido, não apenas uma variável interna.
5. O teste de fechar deve clicar no DOM real e apenas substituir o efeito terminal `window.close`.
6. Estados vazios precisam verificar mensagem contextual e, para capítulo sem imagens, contador zero.
7. Comportamentos cobertos por suítes unitárias distintas não devem ser reivindicados aqui sem assertion local.

## 6. Casos-limite, riscos e análise crítica

- **Fronteiras de largura incompletas:** só `5000` representa valor inválido; o limite inferior, bordas e NaN não são exercitados.
- **`flushAsyncTasks(n)` é temporal:** mudanças que adicionem mais turnos assíncronos podem tornar a suíte sensível à quantidade de flushes, embora o harness use macrotasks de 0 ms.
- **Mock de `window.close`:** prova delegação do evento, não o comportamento do browser ao fechar uma aba real.
- **jsdom:** o teste prova integração de markup/script/storage em DOM simulado; layout físico, scroll e IntersectionObserver dependem de outras suítes/mocks.
- **Describe amplo:** IDs RD no título não equivalem automaticamente a cobertura de todos esses requisitos; a rastreabilidade correta é pelas assertions.

## 7. Solicitações ao auditor

### 118-001 — TEST_REQUIRED — OPEN
- **Encontrado:** O teste de fallback de largura cobre apenas um valor acima do máximo (`5000`). A implementação real aceita somente 400..1200 e também cai para 800 quando o valor é menor que 400, ausente/não numérico ou resulta em NaN; esses ramos equivalentes não têm assertion focal localizada em outra suíte.
- **Arquivo relacionado:** `tests/integration/reader.ui.test.js`
- **Evidência atual:** Este arquivo prova largura válida 950, persistência de 1100 e fallback de 5000 para 800. Busca por `readerWidth` localizou apenas este teste e `extension/reader/reader.js`.
- **Evidência ausente:** Casos de valor abaixo de 400 e valor não numérico/ausente; também não há assertion específica para as bordas exatas 400 e 1200.
- **Por que é necessário:** Uma mudança futura pode quebrar apenas um lado do intervalo ou o tratamento de NaN sem afetar o caso 5000 atualmente coberto.
- **Ação solicitada:** Ampliar a suíte em alteração separada com tabela de valores cobrindo 399, 400, 1200, 1201 e string não numérica, executando `reader.js` real via `loadExtensionPage`.
- **Evidência esperada:** Assertions de slider, width-val e maxWidth para cada limite/fallback, sem duplicar a lógica do reader no teste.
- **Ação esperada do auditor:** Confirmar a lacuna e decidir se a cobertura de fronteira é necessária para o contrato RD de largura.
- **Regressão possível:** Reader pode aceitar largura inválida baixa ou rejeitar uma borda válida sem falhar nos testes atuais.
- **Impacto:** Robustez do contrato de preferência de largura; não invalida a prova direta existente para valor válido e overflow superior.
- **Severidade:** NORMAL

## 8. Fonte integral exata

O bloco abaixo contém integralmente o blob `810a207f1264d78836b6e72c6f701bfc0cbce447`. O arquivo possui newline terminal.

```javascript
const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const { getStorageMock } = require('../mocks/chrome-api.mock.js');

describe('RD-01/RD-02/RD-03/RD-04/RD-05/RD-06/RD-07/RD-08/RD-09/RD-10/RD-11/RD-12/RD-13/RD-19: reader.js + reader.html - integracao real', () => {
    let storageMock;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        await storageMock.clear();
        localStorage.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
        jest.spyOn(window, 'close').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('renderiza titulo, contador inicial e paginas do capitulo salvo', async () => {
        await storageMock.set({
            chapterList: [{ id: 'chap_1', title: 'One Piece 1050' }],
            chap_1_images: {
                0: 'data:image/png;base64,PAGE_0',
                1: 'data:image/png;base64,PAGE_1',
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_1',
        });

        await flushAsyncTasks(6);

        expect(document.getElementById('chapter-title').textContent).toBe('One Piece 1050');
        expect(document.getElementById('page-counter').textContent).toBe('1 / 2');
        expect(document.getElementById('read-progress-fill').style.width).toBe('50%');
        expect(document.querySelectorAll('.reader-page-wrap')).toHaveLength(2);
        expect(document.querySelectorAll('.reader-page-wrap img')).toHaveLength(2);
        expect(document.querySelector('.page-label').textContent).toBe('Página 1');
    });

    test('usa largura salva no localStorage e persiste nova largura ao mover o slider', async () => {
        localStorage.setItem('readerWidth', '950');
        await storageMock.set({
            chapterList: [{ id: 'chap_2', title: 'Solo Leveling 10' }],
            chap_2_images: { 0: 'data:image/png;base64,PAGE_ONLY' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_2',
        });

        await flushAsyncTasks(6);

        const container = document.getElementById('reader-container');
        const slider = document.getElementById('width-slider');
        const widthVal = document.getElementById('width-val');

        expect(container.style.maxWidth).toBe('950px');
        expect(widthVal.textContent).toBe('950px');

        slider.value = '1100';
        slider.dispatchEvent(new Event('input', { bubbles: true }));

        expect(container.style.maxWidth).toBe('1100px');
        expect(widthVal.textContent).toBe('1100px');
        expect(localStorage.getItem('readerWidth')).toBe('1100');
    });

    test('cai para 800px quando a largura salva no localStorage está fora da faixa permitida', async () => {
        localStorage.setItem('readerWidth', '5000');
        await storageMock.set({
            chapterList: [{ id: 'chap_3', title: 'Capitulo Largo Demais' }],
            chap_3_images: { 0: 'data:image/png;base64,PAGE_ONLY' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_3',
        });

        await flushAsyncTasks(6);

        expect(document.getElementById('reader-container').style.maxWidth).toBe('800px');
        expect(document.getElementById('width-slider').value).toBe('800');
        expect(document.getElementById('width-val').textContent).toBe('800px');
    });

    test('botao fechar delega para window.close', async () => {
        await storageMock.set({
            chapterList: [{ id: 'chap_4', title: 'Fechar Reader' }],
            chap_4_images: { 0: 'data:image/png;base64,PAGE_ONLY' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_4',
        });

        await flushAsyncTasks(6);

        document.getElementById('close-btn').click();

        expect(window.close).toHaveBeenCalledTimes(1);
    });

    test('mostra estado vazio quando nao existe capitulo na URL ou nao ha imagens', async () => {
        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html',
        });

        await flushAsyncTasks(4);

        expect(document.getElementById('chapter-title').textContent).toBe('ID inválido');
        expect(document.getElementById('reader-container').textContent).toContain('Nenhum capítulo especificado na URL');

        jest.resetModules();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';

        await storageMock.set({
            chapterList: [{ id: 'chap_empty', title: 'Capitulo Vazio' }],
            chap_empty_images: {},
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_empty',
        });

        await flushAsyncTasks(6);

        expect(document.getElementById('chapter-title').textContent).toBe('Capitulo Vazio');
        expect(document.getElementById('reader-container').textContent).toContain('Nenhuma imagem salva neste capítulo');
        expect(document.getElementById('page-counter').textContent).toBe('0 / 0');
    });
});
```

## 9. Cobertura documental por faixas contíguas

As 150 posições são cobertas pelas 19 faixas abaixo sem lacunas ou sobreposição.

### Bloco 01 — linhas/posições 1–5
Importa o harness que materializa HTML/script reais e o mock de storage Chromium; o teste não reimplementa o reader.

### Bloco 02 — linhas/posições 6–8
Abre a suíte de integração e declara o `storageMock`. O rótulo lista IDs RD como agrupamento histórico; a prova efetiva deve ser atribuída às assertions concretas abaixo.

### Bloco 03 — linhas/posições 9–17
`beforeEach` isola módulos, obtém/limpa storage, limpa localStorage e DOM e espiona `window.close`. Isso estabelece estado limpo por caso e permite observar o botão de fechar sem encerrar jsdom.

### Bloco 04 — linhas/posições 18–21
`afterEach` restaura spies/mocks globais criados pelo caso.

### Bloco 05 — linhas/posições 22–30
Primeiro teste semeia um capítulo com duas imagens Base64 no storage realista do mock.

### Bloco 06 — linhas/posições 31–38
Carrega `reader.html` + `reader.js` reais na URL com `id=chap_1` e drena tarefas assíncronas para permitir a leitura de storage/renderização.

### Bloco 07 — linhas/posições 39–46
Asserts diretamente título, contador 1/2, progresso 50%, dois wrappers, duas imagens e label da primeira página; prova o estado inicial de renderização de capítulo salvo.

### Bloco 08 — linhas/posições 47–53
Segundo teste coloca preferência `readerWidth=950` e um capítulo de uma página.

### Bloco 09 — linhas/posições 54–65
Carrega a página real, aguarda tarefas e captura container, slider e label de largura do DOM materializado.

### Bloco 10 — linhas/posições 66–76
Prova aplicação da preferência 950; em seguida dispara `input` com 1100 e verifica maxWidth, texto e persistência em localStorage.

### Bloco 11 — linhas/posições 77–83
Terceiro teste prepara valor inválido alto `5000` e capítulo mínimo.

### Bloco 12 — linhas/posições 84–96
Carrega o reader real e prova fallback para 800 em container, slider e label. O caso cobre overflow superior, não todas as fronteiras possíveis.

### Bloco 13 — linhas/posições 97–102
Quarto teste prepara capítulo usado para validar a ação Fechar.

### Bloco 14 — linhas/posições 103–115
Carrega a UI, clica no elemento real `close-btn` e exige uma chamada a `window.close`, cuja implementação foi substituída apenas para observação.

### Bloco 15 — linhas/posições 116–128
Quinto teste carrega reader sem query `id` e prova título `ID inválido` e mensagem de ausência de capítulo.

### Bloco 16 — linhas/posições 129–136
No mesmo caso, reinicializa módulos/DOM e semeia um capítulo existente cujo mapa de imagens é vazio.

### Bloco 17 — linhas/posições 137–148
Recarrega `reader.html`/`reader.js` com `id=chap_empty` e prova título do capítulo, mensagem de nenhuma imagem e contador 0/0.

### Bloco 18 — linhas/posições 149–149
Fecha o `describe` da suíte.

### Bloco 19 — linhas/posições 150–150
Posição do newline terminal; não contém código.

## 10. Verificação final desta Bíblia

- SHA do fonte reconfirmado: `810a207f1264d78836b6e72c6f701bfc0cbce447`.
- Fonte integral incorporada: **sim**.
- Linhas textuais: **149**; newline terminal: **sim**; posições documentadas: **150/150**.
- Faixas documentais: **19**, contíguas e sem overlap.
- Cinco testes concretos auditados; assertions distinguem comportamento local desta suíte de cobertura oferecida por outras suítes.
- `audit_request` 118-001 registra a lacuna de fronteiras de largura.
- Nenhum código, teste, fixture, workflow ou configuração foi modificado.

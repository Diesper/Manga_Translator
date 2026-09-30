# Bíblia técnica — tests/unit/background/download-wait.test.js

> **Estado:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `1bb13ac03ab0bcaff68921211679355f9971678c`  
> **Agente:** AGENTE 11  
> **Linhas:** 168; **posições:** 169 incluindo newline final  
> **PR/branch:** #66 / `docs/project-bible`

## 1. Papel

Esta suíte prova `waitForDownload()` da implementação real de `extension/background.js`. O helper `loadBackgroundModule.js` lê o fonte real, anexa apenas getters/setters/exports de teste e executa o módulo; ele **não reimplementa** `waitForDownload`.

A fronteira `chrome.downloads.onChanged` é o mock compartilhado. Assim, as assertions são prova direta da lógica real de `waitForDownload` diante de eventos controlados, não do navegador Chrome real.

## 2. Implementação cruzada

A função real:
- ignora `delta.id` diferente;
- em `complete`, limpa o timer, remove o listener e chama `onComplete(id)`;
- em `interrupted`, limpa o timer, remove o listener e chama `onError(Error)` quando fornecido;
- registra o handler em `chrome.downloads.onChanged`;
- mantém safety timer de 600.000 ms que remove o listener e chama erro de timeout quando aplicável.

`download-image.js` e `export-all.js` consomem `waitForDownload` via contexto do roteador.

## 3. Provas diretas

| Contrato | Prova |
|---|---|
| complete chama `onComplete(42)` e não `onError` | linhas 34–45 |
| evento de ID 99 não conclui ID 42 | 47–56 |
| listener é removido após complete | 58–69 |
| segundo complete não duplica callback | 71–79 |
| interrupted chama Error contendo “interrupted” e não completa | 83–95 |
| listener é removido após interrupted | 97–107 |
| 600.000 ms causa erro timeout e cleanup | 111–125 |
| ausência de onError no timeout não lança | 127–133 |
| complete antes do timeout cancela efeito futuro do safety timer | 135–148 |
| waits de IDs 10/20 não interferem | 152–166 |

Todas essas propriedades são **✅ PROVADO DIRETAMENTE** dentro do ambiente Jest com implementação real de background.

## 4. Limites

- O EventTarget de downloads é mockado; não é teste em Chromium real.
- O teste observa a lista privada `_onChangedListeners` do mock para medir cleanup.
- Fake timers tornam o timeout determinístico.
- O loader instrumenta `background.js` para exportar funções internas; a função auditada continua sendo o corpo real do arquivo fonte.

## 5. Lacuna encontrada

O caminho de interrupção prova remoção do listener, mas não avança o relógio após `interrupted`. Portanto não existe assertion específica de que o **safety timer foi cancelado** nesse ramo e que `onError` não será chamado de novo 10 minutos depois.

A implementação atual chama `clearTimeout(safetyTimer)`; isso é visível no fonte, porém a propriedade não é provada por assertion específica nesse ramo.

## 6. Solicitação ao auditor

### 142-001 — TEST_REQUIRED — OPEN

**Encontrado:** falta assertion que prove cancelamento do safety timer após estado `interrupted`.

**Evidência atual:** o teste confirma `onError` imediato e listener removido; o fonte real contém `clearTimeout(safetyTimer)`.

**Evidência ausente:** após a interrupção, avançar >600.000 ms e confirmar que `onError` continua com exatamente uma chamada.

**Ação esperada:** acrescentar, em alteração separada, assertion de não duplicação do erro após avanço do fake timer.

**Risco:** futura regressão pode remover o `clearTimeout` do ramo interrupted e provocar callback de erro duplicado sem quebrar a suíte atual.

## 7. Fonte integral

```js
/**
 * download-wait.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa waitForDownload() real do extension/background.js.
 * Listener com Cleanup Garantido (BUG #6 Fix).
 */

const path = require('path');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { getDownloadsMock } = require('../../mocks/chrome-api.mock.js');

describe('waitForDownload() real de background.js (BUG #6)', () => {
    let bg;
    let downloadsMock;

    beforeEach(() => {
        jest.useFakeTimers();
        downloadsMock = getDownloadsMock();
        downloadsMock._onChangedListeners = [];
        const bgPath = path.resolve(__dirname, '../../../extension/background.js');
        bg = loadBackgroundModule(bgPath);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    function dispatchDownloadChange(delta) {
        // Copia a lista para suportar remoção durante iteração
        [...downloadsMock._onChangedListeners].forEach(fn => fn(delta));
    }

    describe('Download bem-sucedido', () => {
        test('BG-32: chama onComplete com o ID quando estado muda para "complete"', () => {
            const onComplete = jest.fn();
            const onError = jest.fn();

            bg.waitForDownload(42, onComplete, onError);

            // Simula evento de conclusão
            dispatchDownloadChange({ id: 42, state: { current: 'complete' } });

            expect(onComplete).toHaveBeenCalledWith(42);
            expect(onError).not.toHaveBeenCalled();
        });

        test('BG-34: ignora eventos de outros downloads (ID diferente)', () => {
            const onComplete = jest.fn();

            bg.waitForDownload(42, onComplete, jest.fn());

            // Evento de download ID 99 (outro download)
            dispatchDownloadChange({ id: 99, state: { current: 'complete' } });

            expect(onComplete).not.toHaveBeenCalled();
        });

        test('remove o listener após completar (sem memory leak)', () => {
            const listenersBefore = downloadsMock._onChangedListeners.length;

            bg.waitForDownload(42, jest.fn(), jest.fn());
            expect(downloadsMock._onChangedListeners.length).toBe(listenersBefore + 1);

            // Simula conclusão
            dispatchDownloadChange({ id: 42, state: { current: 'complete' } });

            expect(downloadsMock._onChangedListeners.length).toBe(listenersBefore);
        });

        test('não chama onComplete duas vezes para o mesmo download', () => {
            const onComplete = jest.fn();

            bg.waitForDownload(42, onComplete, jest.fn());

            dispatchDownloadChange({ id: 42, state: { current: 'complete' } });
            dispatchDownloadChange({ id: 42, state: { current: 'complete' } });

            expect(onComplete).toHaveBeenCalledTimes(1);
        });
    });

    describe('Download interrompido', () => {
        test('BG-33: chama onError quando estado muda para "interrupted"', () => {
            const onComplete = jest.fn();
            const onError = jest.fn();

            bg.waitForDownload(42, onComplete, onError);

            dispatchDownloadChange({ id: 42, state: { current: 'interrupted' } });

            expect(onError).toHaveBeenCalledWith(expect.any(Error));
            expect(onError.mock.calls[0][0].message).toContain('interrupted');
            expect(onComplete).not.toHaveBeenCalled();
        });

        test('remove o listener após interrupção', () => {
            const listenersBefore = downloadsMock._onChangedListeners.length;

            bg.waitForDownload(42, jest.fn(), jest.fn());
            expect(downloadsMock._onChangedListeners.length).toBe(listenersBefore + 1);

            dispatchDownloadChange({ id: 42, state: { current: 'interrupted' } });

            expect(downloadsMock._onChangedListeners.length).toBe(listenersBefore);
        });
    });

    describe('Safety timer de 10 minutos', () => {
        test('BG-35: remove listener após 10 minutos sem resposta', () => {
            const onError = jest.fn();
            const listenersBefore = downloadsMock._onChangedListeners.length;

            bg.waitForDownload(42, jest.fn(), onError);
            expect(downloadsMock._onChangedListeners.length).toBe(listenersBefore + 1);

            // Avança 10 minutos (600.000ms)
            jest.advanceTimersByTime(600_000);

            expect(onError).toHaveBeenCalledWith(expect.any(Error));
            expect(onError.mock.calls[0][0].message).toContain('timeout');
            expect(downloadsMock._onChangedListeners.length).toBe(listenersBefore);
        });

        test('BG-36: safety timer sem onError fornecido não lança exceção após timeout', () => {
            expect(() => {
                bg.waitForDownload(42, jest.fn(), undefined);
                jest.advanceTimersByTime(600_000);
            }).not.toThrow();
        });

        test('safety timer é cancelado quando download completa antes', () => {
            const onError = jest.fn();

            bg.waitForDownload(42, jest.fn(), onError);

            // Completa antes do timeout
            dispatchDownloadChange({ id: 42, state: { current: 'complete' } });

            // Avança além do timeout
            jest.advanceTimersByTime(700_000);

            // onError não deve ter sido chamado pelo timer
            expect(onError).not.toHaveBeenCalled();
        });
    });

    describe('Múltiplos downloads em paralelo', () => {
        test('múltiplos waitForDownload não interferem entre si', () => {
            const complete10 = jest.fn();
            const complete20 = jest.fn();

            bg.waitForDownload(10, complete10, jest.fn());
            bg.waitForDownload(20, complete20, jest.fn());

            // Completa download 10
            dispatchDownloadChange({ id: 10, state: { current: 'complete' } });

            expect(complete10).toHaveBeenCalledWith(10);
            expect(complete20).not.toHaveBeenCalled();

            // Completa download 20
            dispatchDownloadChange({ id: 20, state: { current: 'complete' } });

            expect(complete20).toHaveBeenCalledWith(20);
        });
    });
});
```

## 8. Mapa completo linha/posição

| Pos. | Contexto | Função | Evidência |
|---:|---|---|---|
| 1 | cabeçalho/imports | comentário/intenção do cenário | ⚠️ sem prova própria |
| 2 | cabeçalho/imports | comentário/intenção do cenário | ⚠️ sem prova própria |
| 3 | cabeçalho/imports | comentário/intenção do cenário | ⚠️ sem prova própria |
| 4 | cabeçalho/imports | comentário/intenção do cenário | ⚠️ sem prova própria |
| 5 | cabeçalho/imports | comentário/intenção do cenário | ⚠️ sem prova própria |
| 6 | cabeçalho/imports | comentário/intenção do cenário | ⚠️ sem prova própria |
| 7 | cabeçalho/imports | separação visual | ⚠️ sem prova própria |
| 8 | cabeçalho/imports | setup/controle do bloco cabeçalho/imports | 🟨 indireto/setup |
| 9 | cabeçalho/imports | carrega/instrumenta background.js real e exporta waitForDownload sem reimplementar sua lógica | 🟨 indireto/setup |
| 10 | cabeçalho/imports | obtém a fronteira chrome.downloads mockada | 🟨 indireto/setup |
| 11 | cabeçalho/imports | separação visual | ⚠️ sem prova própria |
| 12 | setup/cleanup/helper de dispatch | agrupa casos de setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 13 | setup/cleanup/helper de dispatch | setup/controle do bloco setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 14 | setup/cleanup/helper de dispatch | setup/controle do bloco setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 15 | setup/cleanup/helper de dispatch | separação visual | ⚠️ sem prova própria |
| 16 | setup/cleanup/helper de dispatch | setup/controle do bloco setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 17 | setup/cleanup/helper de dispatch | ativa relógio Jest controlado | 🟨 indireto/setup |
| 18 | setup/cleanup/helper de dispatch | obtém a fronteira chrome.downloads mockada | 🟨 indireto/setup |
| 19 | setup/cleanup/helper de dispatch | observa/reset a lista de listeners do mock para provar cleanup | 🟨 indireto/setup |
| 20 | setup/cleanup/helper de dispatch | setup/controle do bloco setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 21 | setup/cleanup/helper de dispatch | carrega/instrumenta background.js real e exporta waitForDownload sem reimplementar sua lógica | 🟨 indireto/setup |
| 22 | setup/cleanup/helper de dispatch | setup/controle do bloco setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 23 | setup/cleanup/helper de dispatch | separação visual | ⚠️ sem prova própria |
| 24 | setup/cleanup/helper de dispatch | setup/controle do bloco setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 25 | setup/cleanup/helper de dispatch | restaura timers reais | 🟨 indireto/setup |
| 26 | setup/cleanup/helper de dispatch | restaura spies/mocks entre casos | 🟨 indireto/setup |
| 27 | setup/cleanup/helper de dispatch | setup/controle do bloco setup/cleanup/helper de dispatch | 🟨 indireto/setup |
| 28 | setup/cleanup/helper de dispatch | separação visual | ⚠️ sem prova própria |
| 29 | setup/cleanup/helper de dispatch | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 30 | setup/cleanup/helper de dispatch | comentário/intenção do cenário | ⚠️ sem prova própria |
| 31 | setup/cleanup/helper de dispatch | observa/reset a lista de listeners do mock para provar cleanup | 🟨 indireto/setup |
| 32 | download completo e isolamento por ID | setup/controle do bloco download completo e isolamento por ID | 🟨 indireto/setup |
| 33 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 34 | download completo e isolamento por ID | agrupa casos de download completo e isolamento por ID | 🟨 indireto/setup |
| 35 | download completo e isolamento por ID | declara caso Jest de download completo e isolamento por ID | 🟨 indireto/setup |
| 36 | download completo e isolamento por ID | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 37 | download completo e isolamento por ID | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 38 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 39 | download completo e isolamento por ID | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 40 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 41 | download completo e isolamento por ID | comentário/intenção do cenário | ⚠️ sem prova própria |
| 42 | download completo e isolamento por ID | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 43 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 44 | download completo e isolamento por ID | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 45 | download completo e isolamento por ID | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 46 | download completo e isolamento por ID | setup/controle do bloco download completo e isolamento por ID | 🟨 indireto/setup |
| 47 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 48 | download completo e isolamento por ID | declara caso Jest de download completo e isolamento por ID | 🟨 indireto/setup |
| 49 | download completo e isolamento por ID | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 50 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 51 | download completo e isolamento por ID | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 52 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 53 | download completo e isolamento por ID | comentário/intenção do cenário | ⚠️ sem prova própria |
| 54 | download completo e isolamento por ID | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 55 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 56 | download completo e isolamento por ID | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 57 | download completo e isolamento por ID | setup/controle do bloco download completo e isolamento por ID | 🟨 indireto/setup |
| 58 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 59 | download completo e isolamento por ID | declara caso Jest de download completo e isolamento por ID | 🟨 indireto/setup |
| 60 | download completo e isolamento por ID | observa/reset a lista de listeners do mock para provar cleanup | 🟨 indireto/setup |
| 61 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 62 | download completo e isolamento por ID | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 63 | download completo e isolamento por ID | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 64 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 65 | download completo e isolamento por ID | comentário/intenção do cenário | ⚠️ sem prova própria |
| 66 | download completo e isolamento por ID | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 67 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 68 | download completo e isolamento por ID | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 69 | download completo e isolamento por ID | setup/controle do bloco download completo e isolamento por ID | 🟨 indireto/setup |
| 70 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 71 | download completo e isolamento por ID | declara caso Jest de download completo e isolamento por ID | 🟨 indireto/setup |
| 72 | download completo e isolamento por ID | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 73 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 74 | download completo e isolamento por ID | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 75 | download completo e isolamento por ID | separação visual | ⚠️ sem prova própria |
| 76 | download completo e isolamento por ID | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 77 | download completo e isolamento por ID | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 78 | download interrompido | separação visual | ⚠️ sem prova própria |
| 79 | download interrompido | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 80 | download interrompido | setup/controle do bloco download interrompido | 🟨 indireto/setup |
| 81 | download interrompido | setup/controle do bloco download interrompido | 🟨 indireto/setup |
| 82 | download interrompido | separação visual | ⚠️ sem prova própria |
| 83 | download interrompido | agrupa casos de download interrompido | 🟨 indireto/setup |
| 84 | download interrompido | declara caso Jest de download interrompido | 🟨 indireto/setup |
| 85 | download interrompido | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 86 | download interrompido | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 87 | download interrompido | separação visual | ⚠️ sem prova própria |
| 88 | download interrompido | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 89 | download interrompido | separação visual | ⚠️ sem prova própria |
| 90 | download interrompido | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 91 | download interrompido | separação visual | ⚠️ sem prova própria |
| 92 | download interrompido | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 93 | download interrompido | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 94 | download interrompido | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 95 | download interrompido | setup/controle do bloco download interrompido | 🟨 indireto/setup |
| 96 | download interrompido | separação visual | ⚠️ sem prova própria |
| 97 | download interrompido | declara caso Jest de download interrompido | 🟨 indireto/setup |
| 98 | download interrompido | observa/reset a lista de listeners do mock para provar cleanup | 🟨 indireto/setup |
| 99 | download interrompido | separação visual | ⚠️ sem prova própria |
| 100 | download interrompido | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 101 | download interrompido | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 102 | download interrompido | separação visual | ⚠️ sem prova própria |
| 103 | download interrompido | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 104 | download interrompido | separação visual | ⚠️ sem prova própria |
| 105 | download interrompido | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 106 | safety timer | setup/controle do bloco safety timer | 🟨 indireto/setup |
| 107 | safety timer | setup/controle do bloco safety timer | 🟨 indireto/setup |
| 108 | safety timer | separação visual | ⚠️ sem prova própria |
| 109 | safety timer | agrupa casos de safety timer | 🟨 indireto/setup |
| 110 | safety timer | declara caso Jest de safety timer | 🟨 indireto/setup |
| 111 | safety timer | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 112 | safety timer | observa/reset a lista de listeners do mock para provar cleanup | 🟨 indireto/setup |
| 113 | safety timer | separação visual | ⚠️ sem prova própria |
| 114 | safety timer | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 115 | safety timer | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 116 | safety timer | separação visual | ⚠️ sem prova própria |
| 117 | safety timer | comentário/intenção do cenário | ⚠️ sem prova própria |
| 118 | safety timer | avança fake timers para testar safety timer | 🟨 execução que sustenta assertion |
| 119 | safety timer | separação visual | ⚠️ sem prova própria |
| 120 | safety timer | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 121 | safety timer | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 122 | safety timer | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 123 | safety timer | setup/controle do bloco safety timer | 🟨 indireto/setup |
| 124 | safety timer | separação visual | ⚠️ sem prova própria |
| 125 | safety timer | declara caso Jest de safety timer | 🟨 indireto/setup |
| 126 | safety timer | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 127 | safety timer | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 128 | safety timer | avança fake timers para testar safety timer | 🟨 execução que sustenta assertion |
| 129 | safety timer | setup/controle do bloco safety timer | 🟨 indireto/setup |
| 130 | safety timer | setup/controle do bloco safety timer | 🟨 indireto/setup |
| 131 | safety timer | separação visual | ⚠️ sem prova própria |
| 132 | safety timer | declara caso Jest de safety timer | 🟨 indireto/setup |
| 133 | safety timer | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 134 | safety timer | separação visual | ⚠️ sem prova própria |
| 135 | safety timer | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 136 | safety timer | separação visual | ⚠️ sem prova própria |
| 137 | safety timer | comentário/intenção do cenário | ⚠️ sem prova própria |
| 138 | safety timer | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 139 | safety timer | separação visual | ⚠️ sem prova própria |
| 140 | safety timer | comentário/intenção do cenário | ⚠️ sem prova própria |
| 141 | safety timer | avança fake timers para testar safety timer | 🟨 execução que sustenta assertion |
| 142 | safety timer | separação visual | ⚠️ sem prova própria |
| 143 | safety timer | comentário/intenção do cenário | ⚠️ sem prova própria |
| 144 | safety timer | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 145 | safety timer | setup/controle do bloco safety timer | 🟨 indireto/setup |
| 146 | downloads paralelos | setup/controle do bloco downloads paralelos | 🟨 indireto/setup |
| 147 | downloads paralelos | separação visual | ⚠️ sem prova própria |
| 148 | downloads paralelos | agrupa casos de downloads paralelos | 🟨 indireto/setup |
| 149 | downloads paralelos | declara caso Jest de downloads paralelos | 🟨 indireto/setup |
| 150 | downloads paralelos | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 151 | downloads paralelos | cria callback espiável para medir chamadas | 🟨 indireto/setup |
| 152 | downloads paralelos | separação visual | ⚠️ sem prova própria |
| 153 | downloads paralelos | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 154 | downloads paralelos | executa a função real waitForDownload extraída de background.js | 🟨 execução que sustenta assertion |
| 155 | downloads paralelos | separação visual | ⚠️ sem prova própria |
| 156 | downloads paralelos | comentário/intenção do cenário | ⚠️ sem prova própria |
| 157 | downloads paralelos | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 158 | downloads paralelos | separação visual | ⚠️ sem prova própria |
| 159 | downloads paralelos | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 160 | downloads paralelos | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 161 | downloads paralelos | separação visual | ⚠️ sem prova própria |
| 162 | downloads paralelos | comentário/intenção do cenário | ⚠️ sem prova própria |
| 163 | downloads paralelos | injeta evento onChanged no mock para acionar o handler real | 🟨 execução que sustenta assertion |
| 164 | downloads paralelos | separação visual | ⚠️ sem prova própria |
| 165 | downloads paralelos | assertion direta sobre callback, erro, listener ou timer | ✅ direto |
| 166 | downloads paralelos | setup/controle do bloco downloads paralelos | 🟨 indireto/setup |
| 167 | downloads paralelos | setup/controle do bloco downloads paralelos | 🟨 indireto/setup |
| 168 | fechamento da suíte | setup/controle do bloco fechamento da suíte | 🟨 indireto/setup |
| 169 | newline final | newline final POSIX | ⚠️ sem prova própria |

## 9. Autoauditoria

- SHA reconfirmado: `1bb13ac03ab0bcaff68921211679355f9971678c`.
- Fonte integral embutida.
- Cobertura posicional: **169/169**.
- Implementação real, loader e mock de downloads foram cruzados.
- Evidência direta foi limitada às assertions reais.
- Nenhum arquivo externo foi modificado.

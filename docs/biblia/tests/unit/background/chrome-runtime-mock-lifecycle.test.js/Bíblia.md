# Bíblia técnica — tests/unit/background/chrome-runtime-mock-lifecycle.test.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE 7 — consolidação global fora do escopo deste agente  
> **Índice correto do corpus:** **134**  
> **SHA auditado:** `1bd33ea5e027db04ae17bb78810780474a31856e`  
> **Agente responsável:** AGENTE 7  
> **Tipo:** Jest unitário da infraestrutura assíncrona dos Chrome API mocks  
> **Linhas textuais:** **79**  
> **Posições documentais:** **80**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte protege o ciclo de vida dos recursos assíncronos criados pelos mocks de `chrome.runtime`, `chrome.storage` e `chrome.tabs`. O objetivo não é testar o Chrome real: é garantir que a infraestrutura de teste não deixe timers/callbacks de um caso sobreviverem ao teardown e interferirem no caso seguinte ou manterem o worker Jest aberto.

Os quatro testes usam fake timers para tornar a propriedade observável: primeiro comprovam que o mock realmente registrou um handle; depois invocam a API de cleanup, exigem registry vazio, avançam além do instante em que o callback ocorreria e verificam que nada executou.

## 2. Dependências e integração com os mocks

- **Implementação exercitada:** `tests/mocks/chrome-api.mock.js`, não stubs locais desta suíte.
- **Runtime:** `_pendingMessageTimers`, `clearMessageTimers()`, `sendMessage()` e `onInstalled`.
- **Storage:** `_pendingTimers`, `clearTimers()` e `get()`.
- **Tabs:** `_pendingTimers`, `clearTimers()`, `create()` e `onUpdated`.
- **Jest:** fake timers para controlar o relógio e spies `jest.fn()` para observar execução tardia.
- **Matriz de regressão:** quatro IDs independentes apontam explicitamente para este arquivo.

## 3. Contrato de ownership assíncrono

1. qualquer callback temporizado criado pelo caso atual entra no registry do mock correspondente.
2. o teardown consegue cancelar todos os handles registrados.
3. cancelar remove os handles do registry.
4. depois do cancelamento, avançar o relógio não executa callback/listener.
5. registries de listeners alterados pela suíte são limpos após cada caso.
6. timers reais são restaurados depois do caso.

## 4. Evidência automatizada

| Propriedade | Evidência | Classificação |
|---|---|---|
| Runtime channel sem resposta não atravessa teardown | pending size 1 → clear → 0 → +501 ms → callback não chamado | ✅ PROVADO DIRETAMENTE |
| Storage callback pendente não atravessa teardown | pending size 2 → clear → 0 → +1 ms → callback não chamado | ✅ PROVADO DIRETAMENTE |
| tabs.create onUpdated tardio é cancelável | pending size 1 → clear → 0 → +11 ms → listener não chamado | ✅ PROVADO DIRETAMENTE |
| onInstalled agendado é cancelável | runtime registry size 1 → clear → 0 → +1 ms → listener não chamado | ✅ PROVADO DIRETAMENTE |
| Mocks reais possuem registries/clearers correspondentes | `chrome-api.mock.js` implementa `_pendingTimers`, `_pendingMessageTimers`, `clearTimers` e `clearMessageTimers` usados pelo teste | ✅ PROVADO DIRETAMENTE |
| Teardown global do mock também limpa recursos | `chrome-api.mock.js` afterEach chama clear em storage/tabs/runtime/downloads e limpa timers Jest | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Quatro regressões permanecem na matriz | REG-RUNTIME-MESSAGE-TIMER, REG-STORAGE-PENDING-CALLBACK, REG-TABS-PENDING-UPDATE, REG-RUNTIME-INSTALLED-PENDING apontam para este arquivo/markers | 🟦 GATE ESTÁTICO ESPECÍFICO |

A suíte é particularmente forte para regressões de teardown porque não se limita a observar Set vazio: ela avança o relógio além do callback esperado e exige que o efeito observável não aconteça.

## 5. Rastreabilidade da matriz de regressão

- `REG-RUNTIME-MESSAGE-TIMER`: timeout de canal sem resposta não pode atravessar teardown.
- `REG-STORAGE-PENDING-CALLBACK`: callbacks de storage não podem atingir o caso seguinte.
- `REG-TABS-PENDING-UPDATE`: `onUpdated` tardio de `tabs.create` não pode reativar listeners.
- `REG-RUNTIME-INSTALLED-PENDING`: `onInstalled` agendado deve permanecer cancelável.

A matriz protege a presença de markers deste arquivo; a execução Jest é que prova o comportamento.

## 6. Casos-limite e análise crítica

- **Infraestrutura, não browser:** o teste valida mocks; não afirma que APIs Chrome reais usam esses registries.
- **Fake timers intencionais:** sem fake timers, a prova dependeria de tempo real e seria mais flaky.
- **Cleanup explícito + global:** os casos chamam clear diretamente e o `chrome-api.mock.js` também possui afterEach global.
- **Listeners de escopo:** esta suíte limpa apenas registries que ela altera (`message`, `installed`, `tabs.onUpdated`); não cria `startup/connect`.
- **Caminho natural:** o foco é cancelamento; outros testes dos mocks/background cobrem callbacks que efetivamente disparam.

## 7. Solicitações ao auditor

Nenhuma solicitação externa foi aberta. Os quatro riscos que constituem o propósito deste arquivo possuem assertions negativas diretas e cada um está também rastreado pela matriz de regressão.

## 8. Fonte integral exata

O bloco abaixo contém integralmente o blob `1bd33ea5e027db04ae17bb78810780474a31856e`. O arquivo possui newline terminal.

```javascript
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
} = require('../../mocks/chrome-api.mock.js');

describe('Chrome API mocks: recursos assíncronos pertencem ao caso atual', () => {
    afterEach(() => {
        const runtime = getRuntimeMock();
        const tabs = getTabsMock();

        runtime._messageListeners = [];
        runtime._installedListeners = [];
        tabs._onUpdatedListeners = [];
        jest.useRealTimers();
    });

    test('descarta timeout de canal sem resposta no teardown', () => {
        jest.useFakeTimers();
        const runtime = getRuntimeMock();
        runtime._messageListeners = [() => true];
        const callback = jest.fn();

        runtime.sendMessage({ action: 'PENDING_RESPONSE' }, callback);
        expect(runtime._pendingMessageTimers.size).toBe(1);

        runtime.clearMessageTimers();
        expect(runtime._pendingMessageTimers.size).toBe(0);
        jest.advanceTimersByTime(501);
        expect(callback).not.toHaveBeenCalled();
    });

    test('descarta callbacks pendentes do storage antes que atravessem o teardown', () => {
        jest.useFakeTimers();
        const storage = getStorageMock();
        const callback = jest.fn();

        storage.get(null, callback);
        expect(storage._pendingTimers.size).toBe(2);

        storage.clearTimers();
        expect(storage._pendingTimers.size).toBe(0);
        jest.advanceTimersByTime(1);
        expect(callback).not.toHaveBeenCalled();
    });

    test('descarta onUpdated atrasado de tabs.create antes que reative listeners do background', () => {
        jest.useFakeTimers();
        const tabs = getTabsMock();
        const onUpdated = jest.fn();
        tabs.onUpdated.addListener(onUpdated);

        tabs.create({ url: 'https://example.test/page' });
        expect(tabs._pendingTimers.size).toBe(1);

        tabs.clearTimers();
        expect(tabs._pendingTimers.size).toBe(0);
        jest.advanceTimersByTime(11);
        expect(onUpdated).not.toHaveBeenCalled();

        tabs.onUpdated.removeListener(onUpdated);
    });

    test('onInstalled usa o registry do runtime e pode ser cancelado no teardown', () => {
        jest.useFakeTimers();
        const runtime = getRuntimeMock();
        const installed = jest.fn();

        runtime.onInstalled.addListener(installed);
        expect(runtime._pendingMessageTimers.size).toBe(1);

        runtime.clearMessageTimers();
        expect(runtime._pendingMessageTimers.size).toBe(0);
        jest.advanceTimersByTime(1);
        expect(installed).not.toHaveBeenCalled();

        runtime.onInstalled.removeListener(installed);
    });
});
```

## 9. Cobertura documental por faixas contíguas

As 80 posições são cobertas pelas 9 faixas abaixo sem lacunas ou sobreposição.

### Bloco 01 — linhas/posições 1–5
Importa as três factories singleton dos mocks de runtime, storage e tabs que serão exercitadas diretamente.

### Bloco 02 — linhas/posições 6–7
Abre a suíte dedicada ao ownership temporal de recursos assíncronos dos mocks.

### Bloco 03 — linhas/posições 8–16
`afterEach` limpa registries de listeners modificados pela suíte e restaura timers reais, evitando que fake timers/listeners de um caso atravessem para o próximo.

### Bloco 04 — linhas/posições 17–31
Primeiro cenário usa fake timers, força um listener runtime a manter o canal assíncrono aberto, envia mensagem sem resposta, prova um timer pendente, chama `clearMessageTimers`, prova zero handles e avança além do timeout garantindo que callback não dispara.

### Bloco 05 — linhas/posições 32–45
Segundo cenário chama `storage.get(null, callback)`, observa dois timers internos pendentes, limpa-os, verifica Set vazio e avança o relógio sem callback tardio.

### Bloco 06 — linhas/posições 46–62
Terceiro cenário registra `tabs.onUpdated`, cria uma aba, prova um timer, executa `tabs.clearTimers`, avança 11 ms e garante ausência de evento tardio; remove o listener explicitamente.

### Bloco 07 — linhas/posições 63–78
Quarto cenário registra `runtime.onInstalled`, prova o timer zero-delay no registry de runtime, cancela antes do tick e confirma que o listener não executa; depois remove o listener.

### Bloco 08 — linhas/posições 79–79
Fecha o `describe`.

### Bloco 09 — linhas/posições 80–80
Posição do newline terminal.

## 10. Verificação final desta Bíblia

- Índice do CHECKLIST reconfirmado: **134**.
- SHA do fonte reconfirmado: `1bd33ea5e027db04ae17bb78810780474a31856e`.
- Fonte integral incorporada: **sim**.
- Linhas textuais: **79**; newline terminal: **sim**; posições documentadas: **80/80**.
- Faixas documentais: **9**, contíguas e sem overlap.
- Quatro cenários de regressão possuem assertions diretas e quatro entradas correspondentes na matriz.
- Nenhum `audit_request` aberto.
- Nenhum mock, teste, código funcional, workflow ou configuração foi alterado.

# Bíblia técnica — tests/unit/content-gemini/temporary-chat-v2.test.js

> **Estado documental:** ✅ CONCLUÍDA — solicitações 190-001 a 190-003 sincronizadas como ACCEPTED ao state canônico e mapa posicional 144/144 reconciliado  
> **SHA auditado:** `bdf7146fac7fa9575b2fa1ab8f16e2d6b4480446`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest unitária do módulo real de conversa temporária  
> **Linhas textuais:** 143  
> **Posições documentais:** 144, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte valida os estados observáveis de `extension/content/gemini/temporary-chat.js` sem usar adapter legado ou mirror.

Ela importa o módulo real por `require(TEMP_PATH)` dentro de `jest.isolateModules()` e testa diretamente `ensureActive()` e a ausência de APIs geométricas antigas.

O foco é garantir que um clique não seja confundido com ativação: `activated_verified` só é aceito depois que o DOM passa a representar estado ativo.

## 2. Setup

Cada teste:
- recria o DOM;
- garante `PointerEvent`;
- carrega o módulo real isoladamente;
- restaura spies/mocks depois do caso.

O relógio é mockado nos cenários de timeout para impedir loops dependentes de tempo real.

## 3. Casos provados

### TEMP-01 — already_active

Um botão com texto “Desativar conversa temporária” representa estado já ativo.

A suíte exige:
- `{status:'already_active'}`;
- nenhum `click()`.

### TEMP-02 — activated_verified

O botão começa como “Ativar conversa momentânea”. O listener de click muda o texto para “Desativar...” e define `aria-pressed=true`.

A suíte exige `activated_verified`.

Isso prova que o módulo relê o estado depois do clique e não trata o click em si como sucesso.

### TEMP-03 — state_not_verified

O botão aceita clique mas não muda o estado.

Com `Date.now` controlado, `ensureActive()` termina em:

```text
verification_failed / state_not_verified
```

### TEMP-04 — unavailable

Sem controle semanticamente compatível, o resultado é `unavailable`.

### TEMP-05 — sem fallback geométrico

Um botão genérico com posição “conveniente” não é usado.

A suíte exige:
- `findButtonByPosition` inexistente;
- `unavailable`.

Isso protege contra a regressão para heurística posicional frágil.

### Clique único após falha de verificação

Um botão sem mudança real é clicado apenas uma vez durante a janela de observação.

Essa assertion prova a regra de segurança: depois de um click considerado realizado, o módulo apenas observa e não alterna repetidamente o toggle.

## 4. Relação com temp-chat-activator.test.js

`temp-chat-activator.test.js` amplia a mesma implementação real com:
- detecção PT/EN;
- data-test-id;
- indicadores de ativo;
- sequência pointer/mouse/click.

A presente suíte concentra-se no contrato de estados de `ensureActive()`.

As duas suítes são complementares e autênticas.

## 5. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| módulo real é importado | `require(TEMP_PATH)` | ✅ PROVADO DIRETAMENTE |
| estado já ativo não clica | TEMP-01 | ✅ PROVADO DIRETAMENTE |
| clique só vira sucesso após confirmação DOM | TEMP-02 | ✅ PROVADO DIRETAMENTE |
| clique sem mudança retorna state_not_verified | TEMP-03 | ✅ PROVADO DIRETAMENTE |
| ausência de controle retorna unavailable | TEMP-04 | ✅ PROVADO DIRETAMENTE |
| fallback posicional não existe | TEMP-05 | ✅ PROVADO DIRETAMENTE |
| não repete toggle após clique | teste final | ✅ PROVADO DIRETAMENTE |
| AbortSignal → aborted | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| triggerClick falha → control_not_actionable | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Shadow DOM | coberto por outro helper/caminho, não nesta suíte | ⚠️ SEM TESTE NESTE ARQUIVO |
| integração de cada reason com job-runner | não exercitada aqui | ⚠️ SEM TESTE NESTE ARQUIVO |

## 6. Solicitações ao auditor

### 190-001 — TEST_REQUIRED — ACCEPTED

**Encontrado:** `ensureActive()` possui retorno `verification_failed/aborted`, mas esta suíte não injeta `AbortSignal` abortado.

**Evidência atual:** demais estados principais possuem assertions diretas.

**Ação solicitada:** adicionar caso com signal abortado antes e, se relevante, durante o loop.

**Evidência esperada:** retorno exato `{status:'verification_failed', reason:'aborted'}` sem click posterior.

**Risco:** cancelamento pode regressar e o job continuar interagindo com a página.

**Severidade:** NORMAL.

### 190-002 — TEST_REQUIRED — ACCEPTED

**Encontrado:** não há caso em que um controle semântico é encontrado, mas `triggerClick()` falha repetidamente, levando a `control_not_actionable`.

**Evidência atual:** indisponibilidade e click bem-sucedido são cobertos.

**Ação solicitada:** mockar `element.click` lançando ou tornar o elemento não acionável e exigir `control_not_actionable`.

**Evidência esperada:** status correto sem falso `activated_verified`.

**Risco:** UI presente porém não clicável pode ser confundida com ausência/estado válido.

**Severidade:** NORMAL.

### 190-003 — INTEGRATION_REVIEW — ACCEPTED

**Encontrado:** esta suíte prova os statuses do helper, mas não o efeito de cada reason no `job-runner.js`.

**Evidência atual:** runner consome status e produz flags próprias.

**Ação solicitada:** confirmar cobertura integrada para `aborted`, `state_not_verified` e `control_not_actionable`.

**Evidência esperada:** decisão posterior do runner explicitamente assertada por status.

**Risco:** mudança de mapping pode alterar fluxo global com testes unitários verdes.

**Severidade:** NORMAL.

## 7. Fonte integral auditada

```js
'use strict';

const path = require('path');

const TEMP_PATH = path.resolve(__dirname, '../../../extension/content/gemini/temporary-chat.js');

function loadTempChat() {
  let api;
  jest.isolateModules(() => {
    api = require(TEMP_PATH);
  });
  return api;
}

describe('gemini/temporary-chat.js — estados verificáveis', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    if (typeof window.PointerEvent !== 'function') window.PointerEvent = window.MouseEvent;
    if (typeof global.PointerEvent !== 'function') global.PointerEvent = window.PointerEvent;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('TEMP-01: já ativa retorna already_active sem clicar', async () => {
    const api = loadTempChat();
    const button = document.createElement('button');
    button.textContent = 'Desativar conversa temporária';
    document.body.appendChild(button);
    const clickSpy = jest.spyOn(button, 'click');

    await expect(api.ensureActive({
      root: document,
      timeoutMs: 100,
      sleep: async () => {},
    })).resolves.toEqual({ status: 'already_active' });

    expect(clickSpy).not.toHaveBeenCalled();
  });

  test('TEMP-02: clique só retorna activated_verified depois de reler estado ativo', async () => {
    const api = loadTempChat();
    const button = document.createElement('button');
    button.textContent = 'Ativar conversa momentânea';
    button.addEventListener('click', () => {
      button.textContent = 'Desativar conversa momentânea';
      button.setAttribute('aria-pressed', 'true');
    });
    document.body.appendChild(button);

    await expect(api.ensureActive({
      root: document,
      timeoutMs: 500,
      sleep: async () => {},
    })).resolves.toEqual({ status: 'activated_verified' });
  });

  test('TEMP-03: clique sem mudança real nunca retorna sucesso', async () => {
    const api = loadTempChat();
    const button = document.createElement('button');
    button.textContent = 'Ativar conversa momentânea';
    document.body.appendChild(button);

    let tick = 0;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      tick += 100;
      return tick;
    });

    const result = await api.ensureActive({
      root: document,
      timeoutMs: 350,
      sleep: async () => {},
    });

    expect(result).toEqual({
      status: 'verification_failed',
      reason: 'state_not_verified',
    });
    expect(nowSpy).toHaveBeenCalled();
  });

  test('TEMP-04: ausência do controle retorna unavailable', async () => {
    const api = loadTempChat();
    document.body.innerHTML = '<button>Enviar</button><button>Ajuda</button>';

    let tick = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      tick += 100;
      return tick;
    });

    await expect(api.ensureActive({
      root: document,
      timeoutMs: 250,
      sleep: async () => {},
    })).resolves.toEqual({ status: 'unavailable' });
  });

  test('TEMP-05: sem fallback geométrico, botão genérico permanece unavailable', async () => {
    const api = loadTempChat();

    const generic = document.createElement('button');
    generic.textContent = 'Menu';
    generic.getBoundingClientRect = () => ({
      top: 20, left: 1050, right: 1150, bottom: 60,
      width: 100, height: 40,
    });
    document.body.appendChild(generic);

    expect(api.findButtonByPosition).toBeUndefined();

    await expect(api.ensureActive({
      root: document,
      timeoutMs: 0,
      sleep: async () => {},
    })).resolves.toEqual({ status: 'unavailable' });
  });

  test('não alterna o toggle repetidamente após um clique não confirmado', async () => {
    const api = loadTempChat();
    const button = document.createElement('button');
    button.textContent = 'Ativar conversa temporária';
    const clickSpy = jest.spyOn(button, 'click');
    document.body.appendChild(button);

    let tick = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      tick += 100;
      return tick;
    });

    await api.ensureActive({
      root: document,
      timeoutMs: 450,
      sleep: async () => {},
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
```

## 8. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–6 | `'use strict'`, imports (`path`) e resolução de `TEMP_PATH` |
| 7–13 | helper `loadTempChat()` via `jest.isolateModules()` |
| 14 | linha em branco separadora |
| 15–25 | abertura do `describe` principal, `beforeEach` e `afterEach` |
| 26 | linha em branco separadora |
| 27–41 | caso `TEMP-01: já ativa retorna already_active sem clicar` |
| 42 | linha em branco separadora |
| 43–58 | caso `TEMP-02: clique só retorna activated_verified depois de reler estado ativo` |
| 59 | linha em branco separadora |
| 60–83 | caso `TEMP-03: clique sem mudança real nunca retorna sucesso` |
| 84 | linha em branco separadora |
| 85–100 | caso `TEMP-04: ausência do controle retorna unavailable` |
| 101 | linha em branco separadora |
| 102–120 | caso `TEMP-05: sem fallback geométrico, botão genérico permanece unavailable` |
| 121 | linha em branco separadora |
| 122–142 | caso `não alterna o toggle repetidamente após um clique não confirmado` |
| 143 | fechamento `});` do `describe` |
| posição 144 | newline final (`\n`) |

## 9. Autoauditoria do AGENTE 17

- [x] reserva exclusiva #190 criada e relida;
- [x] state próprio criado;
- [x] teste real e módulo de produção correspondente comparados;
- [x] fonte integral incorporada;
- [x] 143 linhas + newline = 144 posições;
- [x] estados provados separados dos ausentes;
- [x] três solicitações externas registradas;
- [x] nenhum arquivo de produção/teste modificado.

**Resultado:** a suíte prova diretamente os estados principais e a regra de click único do módulo real; faltam cancelamento, controle não acionável e a matriz integrada desses reasons no runner.

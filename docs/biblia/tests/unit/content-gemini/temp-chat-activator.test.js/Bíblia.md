# Bíblia técnica — tests/unit/content-gemini/temp-chat-activator.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `f9418a4301c97d91e06d47196729218aaedbdd37`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest unitária do módulo real temporary-chat.js  
> **Linhas textuais:** 250  
> **Posições documentais:** 251, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte carrega diretamente:

```text
extension/content/gemini/temporary-chat.js
```

via `jest.isolateModules()`.

Diferente de testes históricos baseados em mirror, aqui o objeto executado é o módulo real.

O foco é a semântica de descoberta/ativação do modo Temporary Chat do Gemini.

## 2. Descoberta semântica

`findTempChatButton()` é testado com:

- texto português “Ativar conversa momentânea”;
- aria-label inglês “Toggle temporary chat”;
- `data-test-id="temp-chat-button"`;
- ausência de qualquer controle compatível.

Isso prova que a seleção não depende de posição geométrica.

## 3. Detecção de estado já ativo

A suíte cobre várias famílias de sinais:

- indicador `.momentary-indicator`;
- `aria-checked="true"`;
- texto “Desativar conversa momentânea”;
- texto de ativação retornando false;
- banner nativo português;
- tela “Está só dando uma passadinha?”;
- tela equivalente em inglês;
- botão “Fechar a conversa momentânea”.

Esses casos exercitam a lógica real de `isAlreadyActive()`.

## 4. Sequência de click

`triggerClick()` é testado com um botão real do JSDOM.

A suíte exige esta ordem:

```text
pointerdown
mousedown
pointerup
mouseup
click
```

e exige retorno `true`.

Isso constitui prova direta da sequência básica de eventos.

## 5. ensureActive — estados principais

A suíte prova:

### already_active

Controle já ativo:
- retorna `already_active`;
- não chama `click()`.

### activated_verified

Controle começa inativo.

O handler de click:
- incrementa contador;
- troca o texto para “Desativar…”;
- adiciona classe `active`.

O resultado precisa ser `activated_verified` e o número de clicks igual a 1.

### unavailable

Sem controle semanticamente compatível:
- retorna `unavailable`.

### ausência de fallback legado

A suíte exige:

```js
temporaryChat.findButtonByPosition === undefined
temporaryChat.createLegacyAdapter === undefined
```

Isso protege contra reintrodução explícita das APIs legadas.

## 6. Relação com temporary-chat-v2.test.js

A suíte #190 complementa esta com:

- `state_not_verified`;
- garantia de click único após falha de verificação;
- testes equivalentes de `already_active`, `activated_verified` e `unavailable`.

Assim, #189 é mais forte em descoberta semântica e sinais de atividade; #190 é mais forte em contrato de estado pós-click.

## 7. Ramos ainda não isolados nesta suíte

### Estado ativo por atributos/classes

O código real aceita também:

- `aria-pressed="true"`;
- `data-state="active"`;
- classes `active`, `selected`, `checked`.

A suíte cobre `aria-checked` e texto, mas não isola todos esses sinais.

### findInTree / Shadow DOM

O módulo exporta `findInTree` e possui travessia composta usada para localizar controles em árvores mais profundas.

Não há caso nesta suíte que construa Shadow DOM aberto e prove a busca através dele.

### triggerClick defensivo

Não são isolados:

- `focus({preventScroll:true})`;
- coordenadas derivadas de `getBoundingClientRect()`;
- exceção de `focus`;
- exceção de `getBoundingClientRect`;
- `element.click()` lançando e retorno `false`.

### ensureActive abort/control_not_actionable

Esses ramos permanecem fora desta suíte.

Eles também foram identificados nas auditorias #049/#190.

## 8. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| módulo real é importado | loadTemporaryChat | ✅ PROVADO DIRETAMENTE |
| encontra texto PT | findTempChatButton tests | ✅ PROVADO DIRETAMENTE |
| encontra aria-label EN | findTempChatButton tests | ✅ PROVADO DIRETAMENTE |
| encontra data-test-id | findTempChatButton tests | ✅ PROVADO DIRETAMENTE |
| ausência semântica retorna null | teste direto | ✅ PROVADO DIRETAMENTE |
| indicador momentary ativo | isAlreadyActive | ✅ PROVADO DIRETAMENTE |
| aria-checked ativo | isAlreadyActive | ✅ PROVADO DIRETAMENTE |
| texto desativar ativo | isAlreadyActive | ✅ PROVADO DIRETAMENTE |
| banner PT/EN ativo | isAlreadyActive | ✅ PROVADO DIRETAMENTE |
| sequência pointer/mouse/click | triggerClick | ✅ PROVADO DIRETAMENTE |
| already_active sem click | ensureActive | ✅ PROVADO DIRETAMENTE |
| activated_verified com click único | ensureActive | ✅ PROVADO DIRETAMENTE |
| unavailable | ensureActive | ✅ PROVADO DIRETAMENTE |
| ausência APIs legadas | assertions finais | 🟦 GATE ESTÁTICO ESPECÍFICO |
| aria-pressed/data-state/class active isolados | não | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Shadow DOM/findInTree | não | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| triggerClick retornando false | não | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| aborted/control_not_actionable | não nesta suíte | ⚠️ SEM TESTE NESTE ARQUIVO |

## 9. Solicitações ao auditor

### 189-001 — TEST_REQUIRED — OPEN

**Encontrado:** `isAlreadyActive()` possui sinais adicionais não isolados nesta suíte: `aria-pressed`, `data-state=active` e classes active/selected/checked.

**Evidência atual:** aria-checked, texto e banners nativos são fortemente cobertos.

**Ação solicitada:** adicionar casos pequenos e independentes para os sinais restantes.

**Evidência esperada:** remoção de qualquer branch de estado ativo relevante torna um teste vermelho.

**Risco:** mudança de UI do Gemini pode passar a depender justamente de um sinal não protegido.

**Severidade:** NORMAL.

### 189-002 — TEST_REQUIRED — OPEN

**Encontrado:** `findInTree`/travessia de Shadow DOM não possui caso focal nesta suíte.

**Evidência atual:** light DOM é amplamente coberto.

**Ação solicitada:** criar host com `attachShadow({mode:'open'})`, inserir controle temporário dentro e provar descoberta/ativação.

**Evidência esperada:** controle semântico dentro de Shadow DOM é encontrado sem fallback geométrico.

**Risco:** mudança do Gemini para web components pode tornar o controle invisível.

**Severidade:** HIGH.

### 189-003 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** `triggerClick()` é coberto apenas no caminho feliz.

**Evidência atual:** ordem dos cinco eventos está provada.

**Evidência ausente:** foco/coordenadas e retorno false quando `element.click()` lança.

**Ação solicitada:** adicionar casos com rect conhecido, focus spy e click lançando exceção.

**Evidência esperada:** coordenadas centrais corretas e `false` no controle não acionável.

**Risco:** `ensureActive` pode classificar incorretamente um controle presente mas impossível de clicar.

**Severidade:** NORMAL.

## 10. Fonte integral auditada

```js
/**
 * temp-chat-activator.test.js
 * Testa diretamente gemini/temporary-chat.js sem adapter legado.
 */

const path = require('path');

const TEMP_CHAT_PATH = path.resolve(
    __dirname,
    '../../../extension/content/gemini/temporary-chat.js'
);

function loadTemporaryChat() {
    let api;
    jest.isolateModules(() => {
        api = require(TEMP_CHAT_PATH);
    });
    return api;
}

describe('Temporary Chat — módulo semântico', () => {
    let temporaryChat;

    beforeEach(() => {
        if (!window.PointerEvent) {
            window.PointerEvent = class PointerEvent extends MouseEvent {};
        }
        document.documentElement.innerHTML = '<head></head><body></body>';
        temporaryChat = loadTemporaryChat();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    describe('findTempChatButton()', () => {
        test('localiza botão pelo texto "conversa momentânea"', () => {
            const btn = document.createElement('button');
            btn.textContent = 'Ativar conversa momentânea';
            document.body.appendChild(btn);

            expect(temporaryChat.findTempChatButton(document)).toBe(btn);
        });

        test('localiza botão pelo aria-label em inglês "temporary chat"', () => {
            const btn = document.createElement('div');
            btn.setAttribute('role', 'button');
            btn.setAttribute('aria-label', 'Toggle temporary chat');
            document.body.appendChild(btn);

            expect(temporaryChat.findTempChatButton(document)).toBe(btn);
        });

        test('localiza pelo data-test-id "temp-chat-button"', () => {
            const btn = document.createElement('button');
            btn.setAttribute('data-test-id', 'temp-chat-button');
            btn.textContent = 'Modo privado';
            document.body.appendChild(btn);

            expect(temporaryChat.findTempChatButton(document)).toBe(btn);
        });

        test('retorna null quando nenhum controle semanticamente compatível existe', () => {
            document.body.innerHTML =
                '<button>Enviar</button><button>Ajuda</button>';

            expect(temporaryChat.findTempChatButton(document)).toBeNull();
        });
    });

    describe('isAlreadyActive()', () => {
        test('detecta ativo via indicador .momentary-indicator no DOM', () => {
            const indicator = document.createElement('div');
            indicator.className = 'momentary-indicator';
            indicator.textContent = 'Conversa momentânea ativada';
            document.body.appendChild(indicator);

            expect(
                temporaryChat.isAlreadyActive(null, document)
            ).toBe(true);
        });

        test('detecta ativo via atributo aria-checked="true"', () => {
            const btn = document.createElement('button');
            btn.setAttribute('aria-checked', 'true');
            btn.textContent = 'Conversa momentânea';
            document.body.appendChild(btn);

            expect(
                temporaryChat.isAlreadyActive(btn, document)
            ).toBe(true);
        });

        test('detecta ativo via texto "desativar conversa momentânea"', () => {
            const btn = document.createElement('button');
            btn.textContent = 'Desativar conversa momentânea';
            document.body.appendChild(btn);

            expect(
                temporaryChat.isAlreadyActive(btn, document)
            ).toBe(true);
        });

        test('retorna false para controle que oferece ativação', () => {
            const btn = document.createElement('button');
            btn.textContent = 'Ativar conversa momentânea';
            document.body.appendChild(btn);

            expect(
                temporaryChat.isAlreadyActive(btn, document)
            ).toBe(false);
        });

        test('detecta banner nativo em português', () => {
            const banner = document.createElement('div');
            banner.textContent =
                'As conversas temporárias não aparecem no seu histórico nem são usadas para treinar modelos.';
            document.body.appendChild(banner);

            expect(
                temporaryChat.isAlreadyActive(null, document)
            ).toBe(true);
        });

        test('detecta tela nativa "Está só dando uma passadinha?"', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <h2>Está só dando uma passadinha?</h2>
                <p>As conversas momentâneas não aparecem nas conversas recentes e não são usadas para aprimorar a IA do Google.</p>
            `;
            document.body.appendChild(container);

            expect(
                temporaryChat.isAlreadyActive(null, document)
            ).toBe(true);
        });

        test('detecta tela nativa em inglês', () => {
            const container = document.createElement('div');
            container.innerHTML = `
                <h2>Just passing through?</h2>
                <p>Temporary chats don’t appear in Recent chats and aren’t used to improve Google AI.</p>
            `;
            document.body.appendChild(container);

            expect(
                temporaryChat.isAlreadyActive(null, document)
            ).toBe(true);
        });

        test('detecta botão de fechar conversa momentânea', () => {
            const closeBtn = document.createElement('button');
            closeBtn.setAttribute(
                'aria-label',
                'Fechar a conversa momentânea'
            );
            document.body.appendChild(closeBtn);

            expect(
                temporaryChat.isAlreadyActive(null, document)
            ).toBe(true);
        });
    });

    describe('triggerClick()', () => {
        test('dispara pointer/mouse e click uma única vez', () => {
            const btn = document.createElement('button');
            document.body.appendChild(btn);

            const events = [];
            [
                'pointerdown',
                'mousedown',
                'pointerup',
                'mouseup',
                'click',
            ].forEach(type => {
                btn.addEventListener(type, () => events.push(type));
            });

            expect(temporaryChat.triggerClick(btn)).toBe(true);
            expect(events).toEqual([
                'pointerdown',
                'mousedown',
                'pointerup',
                'mouseup',
                'click',
            ]);
        });
    });

    describe('ensureActive()', () => {
        test('retorna already_active sem clicar', async () => {
            const btn = document.createElement('button');
            btn.textContent = 'Desativar conversa momentânea';
            document.body.appendChild(btn);

            const clickSpy = jest.spyOn(btn, 'click');
            const result = await temporaryChat.ensureActive({
                root: document,
                timeoutMs: 50,
                sleep: async () => {},
            });

            expect(result.status).toBe('already_active');
            expect(clickSpy).not.toHaveBeenCalled();
        });

        test('clica uma vez e exige verificação de estado', async () => {
            const btn = document.createElement('button');
            btn.textContent = 'Ativar conversa momentânea';
            document.body.appendChild(btn);

            let clicks = 0;
            btn.addEventListener('click', () => {
                clicks += 1;
                btn.textContent = 'Desativar conversa momentânea';
                btn.classList.add('active');
            });

            const result = await temporaryChat.ensureActive({
                root: document,
                timeoutMs: 100,
                sleep: async () => {},
            });

            expect(result.status).toBe('activated_verified');
            expect(clicks).toBe(1);
        });

        test('sem controle semântico retorna unavailable', async () => {
            document.body.innerHTML =
                '<button style="position:absolute;right:0;top:0">Enviar</button>';

            const result = await temporaryChat.ensureActive({
                root: document,
                timeoutMs: 1,
                sleep: async () => {},
            });

            expect(result.status).toBe('unavailable');
        });

        test('não existe mais fallback posicional', () => {
            expect(temporaryChat.findButtonByPosition).toBeUndefined();
            expect(temporaryChat.createLegacyAdapter).toBeUndefined();
        });
    });
});
```

## 11. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–4 | cabeçalho |
| 6–17 | path + loader isolado |
| 18–33 | describe/setup |
| 34–68 | findTempChatButton |
| 69–156 | isAlreadyActive |
| 157–186 | triggerClick |
| 187–248 | ensureActive + remoção de fallback legado |
| 249–250 | fechamento |
| posição 251 | newline final |

## 12. Autoauditoria do AGENTE 17

- [x] reserva #189 criada e relida;
- [x] state próprio criado;
- [x] módulo real comparado;
- [x] estados #049/#190 consultados para evitar claims duplicados;
- [x] fonte integral incorporada;
- [x] 250 linhas + newline = 251 posições;
- [x] provas diretas separadas das lacunas;
- [x] três solicitações persistíveis identificadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #189 é uma suíte autêntica e forte para semântica PT/EN, sinais de modo ativo e click verificável; as lacunas restantes são defensivas/estruturais, não de caminho feliz.

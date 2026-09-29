# Bíblia técnica — `extension/content/inject.js`

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE  
> **SHA auditado:** `21f7f6cf9c940a6de6e4fd72d4bf7eeb88e7a27c`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#Agent-A`  
> **Tipo:** JavaScript — content script Chromium MV3 em `world: MAIN`  
> **Linhas textuais:** **472**  
> **Posições documentais:** **473** contando o newline terminal  
> **PR:** `#66`  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`inject.js` é a ponte que precisa rodar **no mesmo JavaScript world da página Gemini**. O isolated world da extensão não consegue substituir de forma confiável getters e primitivas que o próprio app lê, nem acessar integrações internas do editor da mesma forma. Por isso o manifest o injeta com `world: MAIN` e `run_at: document_start` em `https://gemini.google.com/*` e no loopback E2E.

O arquivo tem quatro responsabilidades: (1) reduzir hibernação/throttling da aba de trabalho; (2) fornecer fallbacks progressivos de `requestAnimationFrame` e `requestIdleCallback`; (3) servir como ponte para prompt e fetch autenticado de imagens; (4) oferecer um último fallback de submit quando o fluxo normal do editor falha.

## 2. Ativação e lifecycle

O manifest é amplo o suficiente para carregar o script em páginas Gemini, mas a automação de background constrói cada job por `jobs-lifecycle.js#buildGeminiJobUrl`, que adiciona `mangatranslator=true` e `jobId`. A guarda local só prossegue quando `window.location.href` contém `mangatranslator` ou quando a sessão já possui `mangatranslator_tab=true`.

A flag `__anti_hibernation_injected` é definida **antes** da validação do marker. Isso impede dupla instalação, mas cria uma consequência: uma página Gemini inicialmente não marcada fica registrada como “já injetada”. Se a mesma `Document` fosse posteriormente convertida em worker apenas por SPA/navigation sem novo document, uma tentativa de reinjeção encontraria o guard e sairia. O fluxo atual abre a aba já com query marker, então o risco depende de futuras estratégias de reutilização de tab.

Não há rotina de restauração das APIs nativas. Uma vez ativado naquele `Document`, o script mantém overrides/listeners/timers até a destruição do document. Em debug/uso prolongado isso importa porque `minimal` reduz pulsos de foco, mas **não** desfaz spoof de visibilidade, rAF/idle ou listeners.

## 3. Anti-throttling progressivo

Os níveis são `minimal`, `balanced` e `legacy`. O runner usa `minimal` para temp chat normal e `balanced` para modos mais suscetíveis a throttling; `legacy` existe como escalada mais agressiva. `FOCUS_CADENCE_MS` mantém baseline sem intervalo de foco e ativa pulsos apenas nos modos elevados.

O script força `visibilityState='visible'`, `hidden=false` e `hasFocus=true`, além de interceptar `visibilitychange`, `blur` e `pagehide` em captura com `stopImmediatePropagation`. Isso é eficaz para impedir que o app receba sinais de background, mas é deliberadamente invasivo: também pode bloquear handlers legítimos do próprio Gemini. A guarda de aba é, portanto, parte essencial do contrato.

## 4. Scheduling substituído

`requestAnimationFrame` recebe IDs próprios e guarda callbacks num `Map`. Quando o rAF nativo roda, o callback é consumido imediatamente; se a aba for throttled, um `setTimeout` recursivo drena a fila na cadência do modo. A presença no `Map` evita callback duplicado quando o nativo e o fallback competem.

Há uma fragilidade específica no cancelamento: o código não guarda o **ID retornado pelo rAF nativo**. `cancelAnimationFrame(id)` remove o callback do `Map`, o que impede sua lógica de rodar, mas também chama `origCancelRaf(id)` usando o ID sintético. Em princípio esse número pode não corresponder ao ID nativo e pode cancelar outro frame nativo com o mesmo número. Falta teste Main-world que prove ausência desse efeito colateral.

O mesmo padrão aparece em `requestIdleCallback`: o ID próprio identifica o timeout fallback, mas o ID nativo retornado por `origIdle` não é armazenado; `origCancelIdle(id)` recebe o ID sintético. A correção lógica local funciona pela flag/map, porém a chamada de cancelamento nativo merece teste específico.

## 5. AudioContext

O contexto silencioso só nasce após `click`, `pointerdown` ou `keydown` com `isTrusted`. Isso respeita a política de autoplay e impede que eventos sintéticos da automação desbloqueiem áudio. Depois do primeiro gesto os listeners são removidos.

Por outro lado, o `AudioContext` e o oscillator não são armazenados para cleanup; o oscillator é iniciado sem `stop()` e o contexto não é fechado. Isso parece intencional como mecanismo de atividade, mas deve ser tratado como recurso de longa duração e precisa de teste de lifecycle/consumo.

## 6. Ponte de prompt

`MANGA_TRANSLATOR_SET_PROMPT` localiza `rich-textarea`/editor, evita preencher texto idêntico, tenta Quill quando exposto e, em fallback, simula paste com `DataTransfer`. O HTML do clipboard é escapado (`&`, `<`, `>`) antes de ser inserido; quando o DOM permanece vazio, o fallback constrói `<p>` e usa `textContent`, evitando interpretar o prompt como HTML.

Depois do preenchimento o script dispara `beforeinput`, `input` e `change`, inclusive no wrapper `rich-textarea`, para atualizar tanto DOM quanto estado interno do framework.

## 7. Ponte autenticada de imagem

`MANGA_TRANSLATOR_FETCH_IMAGE` recebe `{requestId,url}`, faz `fetch(..., {credentials:'include', cache:'no-store'})`, exige `response.ok` e MIME `image/*`, converte o blob em Data URL e responde com o mesmo `requestId`. O consumidor `result-extractor` usa esse identificador para separar respostas concorrentes e possui timeout/fallback.

O listener não contém allowlist local de scheme/origin. Como roda no MAIN world, a Same-Origin Policy continua limitando leituras cross-origin, mas qualquer JavaScript da página marcada consegue emitir o CustomEvent. A política de segurança depende do escopo da aba worker e do fato de o retorno aceitar apenas MIME de imagem; uma allowlist explícita dos hosts de asset reduziria ainda mais a superfície.

## 8. Fallback de envio

`MANGA_TRANSLATOR_TRIGGER_SEND` aplica debounce de 3 s, emite foco, tenta Enter no `rich-textarea`, tenta Enter em todos os editores profundos e, por fim, procura o último botão que pareça ser submit. A heurística combina aria-label, tooltip, test-id, classes, texto e presença de ícone, com blacklist.

Duas fragilidades merecem teste real: (1) Enter pode já ter enviado antes do clique do botão, de modo que uma mesma invocação pode produzir submit duplicado; (2) `hasSendIcon` aceita **qualquer `svg` ou `mat-icon`** e o caso `label === ''` pode classificar um botão sem rótulo como send, desde que não caia na blacklist. O `break` limita a um botão clicado, mas não prova que o botão escolhido é o correto.

## 9. Evidências automatizadas auditadas

| Comportamento | Evidência lida | Classificação |
|---|---|---|
| Manifest injeta `content/inject.js` em MAIN/document_start para Gemini/loopback | `extension/manifest.json`, gate estrutural e testes de superfície | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Background adiciona `mangatranslator=true` às URLs de job | `jobs-lifecycle.js#buildGeminiJobUrl`; fluxos de lifecycle usam essa função | 🟨 EXECUTADO INDIRETAMENTE |
| Guard, visibility spoof e supressão de eventos | `inject-anti-hibernation.test.js` / `visibility-spoof.test.js` usam implementações espelho | evidência complementar/simulação |
| Cadências minimal/balanced/legacy e ausência de ghost mousemove | testes leem strings do arquivo fonte | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Runner escolhe modo e emite `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` | `job-runner.test.js` RUN-06/RUN-07 executa runner real | 🟨 EXECUTADO INDIRETAMENTE para `inject.js` |
| rAF/idle reais deste arquivo | testes antigos usam setInterval/stub e não carregam `inject.js` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| AudioContext após gesto `isTrusted` | nenhuma suíte carrega esta implementação MAIN | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Evento SET_PROMPT emitido pelo fluxo Gemini | `helpers-and-regressions-real.test.js` CG-23/CG-24 | 🟨 EXECUTADO INDIRETAMENTE |
| Listener SET_PROMPT deste arquivo altera Quill/paste/eventos | não há harness MAIN que execute `inject.js` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Protocolo FETCH_IMAGE requestId/erro/timeout/fallback | `safe-background-delete.test.js` e `result-extractor.test.js` usam responders simulados | 🟨 EXECUTADO INDIRETAMENTE |
| `fetch(...credentials: include)` e MIME check deste listener | nenhum teste chama o listener real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| TRIGGER_SEND é emitido no fallback do runner/content Gemini | `rpa-flow.test.js` observa o evento | 🟨 EXECUTADO INDIRETAMENTE |
| Heurística real de Enter + botão profundo | nenhum teste executa `inject.js` real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| MutationObserver lazy→eager alegado pela suíte de inject | não existe MutationObserver correspondente no fonte atual | ⚠️ TESTE ESPELHO DESATUALIZADO |

### Divergências de teste encontradas

1. `tests/unit/inject/inject-anti-hibernation.test.js` declara “Cobertura Completa”, mas o próprio cabeçalho admite que **não carrega `inject.js`**; usa implementações espelho.
2. A suíte ainda testa conversão `img[loading=lazy] → eager` via MutationObserver, comportamento ausente no fonte atual.
3. A suíte agregada e `raf-replacement.test.js` descrevem rAF baseado em `setInterval` e cancelamento stub, enquanto a produção atual usa `Map`, rAF nativo e `setTimeout` recursivo, com cancelamento que também chama a API nativa.
4. Portanto esses testes são úteis como intenção histórica/técnica, mas não podem ser citados como prova direta da implementação atual.

## 10. Lacunas de teste e riscos

1. **⚠️ Execução real em MAIN world.** Teste necessário: Criar Playwright/Jest browser harness que carregue a extensão, abra URL `?mangatranslator=true` e observe diretamente globals/listeners de `inject.js`. Regressão possível: Hoje não existe assertion da implementação real; regressões podem passar apesar dos espelhos.
2. **⚠️ Guard definido antes do marker.** Teste necessário: Abrir Gemini não marcado, manter o mesmo Document, introduzir marker/reinjeção e verificar se o script consegue ativar quando isso for um fluxo suportado. Regressão possível: A flag `__anti_hibernation_injected` pode bloquear ativação tardia no mesmo Document.
3. **⚠️ Cancelamento rAF com ID sintético.** Teste necessário: Mockar rAF nativo retornando IDs diferentes dos IDs locais e verificar que cancelar um callback não cancela outro nativo. Regressão possível: `origCancelRaf(id)` recebe ID local, não o ID retornado pelo rAF nativo.
4. **⚠️ Cancelamento idle com ID sintético.** Teste necessário: Mesmo teste para `requestIdleCallback`/`cancelIdleCallback`. Regressão possível: Pode atingir callback nativo alheio por colisão numérica.
5. **⚠️ Lifecycle/cleanup de timers e overrides.** Teste necessário: Navegar/encerrar job e verificar restauração/teardown de rAF, idle, focus interval e listeners. Regressão possível: Não há cleanup explícito enquanto o Document permanece vivo.
6. **⚠️ AudioContext/oscillator.** Teste necessário: Disparar gesto real em navegador, verificar uma única criação e comportamento após fim do job. Regressão possível: Oscillator não recebe `stop()` e contexto não é fechado.
7. **⚠️ Fetch MAIN allowlist.** Teste necessário: Testar schemes/hosts inesperados, redirects, MIME inválido e URL same-origin autenticada. Regressão possível: Listener aceita qualquer `detail.url`; segurança depende de SOP e escopo da aba.
8. **⚠️ Prompt com caracteres especiais.** Teste necessário: Executar listener real com `<`, `>`, `&`, Unicode e quebras de linha em Quill e fallback paste. Regressão possível: Consumer testa evento, mas não o escape/DOM real desta ponte.
9. **⚠️ Submit duplicado.** Teste necessário: Fixture em que Enter já submete e botão continua habilitado; contar submits. Regressão possível: Uma invocação envia Enter e depois ainda procura/clica botão.
10. **⚠️ Falso positivo de botão.** Teste necessário: DOM com vários botões sem label e SVG genérico; comprovar que apenas send correto é escolhido. Regressão possível: `hasSendIcon` considera qualquer SVG/mat-icon e permite label vazio.
11. **⚠️ Debounce após falha.** Teste necessário: Primeira tentativa não encontra editor/botão; segunda chega dentro de 3 s. Regressão possível: Timestamp é atualizado antes da tentativa e pode bloquear retry útil.
12. **⚠️ Teste stale de lazy→eager.** Teste necessário: Remover/reescrever o teste ou restaurar requisito documentado se ainda necessário. Regressão possível: Hoje o teste pode passar sem existir comportamento correspondente em produção.

## 11. Segurança e trust boundaries

- Os CustomEvents são intencionalmente públicos no MAIN world; scripts da própria página conseguem emiti-los. A guarda de `mangatranslator` reduz o escopo, mas não autentica o emissor.
- O prompt é tratado como texto: HTML do ClipboardEvent é escapado e fallback DOM usa `textContent`.
- A ponte de imagem inclui credenciais da sessão Gemini e devolve Data URL; `requestId` evita mistura lógica, mas não é segredo/autorização.
- Same-Origin Policy continua valendo porque o fetch é da página, não um fetch privilegiado da extensão; mesmo assim uma allowlist de assets seria defesa adicional.
- Spoof de visibility/focus e `stopImmediatePropagation` alteram comportamento global do app; ativação restrita ao tab de job é uma fronteira de segurança/compatibilidade, não só performance.

## 12. Invariantes

1. Uma `Document` worker não pode instalar duas instâncias ativas dos shims do inject.
2. A automação Main-world só deve ativar em tab de job marcada por `mangatranslator`/session marker.
3. `minimal` não deve manter loop periódico de foco; escalada agressiva deve ser explícita.
4. Callbacks rAF/idle cancelados não podem executar sua callback da extensão.
5. Fallback rAF/idle não pode executar a mesma callback duas vezes quando a API nativa também responder.
6. Prompt variável nunca deve ser interpretado como HTML não escapado.
7. A ponte de fetch deve correlacionar resposta pelo mesmo `requestId` recebido.
8. Conteúdo retornado pela ponte de imagem precisa permanecer limitado a MIME `image/*` antes da conversão.
9. Fallback de submit não deve clicar botão blacklisted/desabilitado.
10. Uma invocação de fallback de submit não deve resultar em duas mensagens Gemini.
11. Erros de API/DOM de fallback não devem derrubar toda a página Gemini.
12. Alterações futuras nos testes de inject devem executar o arquivo real ou continuar rotuladas explicitamente como simulação.

## 13. Fonte integral auditada

```javascript
// inject.js — Manga Translator (Anti-throttling progressivo)
(function() {
    if (window.__anti_hibernation_injected) return;
    window.__anti_hibernation_injected = true;

    // 0. Guarda de Isolamento: Executar apenas se for aba de tradução
    const isTranslatorTab = window.location.href.includes('mangatranslator') ||
                            sessionStorage.getItem('mangatranslator_tab') === 'true';
    if (!isTranslatorTab) {
        return;
    }
    try { sessionStorage.setItem('mangatranslator_tab', 'true'); } catch (e) {}

    // 1. Anti-throttling progressivo.
    //
    // O modo padrão é minimal: mantém os shims necessários para o Gemini não
    // congelar em background, mas não simula atividade humana nem dispara foco
    // continuamente. O content script pode elevar temporariamente para
    // balanced/legacy quando o modo de execução ou uma segunda tentativa de
    // submit realmente precisar.
    const ANTI_THROTTLE_MODES = new Set(['minimal', 'balanced', 'legacy']);
    const RAF_CADENCE_MS = {
        minimal: 250,
        balanced: 100,
        legacy: 50,
    };
    const FOCUS_CADENCE_MS = {
        minimal: 0,
        balanced: 5000,
        legacy: 1000,
    };

    let antiThrottleMode = 'minimal';
    try {
        const storedMode = sessionStorage.getItem('mangaTranslatorAntiThrottleMode');
        if (ANTI_THROTTLE_MODES.has(storedMode)) antiThrottleMode = storedMode;
    } catch (_e) {}

    // Visibilidade permanece falsificada enquanto esta aba é um worker válido.
    // Isso evita que frameworks da página parem pipelines internos ao receber
    // visibilitychange/blur, sem gerar mousemove sintético.
    try {
        Object.defineProperty(document, 'visibilityState', {
            get: () => 'visible',
            configurable: true
        });
        Object.defineProperty(document, 'hidden', {
            get: () => false,
            configurable: true
        });
        if (Document.prototype) Document.prototype.hasFocus = () => true;
    } catch(e) {}
    document.hasFocus = () => true;

    const stopProp = e => e.stopImmediatePropagation();
    document.addEventListener('visibilitychange', stopProp, true);
    window.addEventListener('visibilitychange', stopProp, true);
    window.addEventListener('blur', stopProp, true);
    window.addEventListener('pagehide', stopProp, true);

    const dispatchFocusEvents = () => {
        try {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new FocusEvent('focusin', {
                bubbles: true,
                composed: true
            }));
        } catch (_e) {}
    };

    let focusIntervalId = null;
    function refreshFocusEscalation() {
        if (focusIntervalId !== null) {
            clearInterval(focusIntervalId);
            focusIntervalId = null;
        }

        const cadence = FOCUS_CADENCE_MS[antiThrottleMode] || 0;
        if (cadence <= 0) return;

        focusIntervalId = setInterval(dispatchFocusEvents, cadence);
    }

    function setAntiThrottleMode(nextMode) {
        const normalized = ANTI_THROTTLE_MODES.has(nextMode)
            ? nextMode
            : 'minimal';

        antiThrottleMode = normalized;
        try {
            sessionStorage.setItem(
                'mangaTranslatorAntiThrottleMode',
                antiThrottleMode
            );
        } catch (_e) {}

        refreshFocusEscalation();
        dispatchFocusEvents();
        return antiThrottleMode;
    }

    // Pulso inicial único. Não existe mais loop de foco permanente no baseline.
    dispatchFocusEvents();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', dispatchFocusEvents, {
            once: true
        });
    }
    refreshFocusEscalation();

    window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', event => {
        const requestedMode = event.detail && event.detail.mode;
        setAntiThrottleMode(requestedMode);
    });

    window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_PULSE', () => {
        dispatchFocusEvents();
    });

    window.__mangaTranslatorAntiThrottle = {
        getMode: () => antiThrottleMode,
        setMode: setAntiThrottleMode,
        pulse: dispatchFocusEvents,
    };

    // 2. requestAnimationFrame progressivo.
    // Em vez de acordar a fila a cada 50ms para sempre, o próximo flush usa a
    // cadência do nível atual. Uma escalada passa a valer no tick seguinte.
    let nextRafId = 1;
    const rafCallbacks = new Map();
    const origRaf = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : null;
    const origCancelRaf = typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : null;

    window.requestAnimationFrame = function(cb) {
        const id = nextRafId++;
        rafCallbacks.set(id, cb);

        if (origRaf && document.visibilityState === 'visible') {
            try {
                origRaf(now => {
                    if (!rafCallbacks.has(id)) return;
                    rafCallbacks.delete(id);
                    try { cb(now); } catch(_e) {}
                });
            } catch(_e) {}
        }
        return id;
    };

    window.cancelAnimationFrame = function(id) {
        rafCallbacks.delete(id);
        if (origCancelRaf) {
            try { origCancelRaf(id); } catch (_e) {}
        }
    };

    const flushRaf = () => {
        if (rafCallbacks.size === 0) return;
        const entries = Array.from(rafCallbacks.entries());
        rafCallbacks.clear();
        const now = performance.now();
        for (const [, cb] of entries) {
            try { cb(now); } catch(_e) {}
        }
    };

    let rafFlushTimer = null;
    function scheduleRafFlush() {
        const cadence = RAF_CADENCE_MS[antiThrottleMode] || RAF_CADENCE_MS.minimal;
        rafFlushTimer = setTimeout(() => {
            flushRaf();
            scheduleRafFlush();
        }, cadence);
    }
    scheduleRafFlush();

    // 2.1. requestIdleCallback com fallback adaptativo.
    let nextIdleId = 1;
    const idleCallbacks = new Map();
    const origIdle = typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback.bind(window)
        : null;
    const origCancelIdle = typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback.bind(window)
        : null;

    window.requestIdleCallback = function(cb, options) {
        const id = nextIdleId++;
        let executed = false;
        const modeBudget = RAF_CADENCE_MS[antiThrottleMode] || RAF_CADENCE_MS.minimal;
        const requestedTimeout =
            options && typeof options.timeout === 'number'
                ? options.timeout
                : modeBudget;
        const maxWait = Math.min(requestedTimeout, modeBudget);

        const timerId = setTimeout(() => {
            if (executed) return;
            executed = true;
            idleCallbacks.delete(id);
            try {
                cb({
                    didTimeout: true,
                    timeRemaining: () => Math.max(
                        0,
                        modeBudget - (performance.now() % modeBudget)
                    )
                });
            } catch(_e) {}
        }, maxWait);

        idleCallbacks.set(id, timerId);

        if (origIdle && document.visibilityState === 'visible') {
            try {
                origIdle(deadline => {
                    if (executed) return;
                    executed = true;
                    clearTimeout(timerId);
                    idleCallbacks.delete(id);
                    try { cb(deadline); } catch(_e) {}
                }, options);
            } catch(_e) {}
        }
        return id;
    };

    window.cancelIdleCallback = function(id) {
        if (idleCallbacks.has(id)) {
            clearTimeout(idleCallbacks.get(id));
            idleCallbacks.delete(id);
        }
        if (origCancelIdle) {
            try { origCancelIdle(id); } catch (_e) {}
        }
    };

    // 3. Audio silencioso apenas após gesto real do usuário.
    let audioContextAtivo = false;
    const activateAudio = e => {
        if (audioContextAtivo || (e && !e.isTrusted)) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            audioContextAtivo = true;
            ['click', 'pointerdown', 'keydown'].forEach(evt =>
                document.removeEventListener(evt, activateAudio, true)
            );
        } catch(_e) {}
    };
    ['click', 'pointerdown', 'keydown'].forEach(evt =>
        document.addEventListener(evt, activateAudio, true)
    );

    // Ghost mousemove removido. Atividade sintética aleatória não é necessária
    // para manter rAF/idle vivos e pode interferir com menus, tooltips e seleção.

    // Helper: busca profunda atravessando Shadow Roots
    function findAllDeep(root, predicate) {
        const list = [];
        function walk(node) {
            if (!node) return;
            if (node.nodeType === Node.ELEMENT_NODE) {
                try { if (predicate(node)) list.push(node); } catch(e) {}
                try { if (node.shadowRoot) walk(node.shadowRoot); } catch(e) {}
            }
            let child = node.firstChild;
            while (child) {
                walk(child);
                child = child.nextSibling;
            }
        }
        walk(root);
        return list;
    }

    // 5. Ponte entre Isolated World e Main World (Gemini Input / BardChatUi)
    window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', (e) => {
        try {
            const text = e.detail && e.detail.prompt;
            if (!text) return;
            
            const rta = document.querySelector('rich-textarea');
            const target = (rta && rta.querySelector ? rta.querySelector('[contenteditable="true"], .ql-editor') : null)
                        || document.querySelector('[contenteditable="true"], .ql-editor');
            
            if (!target) return;

            // Previne duplicação do prompt se já estiver preenchido com o texto exato
            if (target.textContent.trim() === text.trim()) return;
            
            // 1. Tenta acessar Quill se disponível
            const q = (target && target.__quill)
                   || (rta && rta.__quill)
                   || (window.Quill && typeof window.Quill.find === 'function' && (window.Quill.find(target) || window.Quill.find(rta)));
                   
            if (q) {
                try {
                    if (typeof q.setText === 'function') q.setText(text, 'user');
                    if (typeof q.update === 'function') q.update('user');
                } catch(e) {}
            } else {
                try {
                    const dt = new DataTransfer();
                    dt.setData('text/plain', text);
                    const safeHtml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    dt.setData('text/html', `<p>${safeHtml}</p>`);
                    target.dispatchEvent(new ClipboardEvent('paste', {
                        bubbles: true, cancelable: true, composed: true, clipboardData: dt
                    }));
                } catch(e) {}
            }
            
            // 2. Garante o elemento de parágrafo no DOM caso vazio
            if ((target.textContent || '').trim().length === 0) {
                const p = document.createElement('p');
                p.textContent = text;
                if (typeof target.replaceChildren === 'function') {
                    target.replaceChildren(p);
                } else {
                    while (target.firstChild) {
                        target.removeChild(target.firstChild);
                    }
                    target.appendChild(p);
                }
            }
            
            if (typeof target.focus === 'function') target.focus({ preventScroll: true });
            
            // 3. Dispara eventos de Input com composed: true
            try {
                target.dispatchEvent(new InputEvent('beforeinput', {
                    bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text
                }));
                target.dispatchEvent(new InputEvent('input', {
                    bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text
                }));
                target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            } catch(e) {}
            
            if (rta) {
                try { if ('value' in rta) rta.value = text; } catch(e) {}
                try { rta.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch(e) {}
            }
            
            console.log("⚡ [inject.js] Prompt injetado com sucesso no modelo do Gemini!");
        } catch(err) {
            console.warn("❌ [inject.js] Erro ao injetar prompt:", err);
        }
    });

    // A imagem do resultado já está acessível dentro da sessão autenticada do
    // Gemini. Esta ponte permite que o content script a converta sem abrir uma
    // aba auxiliar e sem usar o fetch anônimo do Service Worker.
    window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', async (event) => {
        const detail = event.detail || {};
        if (!detail.requestId || !detail.url) return;
        try {
            const response = await fetch(detail.url, { credentials: 'include', cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) throw new Error(`Tipo inválido: ${blob.type || 'desconhecido'}`);
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'));
                reader.readAsDataURL(blob);
            });
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId: detail.requestId, dataUrl }
            }));
        } catch (error) {
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId: detail.requestId, error: error && error.message ? error.message : 'Falha ao buscar imagem' }
            }));
        }
    });

    let _lastTriggerSendTime = 0;
    window.addEventListener('MANGA_TRANSLATOR_TRIGGER_SEND', () => {
        const now = Date.now();
        if (now - _lastTriggerSendTime < 3000) return; // Debounce de 3s para evitar envios duplicados
        _lastTriggerSendTime = now;
        try {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('focus'));
            
            // 1. Dispara Enter no container e editores
            const rta = document.querySelector('rich-textarea');
            if (rta) {
                try {
                    rta.dispatchEvent(new KeyboardEvent('keydown', {
                        bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13
                    }));
                } catch(e) {}
            }
            const targets = findAllDeep(document.body, el => el.getAttribute && (el.getAttribute('contenteditable') === 'true' || (el.className && typeof el.className === 'string' && el.className.includes('ql-editor'))));
            for (const target of targets) {
                try {
                    if (typeof target.focus === 'function') target.focus({ preventScroll: true });
                    target.dispatchEvent(new KeyboardEvent('keydown', {
                        bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13
                    }));
                } catch(e) {}
            }
            
            // 2. Busca profunda por botões de envio em Light DOM e Shadow Roots
            const allButtons = findAllDeep(document.body, el => {
                if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
                const tag = el.tagName.toLowerCase();
                const role = (el.getAttribute('role') || '').toLowerCase();
                return tag === 'button' || role === 'button' || tag.includes('button') || tag === 'mat-icon-button';
            });

            const blacklist = ['feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close', 'fechar', 'dismiss', 'mic', 'microfone', 'voice', 'audio', 'stop'];

            for (let i = allButtons.length - 1; i >= 0; i--) {
                const btn = allButtons[i];
                const label       = (btn.getAttribute('aria-label')   || '').toLowerCase().trim();
                const tooltip     = (btn.getAttribute('mattooltip')   || '').toLowerCase().trim();
                const dataTooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase().trim();
                const testId      = (btn.getAttribute('data-test-id') || btn.getAttribute('data-testid') || '').toLowerCase().trim();
                const className   = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();
                const text        = (btn.innerText || btn.textContent || '').toLowerCase().trim();

                const combined = `${label} ${tooltip} ${dataTooltip} ${testId} ${className}`;
                if (blacklist.some(b => combined.includes(b))) continue;

                const hasSendIcon = text.includes('arrow_upward') || text.includes('send') ||
                                    !!btn.querySelector('mat-icon, svg, [data-icon-name*="send"], [data-icon-name*="arrow"]');

                const isSend = label === 'enviar' || label === 'enviar mensagem' || label === 'enviar prompt' || label === 'enviar consulta' ||
                               label === 'send' || label === 'send message' || label === 'send prompt' ||
                               tooltip === 'enviar' || tooltip === 'enviar mensagem' || tooltip === 'send' ||
                               dataTooltip === 'enviar' || dataTooltip === 'send' ||
                               testId === 'send-button' || className.includes('send-button') ||
                               (hasSendIcon && (label.includes('enviar') || label.includes('send') || label === ''));

                const enabled = btn.disabled !== true &&
                                !btn.hasAttribute('disabled') &&
                                btn.getAttribute('aria-disabled') !== 'true';

                if (isSend && enabled) {
                    if (typeof btn.focus === 'function') btn.focus();

                    const eventOpts = { bubbles: true, cancelable: true, composed: true, view: window };
                    btn.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
                    btn.dispatchEvent(new MouseEvent('mousedown', eventOpts));
                    btn.dispatchEvent(new MouseEvent('mouseup', eventOpts));
                    btn.dispatchEvent(new PointerEvent('pointerup', eventOpts));
                    btn.click();
                    break;
                }
            }
        } catch(err) {}
    });

    console.log("⚡ Anti-throttling progressivo ativo no Gemini (modo " + antiThrottleMode + ").");
})();

```

## 14. Cobertura documental linha a linha

Cada posição abaixo corresponde exatamente a `source.split("\n")`. A classificação de evidência é da unidade funcional; quando a unidade é apenas simulada/indireta, isso permanece explícito em todas as suas linhas.

### Linha 0001

**Fonte:** `// inject.js — Manga Translator (Anti-throttling progressivo)`  
**O que faz:** Comentário do fonte registra: “inject.js — Manga Translator (Anti-throttling progressivo)”.  
**Como faz:** Documenta intenção ou limitação da unidade **IIFE e guard de idempotência** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — `inject-anti-hibernation.test.js` lê o fonte para o guard, mas o comportamento é simulado; não carrega este arquivo real.

### Linha 0002

**Fonte:** `(function() {`  
**O que faz:** Participa de **IIFE e guard de idempotência** com `(function() {`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Evita instalar duas vezes shims globais, listeners e timers no mesmo document MAIN-world.  
**Risco/alternativa:** Sem o guard, cada reinjeção duplicaria filas rAF/idle, listeners e pontes de eventos.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — `inject-anti-hibernation.test.js` lê o fonte para o guard, mas o comportamento é simulado; não carrega este arquivo real.

### Linha 0003

**Fonte:** `if (window.__anti_hibernation_injected) return;`  
**O que faz:** Aplica a guarda `if (window.__anti_hibernation_injected) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **IIFE e guard de idempotência**.  
**Por que assim:** Evita instalar duas vezes shims globais, listeners e timers no mesmo document MAIN-world.  
**Risco/alternativa:** Sem o guard, cada reinjeção duplicaria filas rAF/idle, listeners e pontes de eventos.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — `inject-anti-hibernation.test.js` lê o fonte para o guard, mas o comportamento é simulado; não carrega este arquivo real.

### Linha 0004

**Fonte:** `window.__anti_hibernation_injected = true;`  
**O que faz:** Participa de **IIFE e guard de idempotência** com `window.__anti_hibernation_injected = true;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Evita instalar duas vezes shims globais, listeners e timers no mesmo document MAIN-world.  
**Risco/alternativa:** Sem o guard, cada reinjeção duplicaria filas rAF/idle, listeners e pontes de eventos.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — `inject-anti-hibernation.test.js` lê o fonte para o guard, mas o comportamento é simulado; não carrega este arquivo real.

### Linha 0005

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **IIFE e guard de idempotência**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — `inject-anti-hibernation.test.js` lê o fonte para o guard, mas o comportamento é simulado; não carrega este arquivo real.

### Linha 0006

**Fonte:** `// 0. Guarda de Isolamento: Executar apenas se for aba de tradução`  
**O que faz:** Comentário do fonte registra: “0. Guarda de Isolamento: Executar apenas se for aba de tradução”.  
**Como faz:** Documenta intenção ou limitação da unidade **Gate da aba de tradução** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0007

**Fonte:** `const isTranslatorTab = window.location.href.includes('mangatranslator') \|\|`  
**O que faz:** Declara `isTranslatorTab` usando `const`; a expressão é `const isTranslatorTab = window.location.href.includes('mangatranslator') \|\|`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Gate da aba de tradução**.  
**Por que assim:** O manifest injeta também em páginas Gemini/loopback; o marker impede anti-throttling em abas não pertencentes ao job.  
**Risco/alternativa:** Ativar indiscriminadamente alteraria o Gemini aberto manualmente; depender só de host não distinguiria tab de automação.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0008

**Fonte:** `sessionStorage.getItem('mangatranslator_tab') === 'true';`  
**O que faz:** Acessa sessionStorage: `sessionStorage.getItem('mangatranslator_tab') === 'true';`.  
**Como faz:** Mantém marker/mode no contexto da aba e origem durante a sessão, sem persistência global da extensão.  
**Por que assim:** O manifest injeta também em páginas Gemini/loopback; o marker impede anti-throttling em abas não pertencentes ao job.  
**Risco/alternativa:** Ativar indiscriminadamente alteraria o Gemini aberto manualmente; depender só de host não distinguiria tab de automação.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0009

**Fonte:** `if (!isTranslatorTab) {`  
**O que faz:** Aplica a guarda `if (!isTranslatorTab) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Gate da aba de tradução**.  
**Por que assim:** O manifest injeta também em páginas Gemini/loopback; o marker impede anti-throttling em abas não pertencentes ao job.  
**Risco/alternativa:** Ativar indiscriminadamente alteraria o Gemini aberto manualmente; depender só de host não distinguiria tab de automação.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0010

**Fonte:** `return;`  
**O que faz:** Encerra este fluxo com `return;`.  
**Como faz:** Evita que as linhas seguintes instalem/continuem a unidade quando o pré-requisito não foi atendido.  
**Por que assim:** O manifest injeta também em páginas Gemini/loopback; o marker impede anti-throttling em abas não pertencentes ao job.  
**Risco/alternativa:** Ativar indiscriminadamente alteraria o Gemini aberto manualmente; depender só de host não distinguiria tab de automação.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0011

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Gate da aba de tradução**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** O manifest injeta também em páginas Gemini/loopback; o marker impede anti-throttling em abas não pertencentes ao job.  
**Risco/alternativa:** Ativar indiscriminadamente alteraria o Gemini aberto manualmente; depender só de host não distinguiria tab de automação.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0012

**Fonte:** `try { sessionStorage.setItem('mangatranslator_tab', 'true'); } catch (e) {}`  
**O que faz:** Acessa sessionStorage: `try { sessionStorage.setItem('mangatranslator_tab', 'true'); } catch (e) {}`.  
**Como faz:** Mantém marker/mode no contexto da aba e origem durante a sessão, sem persistência global da extensão.  
**Por que assim:** O manifest injeta também em páginas Gemini/loopback; o marker impede anti-throttling em abas não pertencentes ao job.  
**Risco/alternativa:** Ativar indiscriminadamente alteraria o Gemini aberto manualmente; depender só de host não distinguiria tab de automação.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0013

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Gate da aba de tradução**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0014

**Fonte:** `// 1. Anti-throttling progressivo.`  
**O que faz:** Comentário do fonte registra: “1. Anti-throttling progressivo.”.  
**Como faz:** Documenta intenção ou limitação da unidade **Gate da aba de tradução** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — O teste verifica a presença do gate; `jobs-lifecycle.js` constrói URLs com `?mangatranslator=true`, que satisfaz o marcador no fluxo real.

### Linha 0015

**Fonte:** `//`  
**O que faz:** Comentário do fonte registra: “”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0016

**Fonte:** `// O modo padrão é minimal: mantém os shims necessários para o Gemini não`  
**O que faz:** Comentário do fonte registra: “O modo padrão é minimal: mantém os shims necessários para o Gemini não”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0017

**Fonte:** `// congelar em background, mas não simula atividade humana nem dispara foco`  
**O que faz:** Comentário do fonte registra: “congelar em background, mas não simula atividade humana nem dispara foco”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0018

**Fonte:** `// continuamente. O content script pode elevar temporariamente para`  
**O que faz:** Comentário do fonte registra: “continuamente. O content script pode elevar temporariamente para”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0019

**Fonte:** `// balanced/legacy quando o modo de execução ou uma segunda tentativa de`  
**O que faz:** Comentário do fonte registra: “balanced/legacy quando o modo de execução ou uma segunda tentativa de”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0020

**Fonte:** `// submit realmente precisar.`  
**O que faz:** Comentário do fonte registra: “submit realmente precisar.”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0021

**Fonte:** `const ANTI_THROTTLE_MODES = new Set(['minimal', 'balanced', 'legacy']);`  
**O que faz:** Declara `ANTI_THROTTLE_MODES` usando `const`; a expressão é `const ANTI_THROTTLE_MODES = new Set(['minimal', 'balanced', 'legacy']);`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0022

**Fonte:** `const RAF_CADENCE_MS = {`  
**O que faz:** Declara `RAF_CADENCE_MS` usando `const`; a expressão é `const RAF_CADENCE_MS = {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0023

**Fonte:** `minimal: 250,`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `minimal: 250,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0024

**Fonte:** `balanced: 100,`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `balanced: 100,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0025

**Fonte:** `legacy: 50,`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `legacy: 50,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0026

**Fonte:** `};`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0027

**Fonte:** `const FOCUS_CADENCE_MS = {`  
**O que faz:** Declara `FOCUS_CADENCE_MS` usando `const`; a expressão é `const FOCUS_CADENCE_MS = {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0028

**Fonte:** `minimal: 0,`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `minimal: 0,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0029

**Fonte:** `balanced: 5000,`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `balanced: 5000,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0030

**Fonte:** `legacy: 1000,`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `legacy: 1000,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0031

**Fonte:** `};`  
**O que faz:** Participa de **Política minimal/balanced/legacy e persistência em sessionStorage** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0032

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0033

**Fonte:** `let antiThrottleMode = 'minimal';`  
**O que faz:** Declara `antiThrottleMode` usando `let`; a expressão é `let antiThrottleMode = 'minimal';`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0034

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0035

**Fonte:** `const storedMode = sessionStorage.getItem('mangaTranslatorAntiThrottleMode');`  
**O que faz:** Declara `storedMode` usando `const`; a expressão é `const storedMode = sessionStorage.getItem('mangaTranslatorAntiThrottleMode');`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0036

**Fonte:** `if (ANTI_THROTTLE_MODES.has(storedMode)) antiThrottleMode = storedMode;`  
**O que faz:** Aplica a guarda `if (ANTI_THROTTLE_MODES.has(storedMode)) antiThrottleMode = storedMode;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0037

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch (_e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Permite gastar menos CPU no baseline e escalar somente quando o modo de execução precisa resistir mais ao throttling.  
**Risco/alternativa:** Um intervalo agressivo permanente aumenta CPU/bateria e interfere com uso manual; sem persistência o modo se perderia em reload da mesma sessão.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0038

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Política minimal/balanced/legacy e persistência em sessionStorage**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0039

**Fonte:** `// Visibilidade permanece falsificada enquanto esta aba é um worker válido.`  
**O que faz:** Comentário do fonte registra: “Visibilidade permanece falsificada enquanto esta aba é um worker válido.”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0040

**Fonte:** `// Isso evita que frameworks da página parem pipelines internos ao receber`  
**O que faz:** Comentário do fonte registra: “Isso evita que frameworks da página parem pipelines internos ao receber”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0041

**Fonte:** `// visibilitychange/blur, sem gerar mousemove sintético.`  
**O que faz:** Comentário do fonte registra: “visibilitychange/blur, sem gerar mousemove sintético.”.  
**Como faz:** Documenta intenção ou limitação da unidade **Política minimal/balanced/legacy e persistência em sessionStorage** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor real — Testes de inject conferem strings/cadências; `job-runner.test.js` prova que o consumidor emite modos minimal/balanced/legacy, mas não prova o listener real deste arquivo.

### Linha 0042

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0043

**Fonte:** `Object.defineProperty(document, 'visibilityState', {`  
**O que faz:** Sobrescreve propriedade DOM via `Object.defineProperty`: `Object.defineProperty(document, 'visibilityState', {`.  
**Como faz:** Substitui o getter nativo no objeto document para que o app enxergue o estado artificial definido pelo anti-throttling.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0044

**Fonte:** `get: () => 'visible',`  
**O que faz:** Participa de **Spoof de visibilidade/foco e supressão de lifecycle** com `get: () => 'visible',`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0045

**Fonte:** `configurable: true`  
**O que faz:** Participa de **Spoof de visibilidade/foco e supressão de lifecycle** com `configurable: true`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0046

**Fonte:** `});`  
**O que faz:** Participa de **Spoof de visibilidade/foco e supressão de lifecycle** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0047

**Fonte:** `Object.defineProperty(document, 'hidden', {`  
**O que faz:** Sobrescreve propriedade DOM via `Object.defineProperty`: `Object.defineProperty(document, 'hidden', {`.  
**Como faz:** Substitui o getter nativo no objeto document para que o app enxergue o estado artificial definido pelo anti-throttling.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0048

**Fonte:** `get: () => false,`  
**O que faz:** Participa de **Spoof de visibilidade/foco e supressão de lifecycle** com `get: () => false,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0049

**Fonte:** `configurable: true`  
**O que faz:** Participa de **Spoof de visibilidade/foco e supressão de lifecycle** com `configurable: true`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0050

**Fonte:** `});`  
**O que faz:** Participa de **Spoof de visibilidade/foco e supressão de lifecycle** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0051

**Fonte:** `if (Document.prototype) Document.prototype.hasFocus = () => true;`  
**O que faz:** Aplica a guarda `if (Document.prototype) Document.prototype.hasFocus = () => true;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0052

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0053

**Fonte:** `document.hasFocus = () => true;`  
**O que faz:** Participa de **Spoof de visibilidade/foco e supressão de lifecycle** com `document.hasFocus = () => true;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0054

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0055

**Fonte:** `const stopProp = e => e.stopImmediatePropagation();`  
**O que faz:** Declara `stopProp` usando `const`; a expressão é `const stopProp = e => e.stopImmediatePropagation();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0056

**Fonte:** `document.addEventListener('visibilitychange', stopProp, true);`  
**O que faz:** Registra listener com `document.addEventListener('visibilitychange', stopProp, true);`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0057

**Fonte:** `window.addEventListener('visibilitychange', stopProp, true);`  
**O que faz:** Registra listener com `window.addEventListener('visibilitychange', stopProp, true);`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0058

**Fonte:** `window.addEventListener('blur', stopProp, true);`  
**O que faz:** Registra listener com `window.addEventListener('blur', stopProp, true);`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0059

**Fonte:** `window.addEventListener('pagehide', stopProp, true);`  
**O que faz:** Registra listener com `window.addEventListener('pagehide', stopProp, true);`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Spoof de visibilidade/foco e supressão de lifecycle**.  
**Por que assim:** Frameworks do Gemini podem pausar trabalho ao observar hidden/blur; o MAIN world permite sobrescrever getters que o isolated world não controla.  
**Risco/alternativa:** Só alterar uma variável da extensão não mudaria o estado que o app Gemini enxerga; porém interceptar lifecycle globalmente é invasivo e exige escopo estrito.  
**Evidência:** evidência complementar/simulação — `visibility-spoof.test.js` e a suíte agregada reproduzem a técnica em JSDOM; não executam `inject.js`.

### Linha 0060

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0061

**Fonte:** `const dispatchFocusEvents = () => {`  
**O que faz:** Declara `dispatchFocusEvents` usando `const`; a expressão é `const dispatchFocusEvents = () => {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0062

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Pulso de foco e escalada periódica**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0063

**Fonte:** `window.dispatchEvent(new Event('focus'));`  
**O que faz:** Publica evento no MAIN world: `window.dispatchEvent(new Event('focus'));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0064

**Fonte:** `document.dispatchEvent(new Event('focus'));`  
**O que faz:** Publica evento no MAIN world: `document.dispatchEvent(new Event('focus'));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0065

**Fonte:** `document.dispatchEvent(new FocusEvent('focusin', {`  
**O que faz:** Publica evento no MAIN world: `document.dispatchEvent(new FocusEvent('focusin', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0066

**Fonte:** `bubbles: true,`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `bubbles: true,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0067

**Fonte:** `composed: true`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `composed: true`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0068

**Fonte:** `}));`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0069

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch (_e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0070

**Fonte:** `};`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0071

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0072

**Fonte:** `let focusIntervalId = null;`  
**O que faz:** Declara `focusIntervalId` usando `let`; a expressão é `let focusIntervalId = null;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0073

**Fonte:** `function refreshFocusEscalation() {`  
**O que faz:** Declara a função `refreshFocusEscalation` em **Pulso de foco e escalada periódica**.  
**Como faz:** Cria um escopo reutilizável para o comportamento iniciado nesta posição e continuado nas linhas seguintes.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0074

**Fonte:** `if (focusIntervalId !== null) {`  
**O que faz:** Aplica a guarda `if (focusIntervalId !== null) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0075

**Fonte:** `clearInterval(focusIntervalId);`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `clearInterval(focusIntervalId);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0076

**Fonte:** `focusIntervalId = null;`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `focusIntervalId = null;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0077

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Pulso de foco e escalada periódica**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0078

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0079

**Fonte:** `const cadence = FOCUS_CADENCE_MS[antiThrottleMode] \|\| 0;`  
**O que faz:** Declara `cadence` usando `const`; a expressão é `const cadence = FOCUS_CADENCE_MS[antiThrottleMode] \|\| 0;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0080

**Fonte:** `if (cadence <= 0) return;`  
**O que faz:** Aplica a guarda `if (cadence <= 0) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0081

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0082

**Fonte:** `focusIntervalId = setInterval(dispatchFocusEvents, cadence);`  
**O que faz:** Agenda trabalho temporizado: `focusIntervalId = setInterval(dispatchFocusEvents, cadence);`.  
**Como faz:** Mantém a cadência definida pelo modo atual e adia o callback sem bloquear a thread.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0083

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Pulso de foco e escalada periódica**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0084

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0085

**Fonte:** `function setAntiThrottleMode(nextMode) {`  
**O que faz:** Declara a função `setAntiThrottleMode` em **Pulso de foco e escalada periódica**.  
**Como faz:** Cria um escopo reutilizável para o comportamento iniciado nesta posição e continuado nas linhas seguintes.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0086

**Fonte:** `const normalized = ANTI_THROTTLE_MODES.has(nextMode)`  
**O que faz:** Declara `normalized` usando `const`; a expressão é `const normalized = ANTI_THROTTLE_MODES.has(nextMode)`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0087

**Fonte:** `? nextMode`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `? nextMode`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0088

**Fonte:** `: 'minimal';`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `: 'minimal';`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0089

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0090

**Fonte:** `antiThrottleMode = normalized;`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `antiThrottleMode = normalized;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0091

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Pulso de foco e escalada periódica**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0092

**Fonte:** `sessionStorage.setItem(`  
**O que faz:** Acessa sessionStorage: `sessionStorage.setItem(`.  
**Como faz:** Mantém marker/mode no contexto da aba e origem durante a sessão, sem persistência global da extensão.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0093

**Fonte:** `'mangaTranslatorAntiThrottleMode',`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `'mangaTranslatorAntiThrottleMode',`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0094

**Fonte:** `antiThrottleMode`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `antiThrottleMode`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0095

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Pulso de foco e escalada periódica**: `);`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0096

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch (_e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0097

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0098

**Fonte:** `refreshFocusEscalation();`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `refreshFocusEscalation();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0099

**Fonte:** `dispatchFocusEvents();`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `dispatchFocusEvents();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0100

**Fonte:** `return antiThrottleMode;`  
**O que faz:** Encerra este fluxo com `return antiThrottleMode;`.  
**Como faz:** Evita que as linhas seguintes instalem/continuem a unidade quando o pré-requisito não foi atendido.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0101

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Pulso de foco e escalada periódica**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0102

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0103

**Fonte:** `// Pulso inicial único. Não existe mais loop de foco permanente no baseline.`  
**O que faz:** Comentário do fonte registra: “Pulso inicial único. Não existe mais loop de foco permanente no baseline.”.  
**Como faz:** Documenta intenção ou limitação da unidade **Pulso de foco e escalada periódica** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0104

**Fonte:** `dispatchFocusEvents();`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `dispatchFocusEvents();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0105

**Fonte:** `if (document.readyState === 'loading') {`  
**O que faz:** Aplica a guarda `if (document.readyState === 'loading') {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0106

**Fonte:** `document.addEventListener('DOMContentLoaded', dispatchFocusEvents, {`  
**O que faz:** Registra listener com `document.addEventListener('DOMContentLoaded', dispatchFocusEvents, {`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Pulso de foco e escalada periódica**.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0107

**Fonte:** `once: true`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `once: true`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0108

**Fonte:** `});`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0109

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Pulso de foco e escalada periódica**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0110

**Fonte:** `refreshFocusEscalation();`  
**O que faz:** Participa de **Pulso de foco e escalada periódica** com `refreshFocusEscalation();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Minimal evita foco periódico; balanced/legacy adicionam pulsos apenas durante condições mais propensas a throttling/submit falho.  
**Risco/alternativa:** Foco sintético a cada segundo em todos os casos pode disparar handlers da página, gastar CPU e alterar UX.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0111

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Pulso de foco e escalada periódica**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — A política de cadência é verificada como texto e o runner prova o evento de mudança de modo; não há assertion do timer real deste arquivo.

### Linha 0112

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', event => {`  
**O que faz:** Registra listener com `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', event => {`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **API/eventos públicos de anti-throttle**.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0113

**Fonte:** `const requestedMode = event.detail && event.detail.mode;`  
**O que faz:** Declara `requestedMode` usando `const`; a expressão é `const requestedMode = event.detail && event.detail.mode;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **API/eventos públicos de anti-throttle**.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0114

**Fonte:** `setAntiThrottleMode(requestedMode);`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `setAntiThrottleMode(requestedMode);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0115

**Fonte:** `});`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0116

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **API/eventos públicos de anti-throttle**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0117

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_PULSE', () => {`  
**O que faz:** Registra listener com `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_PULSE', () => {`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **API/eventos públicos de anti-throttle**.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0118

**Fonte:** `dispatchFocusEvents();`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `dispatchFocusEvents();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0119

**Fonte:** `});`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0120

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **API/eventos públicos de anti-throttle**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0121

**Fonte:** `window.__mangaTranslatorAntiThrottle = {`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `window.__mangaTranslatorAntiThrottle = {`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0122

**Fonte:** `getMode: () => antiThrottleMode,`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `getMode: () => antiThrottleMode,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0123

**Fonte:** `setMode: setAntiThrottleMode,`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `setMode: setAntiThrottleMode,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0124

**Fonte:** `pulse: dispatchFocusEvents,`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `pulse: dispatchFocusEvents,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0125

**Fonte:** `};`  
**O que faz:** Participa de **API/eventos públicos de anti-throttle** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** CustomEvent é a ponte permitida entre isolated world e MAIN world para ajustar shims da página.  
**Risco/alternativa:** Acoplamento direto entre mundos não existe; expor uma API mais ampla aumentaria superfície acessível ao JavaScript da página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0126

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **API/eventos públicos de anti-throttle**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` prova emissão de `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE`; nenhuma suíte comprova que este listener real recebeu e aplicou o evento.

### Linha 0127

**Fonte:** `// 2. requestAnimationFrame progressivo.`  
**O que faz:** Comentário do fonte registra: “2. requestAnimationFrame progressivo.”.  
**Como faz:** Documenta intenção ou limitação da unidade **requestAnimationFrame híbrido com fallback progressivo** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0128

**Fonte:** `// Em vez de acordar a fila a cada 50ms para sempre, o próximo flush usa a`  
**O que faz:** Comentário do fonte registra: “Em vez de acordar a fila a cada 50ms para sempre, o próximo flush usa a”.  
**Como faz:** Documenta intenção ou limitação da unidade **requestAnimationFrame híbrido com fallback progressivo** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0129

**Fonte:** `// cadência do nível atual. Uma escalada passa a valer no tick seguinte.`  
**O que faz:** Comentário do fonte registra: “cadência do nível atual. Uma escalada passa a valer no tick seguinte.”.  
**Como faz:** Documenta intenção ou limitação da unidade **requestAnimationFrame híbrido com fallback progressivo** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0130

**Fonte:** `let nextRafId = 1;`  
**O que faz:** Declara `nextRafId` usando `let`; a expressão é `let nextRafId = 1;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0131

**Fonte:** `const rafCallbacks = new Map();`  
**O que faz:** Declara `rafCallbacks` usando `const`; a expressão é `const rafCallbacks = new Map();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0132

**Fonte:** `const origRaf = typeof window.requestAnimationFrame === 'function'`  
**O que faz:** Declara `origRaf` usando `const`; a expressão é `const origRaf = typeof window.requestAnimationFrame === 'function'`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0133

**Fonte:** `? window.requestAnimationFrame.bind(window)`  
**O que faz:** Manipula API de scheduling com `? window.requestAnimationFrame.bind(window)`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0134

**Fonte:** `: null;`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `: null;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0135

**Fonte:** `const origCancelRaf = typeof window.cancelAnimationFrame === 'function'`  
**O que faz:** Declara `origCancelRaf` usando `const`; a expressão é `const origCancelRaf = typeof window.cancelAnimationFrame === 'function'`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0136

**Fonte:** `? window.cancelAnimationFrame.bind(window)`  
**O que faz:** Manipula API de scheduling com `? window.cancelAnimationFrame.bind(window)`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0137

**Fonte:** `: null;`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `: null;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0138

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0139

**Fonte:** `window.requestAnimationFrame = function(cb) {`  
**O que faz:** Manipula API de scheduling com `window.requestAnimationFrame = function(cb) {`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0140

**Fonte:** `const id = nextRafId++;`  
**O que faz:** Declara `id` usando `const`; a expressão é `const id = nextRafId++;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0141

**Fonte:** `rafCallbacks.set(id, cb);`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `rafCallbacks.set(id, cb);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0142

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0143

**Fonte:** `if (origRaf && document.visibilityState === 'visible') {`  
**O que faz:** Aplica a guarda `if (origRaf && document.visibilityState === 'visible') {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0144

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0145

**Fonte:** `origRaf(now => {`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `origRaf(now => {`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0146

**Fonte:** `if (!rafCallbacks.has(id)) return;`  
**O que faz:** Aplica a guarda `if (!rafCallbacks.has(id)) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0147

**Fonte:** `rafCallbacks.delete(id);`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `rafCallbacks.delete(id);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0148

**Fonte:** `try { cb(now); } catch(_e) {}`  
**O que faz:** Abre região protegida por `try` em **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0149

**Fonte:** `});`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0150

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(_e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0151

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **requestAnimationFrame híbrido com fallback progressivo**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0152

**Fonte:** `return id;`  
**O que faz:** Encerra este fluxo com `return id;`.  
**Como faz:** Evita que as linhas seguintes instalem/continuem a unidade quando o pré-requisito não foi atendido.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0153

**Fonte:** `};`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0154

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0155

**Fonte:** `window.cancelAnimationFrame = function(id) {`  
**O que faz:** Manipula API de scheduling com `window.cancelAnimationFrame = function(id) {`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0156

**Fonte:** `rafCallbacks.delete(id);`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `rafCallbacks.delete(id);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0157

**Fonte:** `if (origCancelRaf) {`  
**O que faz:** Aplica a guarda `if (origCancelRaf) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0158

**Fonte:** `try { origCancelRaf(id); } catch (_e) {}`  
**O que faz:** Abre região protegida por `try` em **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0159

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **requestAnimationFrame híbrido com fallback progressivo**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0160

**Fonte:** `};`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0161

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0162

**Fonte:** `const flushRaf = () => {`  
**O que faz:** Declara `flushRaf` usando `const`; a expressão é `const flushRaf = () => {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0163

**Fonte:** `if (rafCallbacks.size === 0) return;`  
**O que faz:** Aplica a guarda `if (rafCallbacks.size === 0) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0164

**Fonte:** `const entries = Array.from(rafCallbacks.entries());`  
**O que faz:** Declara `entries` usando `const`; a expressão é `const entries = Array.from(rafCallbacks.entries());`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0165

**Fonte:** `rafCallbacks.clear();`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `rafCallbacks.clear();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0166

**Fonte:** `const now = performance.now();`  
**O que faz:** Declara `now` usando `const`; a expressão é `const now = performance.now();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0167

**Fonte:** `for (const [, cb] of entries) {`  
**O que faz:** Inicia iteração em **requestAnimationFrame híbrido com fallback progressivo** com `for (const [, cb] of entries) {`.  
**Como faz:** Percorre candidatos/nós/callbacks e aplica o corpo associado a cada item enquanto preserva seus guards.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0168

**Fonte:** `try { cb(now); } catch(_e) {}`  
**O que faz:** Abre região protegida por `try` em **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0169

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **requestAnimationFrame híbrido com fallback progressivo**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0170

**Fonte:** `};`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0171

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0172

**Fonte:** `let rafFlushTimer = null;`  
**O que faz:** Declara `rafFlushTimer` usando `let`; a expressão é `let rafFlushTimer = null;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0173

**Fonte:** `function scheduleRafFlush() {`  
**O que faz:** Declara a função `scheduleRafFlush` em **requestAnimationFrame híbrido com fallback progressivo**.  
**Como faz:** Cria um escopo reutilizável para o comportamento iniciado nesta posição e continuado nas linhas seguintes.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0174

**Fonte:** `const cadence = RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`  
**O que faz:** Declara `cadence` usando `const`; a expressão é `const cadence = RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestAnimationFrame híbrido com fallback progressivo**.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0175

**Fonte:** `rafFlushTimer = setTimeout(() => {`  
**O que faz:** Agenda trabalho temporizado: `rafFlushTimer = setTimeout(() => {`.  
**Como faz:** Mantém a cadência definida pelo modo atual e adia o callback sem bloquear a thread.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0176

**Fonte:** `flushRaf();`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `flushRaf();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0177

**Fonte:** `scheduleRafFlush();`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `scheduleRafFlush();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0178

**Fonte:** `}, cadence);`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `}, cadence);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0179

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **requestAnimationFrame híbrido com fallback progressivo**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0180

**Fonte:** `scheduleRafFlush();`  
**O que faz:** Participa de **requestAnimationFrame híbrido com fallback progressivo** com `scheduleRafFlush();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Preserva rAF nativo quando possível e mantém uma fila drenável por timer quando Chromium suspende frames em background.  
**Risco/alternativa:** Substituir por timer fixo de alta frequência desperdiçaria CPU; depender apenas do rAF nativo pode congelar a automação oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do código real — `raf-replacement.test.js` e parte de `inject-anti-hibernation.test.js` são espelhos desatualizados: falam em setInterval/cancel stub, enquanto produção usa Map + rAF nativo + setTimeout recursivo.

### Linha 0181

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestIdleCallback com deadline adaptativo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0182

**Fonte:** `// 2.1. requestIdleCallback com fallback adaptativo.`  
**O que faz:** Comentário do fonte registra: “2.1. requestIdleCallback com fallback adaptativo.”.  
**Como faz:** Documenta intenção ou limitação da unidade **requestIdleCallback com deadline adaptativo** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0183

**Fonte:** `let nextIdleId = 1;`  
**O que faz:** Declara `nextIdleId` usando `let`; a expressão é `let nextIdleId = 1;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0184

**Fonte:** `const idleCallbacks = new Map();`  
**O que faz:** Declara `idleCallbacks` usando `const`; a expressão é `const idleCallbacks = new Map();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0185

**Fonte:** `const origIdle = typeof window.requestIdleCallback === 'function'`  
**O que faz:** Declara `origIdle` usando `const`; a expressão é `const origIdle = typeof window.requestIdleCallback === 'function'`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0186

**Fonte:** `? window.requestIdleCallback.bind(window)`  
**O que faz:** Manipula API de scheduling com `? window.requestIdleCallback.bind(window)`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0187

**Fonte:** `: null;`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `: null;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0188

**Fonte:** `const origCancelIdle = typeof window.cancelIdleCallback === 'function'`  
**O que faz:** Declara `origCancelIdle` usando `const`; a expressão é `const origCancelIdle = typeof window.cancelIdleCallback === 'function'`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0189

**Fonte:** `? window.cancelIdleCallback.bind(window)`  
**O que faz:** Manipula API de scheduling com `? window.cancelIdleCallback.bind(window)`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0190

**Fonte:** `: null;`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `: null;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0191

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestIdleCallback com deadline adaptativo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0192

**Fonte:** `window.requestIdleCallback = function(cb, options) {`  
**O que faz:** Manipula API de scheduling com `window.requestIdleCallback = function(cb, options) {`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0193

**Fonte:** `const id = nextIdleId++;`  
**O que faz:** Declara `id` usando `const`; a expressão é `const id = nextIdleId++;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0194

**Fonte:** `let executed = false;`  
**O que faz:** Declara `executed` usando `let`; a expressão é `let executed = false;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0195

**Fonte:** `const modeBudget = RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`  
**O que faz:** Declara `modeBudget` usando `const`; a expressão é `const modeBudget = RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0196

**Fonte:** `const requestedTimeout =`  
**O que faz:** Declara `requestedTimeout` usando `const`; a expressão é `const requestedTimeout =`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0197

**Fonte:** `options && typeof options.timeout === 'number'`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `options && typeof options.timeout === 'number'`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0198

**Fonte:** `? options.timeout`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `? options.timeout`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0199

**Fonte:** `: modeBudget;`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `: modeBudget;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0200

**Fonte:** `const maxWait = Math.min(requestedTimeout, modeBudget);`  
**O que faz:** Declara `maxWait` usando `const`; a expressão é `const maxWait = Math.min(requestedTimeout, modeBudget);`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0201

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestIdleCallback com deadline adaptativo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0202

**Fonte:** `const timerId = setTimeout(() => {`  
**O que faz:** Declara `timerId` usando `const`; a expressão é `const timerId = setTimeout(() => {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0203

**Fonte:** `if (executed) return;`  
**O que faz:** Aplica a guarda `if (executed) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0204

**Fonte:** `executed = true;`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `executed = true;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0205

**Fonte:** `idleCallbacks.delete(id);`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `idleCallbacks.delete(id);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0206

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **requestIdleCallback com deadline adaptativo**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0207

**Fonte:** `cb({`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `cb({`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0208

**Fonte:** `didTimeout: true,`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `didTimeout: true,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0209

**Fonte:** `timeRemaining: () => Math.max(`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `timeRemaining: () => Math.max(`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0210

**Fonte:** `0,`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `0,`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0211

**Fonte:** `modeBudget - (performance.now() % modeBudget)`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `modeBudget - (performance.now() % modeBudget)`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0212

**Fonte:** `)`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **requestIdleCallback com deadline adaptativo**: `)`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0213

**Fonte:** `});`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0214

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(_e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0215

**Fonte:** `}, maxWait);`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `}, maxWait);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0216

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestIdleCallback com deadline adaptativo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0217

**Fonte:** `idleCallbacks.set(id, timerId);`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `idleCallbacks.set(id, timerId);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0218

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestIdleCallback com deadline adaptativo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0219

**Fonte:** `if (origIdle && document.visibilityState === 'visible') {`  
**O que faz:** Aplica a guarda `if (origIdle && document.visibilityState === 'visible') {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0220

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **requestIdleCallback com deadline adaptativo**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0221

**Fonte:** `origIdle(deadline => {`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `origIdle(deadline => {`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0222

**Fonte:** `if (executed) return;`  
**O que faz:** Aplica a guarda `if (executed) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0223

**Fonte:** `executed = true;`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `executed = true;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0224

**Fonte:** `clearTimeout(timerId);`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `clearTimeout(timerId);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0225

**Fonte:** `idleCallbacks.delete(id);`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `idleCallbacks.delete(id);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0226

**Fonte:** `try { cb(deadline); } catch(_e) {}`  
**O que faz:** Abre região protegida por `try` em **requestIdleCallback com deadline adaptativo**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0227

**Fonte:** `}, options);`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `}, options);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0228

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(_e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0229

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **requestIdleCallback com deadline adaptativo**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0230

**Fonte:** `return id;`  
**O que faz:** Encerra este fluxo com `return id;`.  
**Como faz:** Evita que as linhas seguintes instalem/continuem a unidade quando o pré-requisito não foi atendido.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0231

**Fonte:** `};`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0232

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **requestIdleCallback com deadline adaptativo**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0233

**Fonte:** `window.cancelIdleCallback = function(id) {`  
**O que faz:** Manipula API de scheduling com `window.cancelIdleCallback = function(id) {`.  
**Como faz:** Substitui ou referencia a primitiva nativa para compor o fallback anti-throttling progressivo.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0234

**Fonte:** `if (idleCallbacks.has(id)) {`  
**O que faz:** Aplica a guarda `if (idleCallbacks.has(id)) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0235

**Fonte:** `clearTimeout(idleCallbacks.get(id));`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `clearTimeout(idleCallbacks.get(id));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0236

**Fonte:** `idleCallbacks.delete(id);`  
**O que faz:** Participa de **requestIdleCallback com deadline adaptativo** com `idleCallbacks.delete(id);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0237

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **requestIdleCallback com deadline adaptativo**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0238

**Fonte:** `if (origCancelIdle) {`  
**O que faz:** Aplica a guarda `if (origCancelIdle) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **requestIdleCallback com deadline adaptativo**.  
**Por que assim:** Fornece fallback temporizado para callbacks ociosos que poderiam nunca rodar em aba throttled, respeitando o orçamento do modo atual.  
**Risco/alternativa:** Sem fallback, tarefas internas baseadas em idle podem ficar bloqueadas; um timeout ilimitado contrariaria a política progressiva.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não há teste que execute esta implementação real; a suíte agregada apenas declara cobertura conceitual.

### Linha 0239

**Fonte:** `try { origCancelIdle(id); } catch (_e) {}`  
**O que faz:** Abre região protegida por `try` em **AudioContext silencioso após gesto confiável**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0240

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **AudioContext silencioso após gesto confiável**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0241

**Fonte:** `};`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0242

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **AudioContext silencioso após gesto confiável**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0243

**Fonte:** `// 3. Audio silencioso apenas após gesto real do usuário.`  
**O que faz:** Comentário do fonte registra: “3. Audio silencioso apenas após gesto real do usuário.”.  
**Como faz:** Documenta intenção ou limitação da unidade **AudioContext silencioso após gesto confiável** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0244

**Fonte:** `let audioContextAtivo = false;`  
**O que faz:** Declara `audioContextAtivo` usando `let`; a expressão é `let audioContextAtivo = false;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0245

**Fonte:** `const activateAudio = e => {`  
**O que faz:** Declara `activateAudio` usando `const`; a expressão é `const activateAudio = e => {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0246

**Fonte:** `if (audioContextAtivo \|\| (e && !e.isTrusted)) return;`  
**O que faz:** Aplica a guarda `if (audioContextAtivo \|\| (e && !e.isTrusted)) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0247

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **AudioContext silencioso após gesto confiável**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0248

**Fonte:** `const ctx = new (window.AudioContext \|\| window.webkitAudioContext)();`  
**O que faz:** Declara `ctx` usando `const`; a expressão é `const ctx = new (window.AudioContext \|\| window.webkitAudioContext)();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0249

**Fonte:** `if (ctx.state === 'suspended') ctx.resume();`  
**O que faz:** Aplica a guarda `if (ctx.state === 'suspended') ctx.resume();`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0250

**Fonte:** `const osc = ctx.createOscillator();`  
**O que faz:** Declara `osc` usando `const`; a expressão é `const osc = ctx.createOscillator();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0251

**Fonte:** `const gain = ctx.createGain();`  
**O que faz:** Declara `gain` usando `const`; a expressão é `const gain = ctx.createGain();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0252

**Fonte:** `gain.gain.value = 0;`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `gain.gain.value = 0;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0253

**Fonte:** `osc.connect(gain);`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `osc.connect(gain);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0254

**Fonte:** `gain.connect(ctx.destination);`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `gain.connect(ctx.destination);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0255

**Fonte:** `osc.start();`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `osc.start();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0256

**Fonte:** `audioContextAtivo = true;`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `audioContextAtivo = true;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0257

**Fonte:** `['click', 'pointerdown', 'keydown'].forEach(evt =>`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `['click', 'pointerdown', 'keydown'].forEach(evt =>`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0258

**Fonte:** `document.removeEventListener(evt, activateAudio, true)`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `document.removeEventListener(evt, activateAudio, true)`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0259

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **AudioContext silencioso após gesto confiável**: `);`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0260

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(_e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0261

**Fonte:** `};`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `};`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0262

**Fonte:** `['click', 'pointerdown', 'keydown'].forEach(evt =>`  
**O que faz:** Participa de **AudioContext silencioso após gesto confiável** com `['click', 'pointerdown', 'keydown'].forEach(evt =>`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0263

**Fonte:** `document.addEventListener(evt, activateAudio, true)`  
**O que faz:** Registra listener com `document.addEventListener(evt, activateAudio, true)`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0264

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **AudioContext silencioso após gesto confiável**: `);`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Só ativa após gesto real para respeitar autoplay policy e manter um contexto da página acordado sem som audível.  
**Risco/alternativa:** Criar áudio antes de gesto pode ser bloqueado; sintetizar gesto não produz `isTrusted`; porém o contexto/oscillator persistente precisa de lifecycle claro.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — Não foi encontrada assertion que carregue o `inject.js` real, dispare evento `isTrusted` e verifique o contexto/oscillator.

### Linha 0265

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Busca profunda Light DOM + Shadow DOM**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0266

**Fonte:** `// Ghost mousemove removido. Atividade sintética aleatória não é necessária`  
**O que faz:** Comentário do fonte registra: “Ghost mousemove removido. Atividade sintética aleatória não é necessária”.  
**Como faz:** Documenta intenção ou limitação da unidade **Busca profunda Light DOM + Shadow DOM** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0267

**Fonte:** `// para manter rAF/idle vivos e pode interferir com menus, tooltips e seleção.`  
**O que faz:** Comentário do fonte registra: “para manter rAF/idle vivos e pode interferir com menus, tooltips e seleção.”.  
**Como faz:** Documenta intenção ou limitação da unidade **Busca profunda Light DOM + Shadow DOM** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0268

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Busca profunda Light DOM + Shadow DOM**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0269

**Fonte:** `// Helper: busca profunda atravessando Shadow Roots`  
**O que faz:** Comentário do fonte registra: “Helper: busca profunda atravessando Shadow Roots”.  
**Como faz:** Documenta intenção ou limitação da unidade **Busca profunda Light DOM + Shadow DOM** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0270

**Fonte:** `function findAllDeep(root, predicate) {`  
**O que faz:** Declara a função `findAllDeep` em **Busca profunda Light DOM + Shadow DOM**.  
**Como faz:** Cria um escopo reutilizável para o comportamento iniciado nesta posição e continuado nas linhas seguintes.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0271

**Fonte:** `const list = [];`  
**O que faz:** Declara `list` usando `const`; a expressão é `const list = [];`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Busca profunda Light DOM + Shadow DOM**.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0272

**Fonte:** `function walk(node) {`  
**O que faz:** Declara a função `walk` em **Busca profunda Light DOM + Shadow DOM**.  
**Como faz:** Cria um escopo reutilizável para o comportamento iniciado nesta posição e continuado nas linhas seguintes.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0273

**Fonte:** `if (!node) return;`  
**O que faz:** Aplica a guarda `if (!node) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Busca profunda Light DOM + Shadow DOM**.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0274

**Fonte:** `if (node.nodeType === Node.ELEMENT_NODE) {`  
**O que faz:** Aplica a guarda `if (node.nodeType === Node.ELEMENT_NODE) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Busca profunda Light DOM + Shadow DOM**.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0275

**Fonte:** `try { if (predicate(node)) list.push(node); } catch(e) {}`  
**O que faz:** Abre região protegida por `try` em **Busca profunda Light DOM + Shadow DOM**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0276

**Fonte:** `try { if (node.shadowRoot) walk(node.shadowRoot); } catch(e) {}`  
**O que faz:** Abre região protegida por `try` em **Busca profunda Light DOM + Shadow DOM**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0277

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Busca profunda Light DOM + Shadow DOM**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0278

**Fonte:** `let child = node.firstChild;`  
**O que faz:** Declara `child` usando `let`; a expressão é `let child = node.firstChild;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Busca profunda Light DOM + Shadow DOM**.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0279

**Fonte:** `while (child) {`  
**O que faz:** Inicia iteração em **Busca profunda Light DOM + Shadow DOM** com `while (child) {`.  
**Como faz:** Percorre candidatos/nós/callbacks e aplica o corpo associado a cada item enquanto preserva seus guards.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0280

**Fonte:** `walk(child);`  
**O que faz:** Participa de **Busca profunda Light DOM + Shadow DOM** com `walk(child);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0281

**Fonte:** `child = child.nextSibling;`  
**O que faz:** Participa de **Busca profunda Light DOM + Shadow DOM** com `child = child.nextSibling;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0282

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Busca profunda Light DOM + Shadow DOM**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0283

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Busca profunda Light DOM + Shadow DOM**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0284

**Fonte:** `walk(root);`  
**O que faz:** Participa de **Busca profunda Light DOM + Shadow DOM** com `walk(root);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0285

**Fonte:** `return list;`  
**O que faz:** Encerra este fluxo com `return list;`.  
**Como faz:** Evita que as linhas seguintes instalem/continuem a unidade quando o pré-requisito não foi atendido.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0286

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Busca profunda Light DOM + Shadow DOM**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** O botão/editor do Gemini pode migrar entre Light DOM e Shadow Roots; fallback MAIN-world precisa atravessar ambos.  
**Risco/alternativa:** `querySelectorAll` simples não enxerga conteúdo encapsulado; varrer toda a árvore em todo momento seria caro, por isso o helper é usado apenas em fallback de envio.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0287

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Busca profunda Light DOM + Shadow DOM**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — Módulos Gemini têm testes próprios de Shadow DOM, mas não há assertion do helper local `findAllDeep` deste arquivo.

### Linha 0288

**Fonte:** `// 5. Ponte entre Isolated World e Main World (Gemini Input / BardChatUi)`  
**O que faz:** Comentário do fonte registra: “5. Ponte entre Isolated World e Main World (Gemini Input / BardChatUi)”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0289

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', (e) => {`  
**O que faz:** Registra listener com `window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', (e) => {`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0290

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0291

**Fonte:** `const text = e.detail && e.detail.prompt;`  
**O que faz:** Declara `text` usando `const`; a expressão é `const text = e.detail && e.detail.prompt;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0292

**Fonte:** `if (!text) return;`  
**O que faz:** Aplica a guarda `if (!text) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0293

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0294

**Fonte:** `const rta = document.querySelector('rich-textarea');`  
**O que faz:** Declara `rta` usando `const`; a expressão é `const rta = document.querySelector('rich-textarea');`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0295

**Fonte:** `const target = (rta && rta.querySelector ? rta.querySelector('[contenteditable="true"], .ql-editor') : null)`  
**O que faz:** Declara `target` usando `const`; a expressão é `const target = (rta && rta.querySelector ? rta.querySelector('[contenteditable="true"], .ql-editor') : null)`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0296

**Fonte:** `\|\| document.querySelector('[contenteditable="true"], .ql-editor');`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `\|\| document.querySelector('[contenteditable="true"], .ql-editor');`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0297

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0298

**Fonte:** `if (!target) return;`  
**O que faz:** Aplica a guarda `if (!target) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0299

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0300

**Fonte:** `// Previne duplicação do prompt se já estiver preenchido com o texto exato`  
**O que faz:** Comentário do fonte registra: “Previne duplicação do prompt se já estiver preenchido com o texto exato”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0301

**Fonte:** `if (target.textContent.trim() === text.trim()) return;`  
**O que faz:** Aplica a guarda `if (target.textContent.trim() === text.trim()) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0302

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0303

**Fonte:** `// 1. Tenta acessar Quill se disponível`  
**O que faz:** Comentário do fonte registra: “1. Tenta acessar Quill se disponível”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0304

**Fonte:** `const q = (target && target.__quill)`  
**O que faz:** Declara `q` usando `const`; a expressão é `const q = (target && target.__quill)`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0305

**Fonte:** `\|\| (rta && rta.__quill)`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `\|\| (rta && rta.__quill)`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0306

**Fonte:** `\|\| (window.Quill && typeof window.Quill.find === 'function' && (window.Quill.find(target) \|\| window.Quill.find(rta)));`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `\|\| (window.Quill && typeof window.Quill.find === 'function' && (window.Quill.find(target) \|\| window.Quill.find(rta)));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0307

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0308

**Fonte:** `if (q) {`  
**O que faz:** Aplica a guarda `if (q) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0309

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0310

**Fonte:** `if (typeof q.setText === 'function') q.setText(text, 'user');`  
**O que faz:** Aplica a guarda `if (typeof q.setText === 'function') q.setText(text, 'user');`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0311

**Fonte:** `if (typeof q.update === 'function') q.update('user');`  
**O que faz:** Aplica a guarda `if (typeof q.update === 'function') q.update('user');`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0312

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0313

**Fonte:** `} else {`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `} else {`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0314

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0315

**Fonte:** `const dt = new DataTransfer();`  
**O que faz:** Declara `dt` usando `const`; a expressão é `const dt = new DataTransfer();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0316

**Fonte:** `dt.setData('text/plain', text);`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `dt.setData('text/plain', text);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0317

**Fonte:** `const safeHtml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');`  
**O que faz:** Declara `safeHtml` usando `const`; a expressão é `const safeHtml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0318

**Fonte:** `dt.setData('text/html', \`<p>${safeHtml}</p>\`);`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `dt.setData('text/html', \`<p>${safeHtml}</p>\`);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0319

**Fonte:** `target.dispatchEvent(new ClipboardEvent('paste', {`  
**O que faz:** Publica evento no MAIN world: `target.dispatchEvent(new ClipboardEvent('paste', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0320

**Fonte:** `bubbles: true, cancelable: true, composed: true, clipboardData: dt`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `bubbles: true, cancelable: true, composed: true, clipboardData: dt`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0321

**Fonte:** `}));`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0322

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0323

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0324

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0325

**Fonte:** `// 2. Garante o elemento de parágrafo no DOM caso vazio`  
**O que faz:** Comentário do fonte registra: “2. Garante o elemento de parágrafo no DOM caso vazio”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0326

**Fonte:** `if ((target.textContent \|\| '').trim().length === 0) {`  
**O que faz:** Aplica a guarda `if ((target.textContent \|\| '').trim().length === 0) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0327

**Fonte:** `const p = document.createElement('p');`  
**O que faz:** Declara `p` usando `const`; a expressão é `const p = document.createElement('p');`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0328

**Fonte:** `p.textContent = text;`  
**O que faz:** Escreve texto no DOM com `p.textContent = text;`.  
**Como faz:** Atualiza conteúdo textual sem interpretar o prompt como markup HTML.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0329

**Fonte:** `if (typeof target.replaceChildren === 'function') {`  
**O que faz:** Aplica a guarda `if (typeof target.replaceChildren === 'function') {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0330

**Fonte:** `target.replaceChildren(p);`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `target.replaceChildren(p);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0331

**Fonte:** `} else {`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `} else {`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0332

**Fonte:** `while (target.firstChild) {`  
**O que faz:** Inicia iteração em **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `while (target.firstChild) {`.  
**Como faz:** Percorre candidatos/nós/callbacks e aplica o corpo associado a cada item enquanto preserva seus guards.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0333

**Fonte:** `target.removeChild(target.firstChild);`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `target.removeChild(target.firstChild);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0334

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0335

**Fonte:** `target.appendChild(p);`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `target.appendChild(p);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0336

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0337

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0338

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0339

**Fonte:** `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`  
**O que faz:** Aplica a guarda `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0340

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0341

**Fonte:** `// 3. Dispara eventos de Input com composed: true`  
**O que faz:** Comentário do fonte registra: “3. Dispara eventos de Input com composed: true”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0342

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0343

**Fonte:** `target.dispatchEvent(new InputEvent('beforeinput', {`  
**O que faz:** Publica evento no MAIN world: `target.dispatchEvent(new InputEvent('beforeinput', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0344

**Fonte:** `bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0345

**Fonte:** `}));`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0346

**Fonte:** `target.dispatchEvent(new InputEvent('input', {`  
**O que faz:** Publica evento no MAIN world: `target.dispatchEvent(new InputEvent('input', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0347

**Fonte:** `bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0348

**Fonte:** `}));`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0349

**Fonte:** `target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));`  
**O que faz:** Publica evento no MAIN world: `target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0350

**Fonte:** `target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));`  
**O que faz:** Publica evento no MAIN world: `target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0351

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0352

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0353

**Fonte:** `if (rta) {`  
**O que faz:** Aplica a guarda `if (rta) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0354

**Fonte:** `try { if ('value' in rta) rta.value = text; } catch(e) {}`  
**O que faz:** Abre região protegida por `try` em **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0355

**Fonte:** `try { rta.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch(e) {}`  
**O que faz:** Publica evento no MAIN world: `try { rta.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch(e) {}`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0356

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0357

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0358

**Fonte:** `console.log("⚡ [inject.js] Prompt injetado com sucesso no modelo do Gemini!");`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `console.log("⚡ [inject.js] Prompt injetado com sucesso no modelo do Gemini!");`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0359

**Fonte:** `} catch(err) {`  
**O que faz:** Captura falha da operação anterior: `} catch(err) {`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0360

**Fonte:** `console.warn("❌ [inject.js] Erro ao injetar prompt:", err);`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `console.warn("❌ [inject.js] Erro ao injetar prompt:", err);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0361

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0362

**Fonte:** `});`  
**O que faz:** Participa de **Ponte MANGA_TRANSLATOR_SET_PROMPT** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Permite que isolated world peça ao contexto da página para interagir com Quill/rich-textarea e emitir eventos que o framework reconhece.  
**Risco/alternativa:** Só atribuir `textContent` pode não atualizar estado interno do editor; usar innerHTML com prompt bruto criaria injeção, por isso o HTML de clipboard é escapado e o fallback usa textContent.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0363

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte MANGA_TRANSLATOR_SET_PROMPT**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0364

**Fonte:** `// A imagem do resultado já está acessível dentro da sessão autenticada do`  
**O que faz:** Comentário do fonte registra: “A imagem do resultado já está acessível dentro da sessão autenticada do”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0365

**Fonte:** `// Gemini. Esta ponte permite que o content script a converta sem abrir uma`  
**O que faz:** Comentário do fonte registra: “Gemini. Esta ponte permite que o content script a converta sem abrir uma”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0366

**Fonte:** `// aba auxiliar e sem usar o fetch anônimo do Service Worker.`  
**O que faz:** Comentário do fonte registra: “aba auxiliar e sem usar o fetch anônimo do Service Worker.”.  
**Como faz:** Documenta intenção ou limitação da unidade **Ponte MANGA_TRANSLATOR_SET_PROMPT** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — `helpers-and-regressions-real.test.js` prova que o runner emite o evento e mantém fallback DOM; o listener MAIN deste arquivo não é carregado pela suíte.

### Linha 0367

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', async (event) => {`  
**O que faz:** Registra listener com `window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', async (event) => {`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0368

**Fonte:** `const detail = event.detail \|\| {};`  
**O que faz:** Declara `detail` usando `const`; a expressão é `const detail = event.detail \|\| {};`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0369

**Fonte:** `if (!detail.requestId \|\| !detail.url) return;`  
**O que faz:** Aplica a guarda `if (!detail.requestId \|\| !detail.url) return;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0370

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0371

**Fonte:** `const response = await fetch(detail.url, { credentials: 'include', cache: 'no-store' });`  
**O que faz:** Declara `response` usando `const`; a expressão é `const response = await fetch(detail.url, { credentials: 'include', cache: 'no-store' });`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0372

**Fonte:** `if (!response.ok) throw new Error(\`HTTP ${response.status}\`);`  
**O que faz:** Aplica a guarda `if (!response.ok) throw new Error(\`HTTP ${response.status}\`);`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0373

**Fonte:** `const blob = await response.blob();`  
**O que faz:** Declara `blob` usando `const`; a expressão é `const blob = await response.blob();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0374

**Fonte:** `if (!blob.type.startsWith('image/')) throw new Error(\`Tipo inválido: ${blob.type \|\| 'desconhecido'}\`);`  
**O que faz:** Aplica a guarda `if (!blob.type.startsWith('image/')) throw new Error(\`Tipo inválido: ${blob.type \|\| 'desconhecido'}\`);`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0375

**Fonte:** `const dataUrl = await new Promise((resolve, reject) => {`  
**O que faz:** Declara `dataUrl` usando `const`; a expressão é `const dataUrl = await new Promise((resolve, reject) => {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0376

**Fonte:** `const reader = new FileReader();`  
**O que faz:** Declara `reader` usando `const`; a expressão é `const reader = new FileReader();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0377

**Fonte:** `reader.onloadend = () => resolve(reader.result);`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `reader.onloadend = () => resolve(reader.result);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0378

**Fonte:** `reader.onerror = () => reject(reader.error \|\| new Error('Falha ao ler imagem'));`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `reader.onerror = () => reject(reader.error \|\| new Error('Falha ao ler imagem'));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0379

**Fonte:** `reader.readAsDataURL(blob);`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `reader.readAsDataURL(blob);`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0380

**Fonte:** `});`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0381

**Fonte:** `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`  
**O que faz:** Publica evento no MAIN world: `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0382

**Fonte:** `detail: { requestId: detail.requestId, dataUrl }`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `detail: { requestId: detail.requestId, dataUrl }`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0383

**Fonte:** `}));`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0384

**Fonte:** `} catch (error) {`  
**O que faz:** Captura falha da operação anterior: `} catch (error) {`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0385

**Fonte:** `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`  
**O que faz:** Publica evento no MAIN world: `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0386

**Fonte:** `detail: { requestId: detail.requestId, error: error && error.message ? error.message : 'Falha ao buscar imagem' }`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `detail: { requestId: detail.requestId, error: error && error.message ? error.message : 'Falha ao buscar imagem' }`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0387

**Fonte:** `}));`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0388

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0389

**Fonte:** `});`  
**O que faz:** Participa de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0390

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0391

**Fonte:** `let _lastTriggerSendTime = 0;`  
**O que faz:** Declara `_lastTriggerSendTime` usando `let`; a expressão é `let _lastTriggerSendTime = 0;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Ponte autenticada MANGA_TRANSLATOR_FETCH_IMAGE**.  
**Por que assim:** Faz o download no contexto autenticado da página Gemini quando canvas/SW não conseguem ler o asset, devolvendo Data URL correlacionada por requestId.  
**Risco/alternativa:** Sem requestId respostas concorrentes poderiam se misturar; aceitar qualquer payload sem checar MIME permitiria devolver conteúdo não-imagem como imagem.  
**Evidência:** 🟨 consumidor/protocolo provado; implementação MAIN não direta — `safe-background-delete.test.js` e `result-extractor.test.js` provam requestId, timeout, erro e fallback usando responders simulados, não este fetch real.

### Linha 0392

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_TRIGGER_SEND', () => {`  
**O que faz:** Registra listener com `window.addEventListener('MANGA_TRANSLATOR_TRIGGER_SEND', () => {`.  
**Como faz:** Conecta um evento do MAIN world/lifecycle à rotina correspondente de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0393

**Fonte:** `const now = Date.now();`  
**O que faz:** Declara `now` usando `const`; a expressão é `const now = Date.now();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0394

**Fonte:** `if (now - _lastTriggerSendTime < 3000) return; // Debounce de 3s para evitar envios duplicados`  
**O que faz:** Aplica a guarda `if (now - _lastTriggerSendTime < 3000) return; // Debounce de 3s para evitar envios duplicados`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0395

**Fonte:** `_lastTriggerSendTime = now;`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `_lastTriggerSendTime = now;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0396

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0397

**Fonte:** `window.dispatchEvent(new Event('focus'));`  
**O que faz:** Publica evento no MAIN world: `window.dispatchEvent(new Event('focus'));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0398

**Fonte:** `document.dispatchEvent(new Event('focus'));`  
**O que faz:** Publica evento no MAIN world: `document.dispatchEvent(new Event('focus'));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0399

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0400

**Fonte:** `// 1. Dispara Enter no container e editores`  
**O que faz:** Comentário do fonte registra: “1. Dispara Enter no container e editores”.  
**Como faz:** Documenta intenção ou limitação da unidade **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0401

**Fonte:** `const rta = document.querySelector('rich-textarea');`  
**O que faz:** Declara `rta` usando `const`; a expressão é `const rta = document.querySelector('rich-textarea');`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0402

**Fonte:** `if (rta) {`  
**O que faz:** Aplica a guarda `if (rta) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0403

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0404

**Fonte:** `rta.dispatchEvent(new KeyboardEvent('keydown', {`  
**O que faz:** Publica evento no MAIN world: `rta.dispatchEvent(new KeyboardEvent('keydown', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0405

**Fonte:** `bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0406

**Fonte:** `}));`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0407

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0408

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0409

**Fonte:** `const targets = findAllDeep(document.body, el => el.getAttribute && (el.getAttribute('contenteditable') === 'true' \|\| (el.className && typeof el.className === 'string' && el.className.includes('ql-editor'))));`  
**O que faz:** Declara `targets` usando `const`; a expressão é `const targets = findAllDeep(document.body, el => el.getAttribute && (el.getAttribute('contenteditable') === 'true' \|\| (el.className && typeof el…`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0410

**Fonte:** `for (const target of targets) {`  
**O que faz:** Inicia iteração em **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `for (const target of targets) {`.  
**Como faz:** Percorre candidatos/nós/callbacks e aplica o corpo associado a cada item enquanto preserva seus guards.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0411

**Fonte:** `try {`  
**O que faz:** Abre região protegida por `try` em **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** As operações seguintes podem falhar por diferenças de API/DOM; o catch correspondente degrada sem abortar a automação inteira.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0412

**Fonte:** `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`  
**O que faz:** Aplica a guarda `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0413

**Fonte:** `target.dispatchEvent(new KeyboardEvent('keydown', {`  
**O que faz:** Publica evento no MAIN world: `target.dispatchEvent(new KeyboardEvent('keydown', {`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0414

**Fonte:** `bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0415

**Fonte:** `}));`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `}));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0416

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(e) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0417

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0418

**Fonte:** ``  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0419

**Fonte:** `// 2. Busca profunda por botões de envio em Light DOM e Shadow Roots`  
**O que faz:** Comentário do fonte registra: “2. Busca profunda por botões de envio em Light DOM e Shadow Roots”.  
**Como faz:** Documenta intenção ou limitação da unidade **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** sem produzir efeito em runtime.  
**Por que assim:** Neste arquivo comentários são relevantes porque vários shims são deliberadamente invasivos e precisam explicar escopo/custo.  
**Risco/alternativa:** Sem o contexto, uma manutenção pode reintroduzir loops agressivos ou remover guards necessários.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0420

**Fonte:** `const allButtons = findAllDeep(document.body, el => {`  
**O que faz:** Declara `allButtons` usando `const`; a expressão é `const allButtons = findAllDeep(document.body, el => {`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0421

**Fonte:** `if (!el \|\| el.nodeType !== Node.ELEMENT_NODE) return false;`  
**O que faz:** Aplica a guarda `if (!el \|\| el.nodeType !== Node.ELEMENT_NODE) return false;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0422

**Fonte:** `const tag = el.tagName.toLowerCase();`  
**O que faz:** Declara `tag` usando `const`; a expressão é `const tag = el.tagName.toLowerCase();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0423

**Fonte:** `const role = (el.getAttribute('role') \|\| '').toLowerCase();`  
**O que faz:** Declara `role` usando `const`; a expressão é `const role = (el.getAttribute('role') \|\| '').toLowerCase();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0424

**Fonte:** `return tag === 'button' \|\| role === 'button' \|\| tag.includes('button') \|\| tag === 'mat-icon-button';`  
**O que faz:** Encerra este fluxo com `return tag === 'button' \|\| role === 'button' \|\| tag.includes('button') \|\| tag === 'mat-icon-button';`.  
**Como faz:** Evita que as linhas seguintes instalem/continuem a unidade quando o pré-requisito não foi atendido.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0425

**Fonte:** `});`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0426

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0427

**Fonte:** `const blacklist = ['feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close', 'fechar', 'dismiss', 'mic', 'microfone', 'voice', 'audio', 'stop'];`  
**O que faz:** Declara `blacklist` usando `const`; a expressão é `const blacklist = ['feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close', 'fechar', 'dismiss', 'mic', 'microfone', 'voice', 'audi…`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0428

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0429

**Fonte:** `for (let i = allButtons.length - 1; i >= 0; i--) {`  
**O que faz:** Inicia iteração em **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `for (let i = allButtons.length - 1; i >= 0; i--) {`.  
**Como faz:** Percorre candidatos/nós/callbacks e aplica o corpo associado a cada item enquanto preserva seus guards.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0430

**Fonte:** `const btn = allButtons[i];`  
**O que faz:** Declara `btn` usando `const`; a expressão é `const btn = allButtons[i];`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0431

**Fonte:** `const label = (btn.getAttribute('aria-label') \|\| '').toLowerCase().trim();`  
**O que faz:** Declara `label` usando `const`; a expressão é `const label = (btn.getAttribute('aria-label') \|\| '').toLowerCase().trim();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0432

**Fonte:** `const tooltip = (btn.getAttribute('mattooltip') \|\| '').toLowerCase().trim();`  
**O que faz:** Declara `tooltip` usando `const`; a expressão é `const tooltip = (btn.getAttribute('mattooltip') \|\| '').toLowerCase().trim();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0433

**Fonte:** `const dataTooltip = (btn.getAttribute('data-tooltip') \|\| '').toLowerCase().trim();`  
**O que faz:** Declara `dataTooltip` usando `const`; a expressão é `const dataTooltip = (btn.getAttribute('data-tooltip') \|\| '').toLowerCase().trim();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0434

**Fonte:** `const testId = (btn.getAttribute('data-test-id') \|\| btn.getAttribute('data-testid') \|\| '').toLowerCase().trim();`  
**O que faz:** Declara `testId` usando `const`; a expressão é `const testId = (btn.getAttribute('data-test-id') \|\| btn.getAttribute('data-testid') \|\| '').toLowerCase().trim();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0435

**Fonte:** `const className = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();`  
**O que faz:** Declara `className` usando `const`; a expressão é `const className = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0436

**Fonte:** `const text = (btn.innerText \|\| btn.textContent \|\| '').toLowerCase().trim();`  
**O que faz:** Declara `text` usando `const`; a expressão é `const text = (btn.innerText \|\| btn.textContent \|\| '').toLowerCase().trim();`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0437

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0438

**Fonte:** `const combined = \`${label} ${tooltip} ${dataTooltip} ${testId} ${className}\`;`  
**O que faz:** Declara `combined` usando `const`; a expressão é `const combined = \`${label} ${tooltip} ${dataTooltip} ${testId} ${className}\`;`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0439

**Fonte:** `if (blacklist.some(b => combined.includes(b))) continue;`  
**O que faz:** Aplica a guarda `if (blacklist.some(b => combined.includes(b))) continue;`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0440

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0441

**Fonte:** `const hasSendIcon = text.includes('arrow_upward') \|\| text.includes('send') \|\|`  
**O que faz:** Declara `hasSendIcon` usando `const`; a expressão é `const hasSendIcon = text.includes('arrow_upward') \|\| text.includes('send') \|\|`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0442

**Fonte:** `!!btn.querySelector('mat-icon, svg, [data-icon-name*="send"], [data-icon-name*="arrow"]');`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `!!btn.querySelector('mat-icon, svg, [data-icon-name*="send"], [data-icon-name*="arrow"]');`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0443

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0444

**Fonte:** `const isSend = label === 'enviar' \|\| label === 'enviar mensagem' \|\| label === 'enviar prompt' \|\| label === 'enviar consulta' \|\|`  
**O que faz:** Declara `isSend` usando `const`; a expressão é `const isSend = label === 'enviar' \|\| label === 'enviar mensagem' \|\| label === 'enviar prompt' \|\| label === 'enviar consulta' \|\|`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0445

**Fonte:** `label === 'send' \|\| label === 'send message' \|\| label === 'send prompt' \|\|`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `label === 'send' \|\| label === 'send message' \|\| label === 'send prompt' \|\|`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0446

**Fonte:** `tooltip === 'enviar' \|\| tooltip === 'enviar mensagem' \|\| tooltip === 'send' \|\|`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `tooltip === 'enviar' \|\| tooltip === 'enviar mensagem' \|\| tooltip === 'send' \|\|`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0447

**Fonte:** `dataTooltip === 'enviar' \|\| dataTooltip === 'send' \|\|`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `dataTooltip === 'enviar' \|\| dataTooltip === 'send' \|\|`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0448

**Fonte:** `testId === 'send-button' \|\| className.includes('send-button') \|\|`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `testId === 'send-button' \|\| className.includes('send-button') \|\|`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0449

**Fonte:** `(hasSendIcon && (label.includes('enviar') \|\| label.includes('send') \|\| label === ''));`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `(hasSendIcon && (label.includes('enviar') \|\| label.includes('send') \|\| label === ''));`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0450

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0451

**Fonte:** `const enabled = btn.disabled !== true &&`  
**O que faz:** Declara `enabled` usando `const`; a expressão é `const enabled = btn.disabled !== true &&`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0452

**Fonte:** `!btn.hasAttribute('disabled') &&`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `!btn.hasAttribute('disabled') &&`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0453

**Fonte:** `btn.getAttribute('aria-disabled') !== 'true';`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `btn.getAttribute('aria-disabled') !== 'true';`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0454

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0455

**Fonte:** `if (isSend && enabled) {`  
**O que faz:** Aplica a guarda `if (isSend && enabled) {`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0456

**Fonte:** `if (typeof btn.focus === 'function') btn.focus();`  
**O que faz:** Aplica a guarda `if (typeof btn.focus === 'function') btn.focus();`.  
**Como faz:** O ramo seguinte só ocorre quando a condição é verdadeira; isso controla side effects globais de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0457

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0458

**Fonte:** `const eventOpts = { bubbles: true, cancelable: true, composed: true, view: window };`  
**O que faz:** Declara `eventOpts` usando `const`; a expressão é `const eventOpts = { bubbles: true, cancelable: true, composed: true, view: window };`.  
**Como faz:** Materializa estado, referência nativa ou parâmetro de política usado pelo bloco **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0459

**Fonte:** `btn.dispatchEvent(new PointerEvent('pointerdown', eventOpts));`  
**O que faz:** Publica evento no MAIN world: `btn.dispatchEvent(new PointerEvent('pointerdown', eventOpts));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0460

**Fonte:** `btn.dispatchEvent(new MouseEvent('mousedown', eventOpts));`  
**O que faz:** Publica evento no MAIN world: `btn.dispatchEvent(new MouseEvent('mousedown', eventOpts));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0461

**Fonte:** `btn.dispatchEvent(new MouseEvent('mouseup', eventOpts));`  
**O que faz:** Publica evento no MAIN world: `btn.dispatchEvent(new MouseEvent('mouseup', eventOpts));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0462

**Fonte:** `btn.dispatchEvent(new PointerEvent('pointerup', eventOpts));`  
**O que faz:** Publica evento no MAIN world: `btn.dispatchEvent(new PointerEvent('pointerup', eventOpts));`.  
**Como faz:** Atravessa a ponte por eventos DOM para que o outro componente observe o estado/dado sem acesso direto entre mundos.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0463

**Fonte:** `btn.click();`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `btn.click();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0464

**Fonte:** `break;`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `break;`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0465

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0466

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática da unidade **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**: `}`.  
**Como faz:** Delimita o escopo ou expressão iniciada nas posições anteriores; não cria contrato independente.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0467

**Fonte:** `} catch(err) {}`  
**O que faz:** Captura falha da operação anterior: `} catch(err) {}`.  
**Como faz:** Impede que incompatibilidade pontual de DOM/API derrube o restante da ponte Main World.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0468

**Fonte:** `});`  
**O que faz:** Participa de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND** com `});`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** Quando APIs/editor normais falham, tenta Enter e por último identifica um botão de envio através de múltiplos sinais, incluindo Shadow DOM.  
**Risco/alternativa:** Um seletor único é frágil diante do Gemini; porém heurística ampla pode clicar elemento errado ou duplicar envio se Enter já submeteu, exigindo teste Main-world real.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0469

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Fallback MANGA_TRANSLATOR_TRIGGER_SEND**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 consumidor provado; ⚠️ implementação MAIN sem prova direta — `rpa-flow.test.js` prova que o fluxo consumidor emite o evento e continua; não executa a busca profunda/cliques deste listener.

### Linha 0470

**Fonte:** `console.log("⚡ Anti-throttling progressivo ativo no Gemini (modo " + antiThrottleMode + ").");`  
**O que faz:** Participa de **Telemetria final e fechamento da IIFE** com `console.log("⚡ Anti-throttling progressivo ativo no Gemini (modo " + antiThrottleMode + ").");`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** O log torna visível o modo inicial em diagnóstico e o fechamento mantém variáveis privadas no escopo da IIFE.  
**Risco/alternativa:** Poluir `window` com todo o estado aumentaria colisões; omitir qualquer diagnóstico torna falhas Main-world difíceis de observar.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — E2E MV3 pode carregar o script via manifest em URLs marcadas, mas não há assertion específica do log final ou fechamento.

### Linha 0471

**Fonte:** `})();`  
**O que faz:** Participa de **Telemetria final e fechamento da IIFE** com `})();`.  
**Como faz:** A expressão usa os identificadores visíveis no próprio bloco para alterar estado, DOM, scheduling ou protocolo de eventos conforme indicado pela linha.  
**Por que assim:** O log torna visível o modo inicial em diagnóstico e o fechamento mantém variáveis privadas no escopo da IIFE.  
**Risco/alternativa:** Poluir `window` com todo o estado aumentaria colisões; omitir qualquer diagnóstico torna falhas Main-world difíceis de observar.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — E2E MV3 pode carregar o script via manifest em URLs marcadas, mas não há assertion específica do log final ou fechamento.

### Linha 0472

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Telemetria final e fechamento da IIFE**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — E2E MV3 pode carregar o script via manifest em URLs marcadas, mas não há assertion específica do log final ou fechamento.

### Linha 0473

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Posição vazia que separa responsabilidades dentro de **Telemetria final e fechamento da IIFE**.  
**Como faz:** Não cria bytecode ou side effect; mantém a fronteira editorial do bloco.  
**Por que assim:** A separação ajuda a revisar um arquivo que altera APIs globais e mantém a numeração física rastreável.  
**Risco/alternativa:** Removê-la não muda o runtime, mas alteraria a correspondência posicional desta Bíblia.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — E2E MV3 pode carregar o script via manifest em URLs marcadas, mas não há assertion específica do log final ou fechamento.


## 15. Checklist de revisão antes da conclusão

- [x] Fonte integral materializada.
- [x] SHA reservado coincide com o fonte atual.
- [x] 473/473 posições documentadas em ordem.
- [x] Manifest, background builder, consumers e testes cruzados.
- [x] Simulações/gates separados de prova direta.
- [x] Divergências de testes desatualizados registradas.
- [x] Segurança, lifecycle, scheduling e trust boundaries analisados.
- [x] Lacunas e invariantes explícitos.
- [ ] Releitura do blob gravado e validação mecânica final.
- [ ] Conclusão atômica em STATUS/CHECKLIST/AUDITORIA/PR sob PROGRESS lock.

# Bíblia técnica — `extension/content/inject.js`

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
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

Cada posição abaixo corresponde exatamente a `source.split("\n")`. A evidência indicada é conservadora e pertence à unidade funcional; simulações e consumidores não são promovidos a prova direta deste MAIN-world.

### Linha 0001

**Fonte:** `// inject.js — Manga Translator (Anti-throttling progressivo)`  
**O que faz:** Documenta no próprio fonte: “inject.js — Manga Translator (Anti-throttling progressivo)”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **IIFE e guard de idempotência**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — o teste lê o guard no fonte, mas simula o comportamento sem carregar `inject.js`.

### Linha 0002

**Fonte:** `(function() {`  
**O que faz:** Abre uma IIFE que encapsula todo o `inject.js`.  
**Como faz:** Cria escopo privado imediato no MAIN world; somente globals deliberados escapam.  
**Por que assim:** Evita poluir `window` com cada variável interna.  
**Risco/alternativa:** Top-level solto aumentaria colisões com o JavaScript do Gemini.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — o teste lê o guard no fonte, mas simula o comportamento sem carregar `inject.js`.

### Linha 0003

**Fonte:** `if (window.__anti_hibernation_injected) return;`  
**O que faz:** Testa a guarda `if (window.__anti_hibernation_injected) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **IIFE e guard de idempotência** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — o teste lê o guard no fonte, mas simula o comportamento sem carregar `inject.js`.

### Linha 0004

**Fonte:** `window.__anti_hibernation_injected = true;`  
**O que faz:** Atualiza `window.__anti_hibernation_injected` para `true;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **IIFE e guard de idempotência**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — o teste lê o guard no fonte, mas simula o comportamento sem carregar `inject.js`.

### Linha 0005

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **IIFE e guard de idempotência**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + evidência complementar — o teste lê o guard no fonte, mas simula o comportamento sem carregar `inject.js`.

### Linha 0006

**Fonte:** `// 0. Guarda de Isolamento: Executar apenas se for aba de tradução`  
**O que faz:** Documenta no próprio fonte: “0. Guarda de Isolamento: Executar apenas se for aba de tradução”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **gate da aba de tradução**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0007

**Fonte:** `const isTranslatorTab = window.location.href.includes('mangatranslator') \|\|`  
**O que faz:** Inicializa `isTranslatorTab` com `window.location.href.includes('mangatranslator') \|\|`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **gate da aba de tradução**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0008

**Fonte:** `sessionStorage.getItem('mangatranslator_tab') === 'true';`  
**O que faz:** Usa `sessionStorage` em `sessionStorage.getItem('mangatranslator_tab') === 'true';`.  
**Como faz:** Lê/grava marker ou modo por aba/origem durante a sessão.  
**Por que assim:** O estado deve sobreviver reload da aba sem virar preferência global.  
**Risco/alternativa:** `localStorage` persistiria além do job; memória pura sumiria em reload.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0009

**Fonte:** `if (!isTranslatorTab) {`  
**O que faz:** Testa a guarda `if (!isTranslatorTab) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **gate da aba de tradução** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0010

**Fonte:** `return;`  
**O que faz:** Encerra o fluxo atual com `return;`.  
**Como faz:** Evita que o restante do bloco rode neste caso e, quando há expressão, devolve o valor ao caller.  
**Por que assim:** Early return mantém guards de **gate da aba de tradução** simples e impede efeitos tardios.  
**Risco/alternativa:** Continuar após condição terminal poderia instalar shims ou operar em alvo inválido.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0011

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **gate da aba de tradução** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0012

**Fonte:** `try { sessionStorage.setItem('mangatranslator_tab', 'true'); } catch (e) {}`  
**O que faz:** Usa `sessionStorage` em `try { sessionStorage.setItem('mangatranslator_tab', 'true'); } catch (e) {}`.  
**Como faz:** Lê/grava marker ou modo por aba/origem durante a sessão.  
**Por que assim:** O estado deve sobreviver reload da aba sem virar preferência global.  
**Risco/alternativa:** `localStorage` persistiria além do job; memória pura sumiria em reload.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0013

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **gate da aba de tradução**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0014

**Fonte:** `// 1. Anti-throttling progressivo.`  
**O que faz:** Documenta no próprio fonte: “1. Anti-throttling progressivo.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **gate da aba de tradução**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 consumidor — o gate existe no fonte e `jobs-lifecycle.js` acrescenta `mangatranslator=true` aos jobs reais.

### Linha 0015

**Fonte:** `//`  
**O que faz:** Documenta no próprio fonte: “”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0016

**Fonte:** `// O modo padrão é minimal: mantém os shims necessários para o Gemini não`  
**O que faz:** Documenta no próprio fonte: “O modo padrão é minimal: mantém os shims necessários para o Gemini não”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0017

**Fonte:** `// congelar em background, mas não simula atividade humana nem dispara foco`  
**O que faz:** Documenta no próprio fonte: “congelar em background, mas não simula atividade humana nem dispara foco”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0018

**Fonte:** `// continuamente. O content script pode elevar temporariamente para`  
**O que faz:** Documenta no próprio fonte: “continuamente. O content script pode elevar temporariamente para”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0019

**Fonte:** `// balanced/legacy quando o modo de execução ou uma segunda tentativa de`  
**O que faz:** Documenta no próprio fonte: “balanced/legacy quando o modo de execução ou uma segunda tentativa de”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0020

**Fonte:** `// submit realmente precisar.`  
**O que faz:** Documenta no próprio fonte: “submit realmente precisar.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0021

**Fonte:** `const ANTI_THROTTLE_MODES = new Set(['minimal', 'balanced', 'legacy']);`  
**O que faz:** Inicializa `ANTI_THROTTLE_MODES` com `new Set(['minimal', 'balanced', 'legacy']);`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **modos anti-throttle e sessionStorage**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0022

**Fonte:** `const RAF_CADENCE_MS = {`  
**O que faz:** Inicializa `RAF_CADENCE_MS` com `{`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **modos anti-throttle e sessionStorage**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0023

**Fonte:** `minimal: 250,`  
**O que faz:** Define a propriedade/opção `minimal` como `250`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **modos anti-throttle e sessionStorage**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0024

**Fonte:** `balanced: 100,`  
**O que faz:** Define a propriedade/opção `balanced` como `100`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **modos anti-throttle e sessionStorage**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0025

**Fonte:** `legacy: 50,`  
**O que faz:** Define a propriedade/opção `legacy` como `50`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **modos anti-throttle e sessionStorage**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0026

**Fonte:** `};`  
**O que faz:** Fecha o objeto `RAF_CADENCE_MS`.  
**Como faz:** Conclui a tabela que mapeia minimal/balanced/legacy para 250/100/50 ms.  
**Por que assim:** A cadência fica centralizada em uma única tabela consumida pelo scheduler.  
**Risco/alternativa:** Sem fechamento correto a tabela não existiria e o script nem seria sintaticamente válido.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0027

**Fonte:** `const FOCUS_CADENCE_MS = {`  
**O que faz:** Inicializa `FOCUS_CADENCE_MS` com `{`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **modos anti-throttle e sessionStorage**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0028

**Fonte:** `minimal: 0,`  
**O que faz:** Define a propriedade/opção `minimal` como `0`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **modos anti-throttle e sessionStorage**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0029

**Fonte:** `balanced: 5000,`  
**O que faz:** Define a propriedade/opção `balanced` como `5000`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **modos anti-throttle e sessionStorage**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0030

**Fonte:** `legacy: 1000,`  
**O que faz:** Define a propriedade/opção `legacy` como `1000`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **modos anti-throttle e sessionStorage**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0031

**Fonte:** `};`  
**O que faz:** Fecha o objeto `FOCUS_CADENCE_MS`.  
**Como faz:** Conclui o mapa 0/5000/1000 ms usado por `refreshFocusEscalation`.  
**Por que assim:** Mantém a política de foco separada da política de rAF.  
**Risco/alternativa:** Misturar as duas cadências dificultaria ajustar performance sem alterar foco.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0032

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **modos anti-throttle e sessionStorage**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0033

**Fonte:** `let antiThrottleMode = 'minimal';`  
**O que faz:** Inicializa `antiThrottleMode` com `'minimal';`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **modos anti-throttle e sessionStorage**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0034

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0035

**Fonte:** `const storedMode = sessionStorage.getItem('mangaTranslatorAntiThrottleMode');`  
**O que faz:** Inicializa `storedMode` com `sessionStorage.getItem('mangaTranslatorAntiThrottleMode');`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **modos anti-throttle e sessionStorage**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0036

**Fonte:** `if (ANTI_THROTTLE_MODES.has(storedMode)) antiThrottleMode = storedMode;`  
**O que faz:** Testa a guarda `if (ANTI_THROTTLE_MODES.has(storedMode)) antiThrottleMode = storedMode;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **modos anti-throttle e sessionStorage** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0037

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch (_e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0038

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **modos anti-throttle e sessionStorage**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0039

**Fonte:** `// Visibilidade permanece falsificada enquanto esta aba é um worker válido.`  
**O que faz:** Documenta no próprio fonte: “Visibilidade permanece falsificada enquanto esta aba é um worker válido.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0040

**Fonte:** `// Isso evita que frameworks da página parem pipelines internos ao receber`  
**O que faz:** Documenta no próprio fonte: “Isso evita que frameworks da página parem pipelines internos ao receber”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0041

**Fonte:** `// visibilitychange/blur, sem gerar mousemove sintético.`  
**O que faz:** Documenta no próprio fonte: “visibilitychange/blur, sem gerar mousemove sintético.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **modos anti-throttle e sessionStorage**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — cadências/modes são verificadas como texto; runner real prova emissão dos modos, não aplicação aqui.

### Linha 0042

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0043

**Fonte:** `Object.defineProperty(document, 'visibilityState', {`  
**O que faz:** Inicia sobrescrita de propriedade nativa com `Object.defineProperty`.  
**Como faz:** Substitui o getter do `document` no MAIN world usando opções declaradas nas linhas seguintes.  
**Por que assim:** Propriedades read-only de visibility exigem descriptor, não atribuição simples.  
**Risco/alternativa:** Atribuição direta pode falhar ou não afetar o getter lido pelo Gemini.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0044

**Fonte:** `get: () => 'visible',`  
**O que faz:** Define a propriedade/opção `get` como `() => 'visible'`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0045

**Fonte:** `configurable: true`  
**O que faz:** Define a propriedade/opção `configurable` como `true`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0046

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **spoof de visibilidade e supressão de lifecycle** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0047

**Fonte:** `Object.defineProperty(document, 'hidden', {`  
**O que faz:** Inicia sobrescrita de propriedade nativa com `Object.defineProperty`.  
**Como faz:** Substitui o getter do `document` no MAIN world usando opções declaradas nas linhas seguintes.  
**Por que assim:** Propriedades read-only de visibility exigem descriptor, não atribuição simples.  
**Risco/alternativa:** Atribuição direta pode falhar ou não afetar o getter lido pelo Gemini.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0048

**Fonte:** `get: () => false,`  
**O que faz:** Define a propriedade/opção `get` como `() => false`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0049

**Fonte:** `configurable: true`  
**O que faz:** Define a propriedade/opção `configurable` como `true`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0050

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **spoof de visibilidade e supressão de lifecycle** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0051

**Fonte:** `if (Document.prototype) Document.prototype.hasFocus = () => true;`  
**O que faz:** Testa a guarda `if (Document.prototype) Document.prototype.hasFocus = () => true;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **spoof de visibilidade e supressão de lifecycle** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0052

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0053

**Fonte:** `document.hasFocus = () => true;`  
**O que faz:** Atualiza `document.hasFocus` para `() => true;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0054

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **spoof de visibilidade e supressão de lifecycle**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0055

**Fonte:** `const stopProp = e => e.stopImmediatePropagation();`  
**O que faz:** Inicializa `stopProp` com `e => e.stopImmediatePropagation();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0056

**Fonte:** `document.addEventListener('visibilitychange', stopProp, true);`  
**O que faz:** Registra o listener `document.addEventListener('visibilitychange', stopProp, true);`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0057

**Fonte:** `window.addEventListener('visibilitychange', stopProp, true);`  
**O que faz:** Registra o listener `window.addEventListener('visibilitychange', stopProp, true);`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0058

**Fonte:** `window.addEventListener('blur', stopProp, true);`  
**O que faz:** Registra o listener `window.addEventListener('blur', stopProp, true);`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0059

**Fonte:** `window.addEventListener('pagehide', stopProp, true);`  
**O que faz:** Registra o listener `window.addEventListener('pagehide', stopProp, true);`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **spoof de visibilidade e supressão de lifecycle**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** evidência complementar/simulação — JSDOM valida a técnica em espelho, não esta instalação MAIN-world.

### Linha 0060

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0061

**Fonte:** `const dispatchFocusEvents = () => {`  
**O que faz:** Inicializa `dispatchFocusEvents` com `() => {`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **foco sintético e escalada periódica**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0062

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0063

**Fonte:** `window.dispatchEvent(new Event('focus'));`  
**O que faz:** Despacha `window.dispatchEvent(new Event('focus'));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0064

**Fonte:** `document.dispatchEvent(new Event('focus'));`  
**O que faz:** Despacha `document.dispatchEvent(new Event('focus'));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0065

**Fonte:** `document.dispatchEvent(new FocusEvent('focusin', {`  
**O que faz:** Despacha `document.dispatchEvent(new FocusEvent('focusin', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0066

**Fonte:** `bubbles: true,`  
**O que faz:** Define a propriedade/opção `bubbles` como `true`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **foco sintético e escalada periódica**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0067

**Fonte:** `composed: true`  
**O que faz:** Define a propriedade/opção `composed` como `true`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **foco sintético e escalada periódica**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0068

**Fonte:** `}));`  
**O que faz:** Fecha o `FocusEvent('focusin', ...)` e a chamada `document.dispatchEvent`.  
**Como faz:** Finaliza o objeto de opções com `bubbles/composed` e entrega o focusin ao document.  
**Por que assim:** O focusin precisa atravessar a árvore para alcançar handlers do app.  
**Risco/alternativa:** Evento não bubbling/composed pode não alcançar listeners do Gemini.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0069

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch (_e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0070

**Fonte:** `};`  
**O que faz:** Fecha a arrow function `dispatchFocusEvents`.  
**Como faz:** Termina a rotina que emite focus em window, document e focusin em sequência.  
**Por que assim:** Agrupar os três eventos garante que todos os pulsos usem o mesmo conjunto.  
**Risco/alternativa:** Duplicar essa sequência em cada caller aumentaria divergência.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0071

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0072

**Fonte:** `let focusIntervalId = null;`  
**O que faz:** Inicializa `focusIntervalId` com `null;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **foco sintético e escalada periódica**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0073

**Fonte:** `function refreshFocusEscalation() {`  
**O que faz:** Declara `refreshFocusEscalation` dentro de **foco sintético e escalada periódica**.  
**Como faz:** O corpo seguinte implementa a rotina reutilizável associada a esse nome.  
**Por que assim:** A função mantém a política do bloco centralizada.  
**Risco/alternativa:** Duplicar o corpo nos callers aumentaria divergência.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0074

**Fonte:** `if (focusIntervalId !== null) {`  
**O que faz:** Testa a guarda `if (focusIntervalId !== null) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **foco sintético e escalada periódica** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0075

**Fonte:** `clearInterval(focusIntervalId);`  
**O que faz:** Cancela o timer indicado por `clearInterval(focusIntervalId);`.  
**Como faz:** Impede que uma agenda antiga permaneça ativa após mudança/cancelamento.  
**Por que assim:** **foco sintético e escalada periódica** precisa ter no máximo a agenda lógica corrente.  
**Risco/alternativa:** Timer órfão causaria callbacks duplicados e retenção.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0076

**Fonte:** `focusIntervalId = null;`  
**O que faz:** Atualiza `focusIntervalId` para `null;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **foco sintético e escalada periódica**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0077

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **foco sintético e escalada periódica** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0078

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0079

**Fonte:** `const cadence = FOCUS_CADENCE_MS[antiThrottleMode] \|\| 0;`  
**O que faz:** Inicializa `cadence` com `FOCUS_CADENCE_MS[antiThrottleMode] \|\| 0;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **foco sintético e escalada periódica**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0080

**Fonte:** `if (cadence <= 0) return;`  
**O que faz:** Testa a guarda `if (cadence <= 0) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **foco sintético e escalada periódica** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0081

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0082

**Fonte:** `focusIntervalId = setInterval(dispatchFocusEvents, cadence);`  
**O que faz:** Atualiza `focusIntervalId` para `setInterval(dispatchFocusEvents, cadence);`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **foco sintético e escalada periódica**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0083

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **foco sintético e escalada periódica** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0084

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0085

**Fonte:** `function setAntiThrottleMode(nextMode) {`  
**O que faz:** Declara `setAntiThrottleMode` dentro de **foco sintético e escalada periódica**.  
**Como faz:** O corpo seguinte implementa a rotina reutilizável associada a esse nome.  
**Por que assim:** A função mantém a política do bloco centralizada.  
**Risco/alternativa:** Duplicar o corpo nos callers aumentaria divergência.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0086

**Fonte:** `const normalized = ANTI_THROTTLE_MODES.has(nextMode)`  
**O que faz:** Inicializa `normalized` com `ANTI_THROTTLE_MODES.has(nextMode)`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **foco sintético e escalada periódica**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0087

**Fonte:** `? nextMode`  
**O que faz:** Continua a expressão condicional com `? nextMode`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0088

**Fonte:** `: 'minimal';`  
**O que faz:** Continua a expressão condicional com `: 'minimal';`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0089

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0090

**Fonte:** `antiThrottleMode = normalized;`  
**O que faz:** Atualiza `antiThrottleMode` para `normalized;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **foco sintético e escalada periódica**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0091

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0092

**Fonte:** `sessionStorage.setItem(`  
**O que faz:** Usa `sessionStorage` em `sessionStorage.setItem(`.  
**Como faz:** Lê/grava marker ou modo por aba/origem durante a sessão.  
**Por que assim:** O estado deve sobreviver reload da aba sem virar preferência global.  
**Risco/alternativa:** `localStorage` persistiria além do job; memória pura sumiria em reload.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0093

**Fonte:** `'mangaTranslatorAntiThrottleMode',`  
**O que faz:** Fornece a chave `'mangaTranslatorAntiThrottleMode'` ao `sessionStorage.setItem`.  
**Como faz:** É o primeiro argumento da gravação de modo persistido naquela sessão.  
**Por que assim:** Nome estável permite restaurar a escalada após reload do worker.  
**Risco/alternativa:** Chave variável/inconsistente faria a leitura anterior nunca encontrar o valor.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0094

**Fonte:** `antiThrottleMode`  
**O que faz:** Fornece `antiThrottleMode` como valor persistido no sessionStorage.  
**Como faz:** É o segundo argumento do `setItem`, gravando exatamente o modo já normalizado.  
**Por que assim:** Persistir o valor normalizado evita reintroduzir modos inválidos no reload.  
**Risco/alternativa:** Gravar `nextMode` bruto permitiria valor fora da allowlist.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0095

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática de **foco sintético e escalada periódica** com `);`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0096

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch (_e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0097

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0098

**Fonte:** `refreshFocusEscalation();`  
**O que faz:** Chama `refreshFocusEscalation` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **foco sintético e escalada periódica**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0099

**Fonte:** `dispatchFocusEvents();`  
**O que faz:** Chama `dispatchFocusEvents` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **foco sintético e escalada periódica**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0100

**Fonte:** `return antiThrottleMode;`  
**O que faz:** Encerra o fluxo atual com `return antiThrottleMode;`.  
**Como faz:** Evita que o restante do bloco rode neste caso e, quando há expressão, devolve o valor ao caller.  
**Por que assim:** Early return mantém guards de **foco sintético e escalada periódica** simples e impede efeitos tardios.  
**Risco/alternativa:** Continuar após condição terminal poderia instalar shims ou operar em alvo inválido.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0101

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **foco sintético e escalada periódica** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0102

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0103

**Fonte:** `// Pulso inicial único. Não existe mais loop de foco permanente no baseline.`  
**O que faz:** Documenta no próprio fonte: “Pulso inicial único. Não existe mais loop de foco permanente no baseline.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **foco sintético e escalada periódica**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0104

**Fonte:** `dispatchFocusEvents();`  
**O que faz:** Chama `dispatchFocusEvents` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **foco sintético e escalada periódica**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0105

**Fonte:** `if (document.readyState === 'loading') {`  
**O que faz:** Testa a guarda `if (document.readyState === 'loading') {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **foco sintético e escalada periódica** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0106

**Fonte:** `document.addEventListener('DOMContentLoaded', dispatchFocusEvents, {`  
**O que faz:** Registra o listener `document.addEventListener('DOMContentLoaded', dispatchFocusEvents, {`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **foco sintético e escalada periódica**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0107

**Fonte:** `once: true`  
**O que faz:** Define a propriedade/opção `once` como `true`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **foco sintético e escalada periódica**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0108

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **foco sintético e escalada periódica** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0109

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **foco sintético e escalada periódica** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0110

**Fonte:** `refreshFocusEscalation();`  
**O que faz:** Chama `refreshFocusEscalation` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **foco sintético e escalada periódica**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0111

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **foco sintético e escalada periódica**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟦 GATE ESTÁTICO + 🟨 consumidor — política é verificada estaticamente e o runner prova evento de mudança de modo.

### Linha 0112

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', event => {`  
**O que faz:** Registra o listener `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', event => {`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **API pública de anti-throttle**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0113

**Fonte:** `const requestedMode = event.detail && event.detail.mode;`  
**O que faz:** Inicializa `requestedMode` com `event.detail && event.detail.mode;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **API pública de anti-throttle**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0114

**Fonte:** `setAntiThrottleMode(requestedMode);`  
**O que faz:** Chama `setAntiThrottleMode` com `requestedMode`.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **API pública de anti-throttle**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0115

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **API pública de anti-throttle** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0116

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **API pública de anti-throttle**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0117

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_PULSE', () => {`  
**O que faz:** Registra o listener `window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_PULSE', () => {`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **API pública de anti-throttle**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0118

**Fonte:** `dispatchFocusEvents();`  
**O que faz:** Chama `dispatchFocusEvents` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **API pública de anti-throttle**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0119

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **API pública de anti-throttle** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0120

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **API pública de anti-throttle**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0121

**Fonte:** `window.__mangaTranslatorAntiThrottle = {`  
**O que faz:** Atualiza `window.__mangaTranslatorAntiThrottle` para `{`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **API pública de anti-throttle**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0122

**Fonte:** `getMode: () => antiThrottleMode,`  
**O que faz:** Define a propriedade/opção `getMode` como `() => antiThrottleMode`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **API pública de anti-throttle**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0123

**Fonte:** `setMode: setAntiThrottleMode,`  
**O que faz:** Define a propriedade/opção `setMode` como `setAntiThrottleMode`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **API pública de anti-throttle**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0124

**Fonte:** `pulse: dispatchFocusEvents,`  
**O que faz:** Define a propriedade/opção `pulse` como `dispatchFocusEvents`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **API pública de anti-throttle**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0125

**Fonte:** `};`  
**O que faz:** Fecha o objeto público `window.__mangaTranslatorAntiThrottle`.  
**Como faz:** Conclui a API com `getMode`, `setMode` e `pulse` exposta deliberadamente ao MAIN world.  
**Por que assim:** A API mínima oferece diagnóstico/controle sem expor mapas e timers internos.  
**Risco/alternativa:** Expor estado interno aumentaria acoplamento e possibilidade de corrupção pela página.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0126

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **API pública de anti-throttle**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — runner real emite SET_MODE; listener real deste arquivo não é exercitado diretamente.

### Linha 0127

**Fonte:** `// 2. requestAnimationFrame progressivo.`  
**O que faz:** Documenta no próprio fonte: “2. requestAnimationFrame progressivo.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **rAF híbrido e fallback temporal**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0128

**Fonte:** `// Em vez de acordar a fila a cada 50ms para sempre, o próximo flush usa a`  
**O que faz:** Documenta no próprio fonte: “Em vez de acordar a fila a cada 50ms para sempre, o próximo flush usa a”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **rAF híbrido e fallback temporal**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0129

**Fonte:** `// cadência do nível atual. Uma escalada passa a valer no tick seguinte.`  
**O que faz:** Documenta no próprio fonte: “cadência do nível atual. Uma escalada passa a valer no tick seguinte.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **rAF híbrido e fallback temporal**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0130

**Fonte:** `let nextRafId = 1;`  
**O que faz:** Inicializa `nextRafId` com `1;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0131

**Fonte:** `const rafCallbacks = new Map();`  
**O que faz:** Inicializa `rafCallbacks` com `new Map();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0132

**Fonte:** `const origRaf = typeof window.requestAnimationFrame === 'function'`  
**O que faz:** Inicializa `origRaf` com `typeof window.requestAnimationFrame === 'function'`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0133

**Fonte:** `? window.requestAnimationFrame.bind(window)`  
**O que faz:** Referencia/substitui API de scheduling em `? window.requestAnimationFrame.bind(window)`.  
**Como faz:** Combina a primitiva nativa com estado próprio para fallback/cancelamento.  
**Por que assim:** A aba em background pode suspender frame/idle nativo.  
**Risco/alternativa:** Usar apenas a API nativa pode congelar a automação.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0134

**Fonte:** `: null;`  
**O que faz:** Continua a expressão condicional com `: null;`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0135

**Fonte:** `const origCancelRaf = typeof window.cancelAnimationFrame === 'function'`  
**O que faz:** Inicializa `origCancelRaf` com `typeof window.cancelAnimationFrame === 'function'`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0136

**Fonte:** `? window.cancelAnimationFrame.bind(window)`  
**O que faz:** Referencia/substitui API de scheduling em `? window.cancelAnimationFrame.bind(window)`.  
**Como faz:** Combina a primitiva nativa com estado próprio para fallback/cancelamento.  
**Por que assim:** A aba em background pode suspender frame/idle nativo.  
**Risco/alternativa:** Usar apenas a API nativa pode congelar a automação.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0137

**Fonte:** `: null;`  
**O que faz:** Continua a expressão condicional com `: null;`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0138

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **rAF híbrido e fallback temporal**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0139

**Fonte:** `window.requestAnimationFrame = function(cb) {`  
**O que faz:** Atualiza `window.requestAnimationFrame` para `function(cb) {`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **rAF híbrido e fallback temporal**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0140

**Fonte:** `const id = nextRafId++;`  
**O que faz:** Inicializa `id` com `nextRafId++;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0141

**Fonte:** `rafCallbacks.set(id, cb);`  
**O que faz:** Registra item na fila/mapa com `rafCallbacks.set(id, cb);`.  
**Como faz:** Associa o ID local à callback ou timer para execução/cancelamento posterior.  
**Por que assim:** O Map torna deduplicação e cancelamento O(1) e visíveis.  
**Risco/alternativa:** Array sem IDs exigiria busca e tornaria cancelamento menos preciso.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0142

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **rAF híbrido e fallback temporal**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0143

**Fonte:** `if (origRaf && document.visibilityState === 'visible') {`  
**O que faz:** Testa a guarda `if (origRaf && document.visibilityState === 'visible') {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **rAF híbrido e fallback temporal** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0144

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0145

**Fonte:** `origRaf(now => {`  
**O que faz:** Define callback/arrow expression em `origRaf(now => {`.  
**Como faz:** Empacota o comportamento que será chamado por evento, timer, Promise ou iterador.  
**Por que assim:** Callback local mantém o comportamento junto do gatilho que o consome.  
**Risco/alternativa:** Função global separada aumentaria superfície e dificultaria capturar closures.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0146

**Fonte:** `if (!rafCallbacks.has(id)) return;`  
**O que faz:** Testa a guarda `if (!rafCallbacks.has(id)) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **rAF híbrido e fallback temporal** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0147

**Fonte:** `rafCallbacks.delete(id);`  
**O que faz:** Remove o ID da fila com `rafCallbacks.delete(id);`.  
**Como faz:** Marca a callback como consumida/cancelada antes que outro caminho tente executá-la.  
**Por que assim:** A remoção é a trava contra dupla entrega entre API nativa e fallback.  
**Risco/alternativa:** Manter a entrada permitiria callback duplicado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0148

**Fonte:** `try { cb(now); } catch(_e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0149

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **rAF híbrido e fallback temporal** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0150

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(_e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0151

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **rAF híbrido e fallback temporal** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0152

**Fonte:** `return id;`  
**O que faz:** Encerra o fluxo atual com `return id;`.  
**Como faz:** Evita que o restante do bloco rode neste caso e, quando há expressão, devolve o valor ao caller.  
**Por que assim:** Early return mantém guards de **rAF híbrido e fallback temporal** simples e impede efeitos tardios.  
**Risco/alternativa:** Continuar após condição terminal poderia instalar shims ou operar em alvo inválido.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0153

**Fonte:** `};`  
**O que faz:** Fecha a substituição de `window.requestAnimationFrame`.  
**Como faz:** Termina a função que registra ID/callback, tenta rAF nativo e retorna o ID local.  
**Por que assim:** O override precisa preservar a assinatura pública da API.  
**Risco/alternativa:** Um wrapper sem retorno de ID quebraria callers que cancelam frames.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0154

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **rAF híbrido e fallback temporal**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0155

**Fonte:** `window.cancelAnimationFrame = function(id) {`  
**O que faz:** Atualiza `window.cancelAnimationFrame` para `function(id) {`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **rAF híbrido e fallback temporal**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0156

**Fonte:** `rafCallbacks.delete(id);`  
**O que faz:** Remove o ID da fila com `rafCallbacks.delete(id);`.  
**Como faz:** Marca a callback como consumida/cancelada antes que outro caminho tente executá-la.  
**Por que assim:** A remoção é a trava contra dupla entrega entre API nativa e fallback.  
**Risco/alternativa:** Manter a entrada permitiria callback duplicado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0157

**Fonte:** `if (origCancelRaf) {`  
**O que faz:** Testa a guarda `if (origCancelRaf) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **rAF híbrido e fallback temporal** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0158

**Fonte:** `try { origCancelRaf(id); } catch (_e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0159

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **rAF híbrido e fallback temporal** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0160

**Fonte:** `};`  
**O que faz:** Fecha a substituição de `window.cancelAnimationFrame`.  
**Como faz:** Termina o cancelamento que remove o ID do Map e tenta a API nativa.  
**Por que assim:** O Map é a garantia local de que a callback não será entregue pelo fallback.  
**Risco/alternativa:** Só chamar o cancel nativo não cancelaria a fila sintética.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0161

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **rAF híbrido e fallback temporal**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0162

**Fonte:** `const flushRaf = () => {`  
**O que faz:** Inicializa `flushRaf` com `() => {`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0163

**Fonte:** `if (rafCallbacks.size === 0) return;`  
**O que faz:** Testa a guarda `if (rafCallbacks.size === 0) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **rAF híbrido e fallback temporal** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0164

**Fonte:** `const entries = Array.from(rafCallbacks.entries());`  
**O que faz:** Inicializa `entries` com `Array.from(rafCallbacks.entries());`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0165

**Fonte:** `rafCallbacks.clear();`  
**O que faz:** Esvazia a coleção com `rafCallbacks.clear();`.  
**Como faz:** Depois de copiar o lote, remove todas as callbacks pendentes antes de invocá-las.  
**Por que assim:** Drenagem antes da execução separa o tick atual de novos registros feitos por callbacks.  
**Risco/alternativa:** Limpar depois faria callbacks recém-adicionadas serem perdidas.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0166

**Fonte:** `const now = performance.now();`  
**O que faz:** Inicializa `now` com `performance.now();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0167

**Fonte:** `for (const [, cb] of entries) {`  
**O que faz:** Inicia iteração `for (const [, cb] of entries) {`.  
**Como faz:** Percorre callbacks, nós ou botões enquanto aplica os guards do bloco.  
**Por que assim:** A unidade precisa avaliar todos os candidatos até encontrar/consumir os adequados.  
**Risco/alternativa:** Tratar apenas o primeiro elemento falharia em DOM dinâmico/Shadow DOM.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0168

**Fonte:** `try { cb(now); } catch(_e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0169

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **rAF híbrido e fallback temporal** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0170

**Fonte:** `};`  
**O que faz:** Fecha `flushRaf`.  
**Como faz:** Termina a drenagem que copia o Map, limpa a fila e invoca cada callback com o mesmo timestamp.  
**Por que assim:** Um flush atômico separa callbacks deste tick dos registrados durante sua execução.  
**Risco/alternativa:** Iterar diretamente no Map poderia misturar callbacks novos no tick corrente.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0171

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **rAF híbrido e fallback temporal**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0172

**Fonte:** `let rafFlushTimer = null;`  
**O que faz:** Inicializa `rafFlushTimer` com `null;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0173

**Fonte:** `function scheduleRafFlush() {`  
**O que faz:** Declara `scheduleRafFlush` dentro de **rAF híbrido e fallback temporal**.  
**Como faz:** O corpo seguinte implementa a rotina reutilizável associada a esse nome.  
**Por que assim:** A função mantém a política do bloco centralizada.  
**Risco/alternativa:** Duplicar o corpo nos callers aumentaria divergência.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0174

**Fonte:** `const cadence = RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`  
**O que faz:** Inicializa `cadence` com `RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **rAF híbrido e fallback temporal**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0175

**Fonte:** `rafFlushTimer = setTimeout(() => {`  
**O que faz:** Atualiza `rafFlushTimer` para `setTimeout(() => {`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **rAF híbrido e fallback temporal**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0176

**Fonte:** `flushRaf();`  
**O que faz:** Chama `flushRaf` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **rAF híbrido e fallback temporal**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0177

**Fonte:** `scheduleRafFlush();`  
**O que faz:** Chama `scheduleRafFlush` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **rAF híbrido e fallback temporal**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0178

**Fonte:** `}, cadence);`  
**O que faz:** Fecha o callback de `setTimeout` e passa `cadence` como atraso.  
**Como faz:** Depois de `flushRaf`, agenda recursivamente o próximo ciclo no intervalo do modo atual.  
**Por que assim:** A recursão por setTimeout permite que mudança de modo afete o tick seguinte.  
**Risco/alternativa:** `setInterval` fixo exigiria recriação explícita ao trocar de modo.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0179

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **rAF híbrido e fallback temporal** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0180

**Fonte:** `scheduleRafFlush();`  
**O que faz:** Chama `scheduleRafFlush` com ``.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **rAF híbrido e fallback temporal**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — testes antigos usam espelho setInterval/stub e divergem da implementação Map+setTimeout atual.

### Linha 0181

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **requestIdleCallback adaptativo**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0182

**Fonte:** `// 2.1. requestIdleCallback com fallback adaptativo.`  
**O que faz:** Documenta no próprio fonte: “2.1. requestIdleCallback com fallback adaptativo.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **requestIdleCallback adaptativo**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0183

**Fonte:** `let nextIdleId = 1;`  
**O que faz:** Inicializa `nextIdleId` com `1;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0184

**Fonte:** `const idleCallbacks = new Map();`  
**O que faz:** Inicializa `idleCallbacks` com `new Map();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0185

**Fonte:** `const origIdle = typeof window.requestIdleCallback === 'function'`  
**O que faz:** Inicializa `origIdle` com `typeof window.requestIdleCallback === 'function'`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0186

**Fonte:** `? window.requestIdleCallback.bind(window)`  
**O que faz:** Referencia/substitui API de scheduling em `? window.requestIdleCallback.bind(window)`.  
**Como faz:** Combina a primitiva nativa com estado próprio para fallback/cancelamento.  
**Por que assim:** A aba em background pode suspender frame/idle nativo.  
**Risco/alternativa:** Usar apenas a API nativa pode congelar a automação.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0187

**Fonte:** `: null;`  
**O que faz:** Continua a expressão condicional com `: null;`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0188

**Fonte:** `const origCancelIdle = typeof window.cancelIdleCallback === 'function'`  
**O que faz:** Inicializa `origCancelIdle` com `typeof window.cancelIdleCallback === 'function'`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0189

**Fonte:** `? window.cancelIdleCallback.bind(window)`  
**O que faz:** Referencia/substitui API de scheduling em `? window.cancelIdleCallback.bind(window)`.  
**Como faz:** Combina a primitiva nativa com estado próprio para fallback/cancelamento.  
**Por que assim:** A aba em background pode suspender frame/idle nativo.  
**Risco/alternativa:** Usar apenas a API nativa pode congelar a automação.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0190

**Fonte:** `: null;`  
**O que faz:** Continua a expressão condicional com `: null;`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0191

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **requestIdleCallback adaptativo**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0192

**Fonte:** `window.requestIdleCallback = function(cb, options) {`  
**O que faz:** Atualiza `window.requestIdleCallback` para `function(cb, options) {`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **requestIdleCallback adaptativo**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0193

**Fonte:** `const id = nextIdleId++;`  
**O que faz:** Inicializa `id` com `nextIdleId++;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0194

**Fonte:** `let executed = false;`  
**O que faz:** Inicializa `executed` com `false;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0195

**Fonte:** `const modeBudget = RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`  
**O que faz:** Inicializa `modeBudget` com `RAF_CADENCE_MS[antiThrottleMode] \|\| RAF_CADENCE_MS.minimal;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0196

**Fonte:** `const requestedTimeout =`  
**O que faz:** Inicia a declaração multilinha `requestedTimeout`.  
**Como faz:** A expressão ternária das linhas seguintes decide entre `options.timeout` e o budget do modo.  
**Por que assim:** Separar timeout pedido de `maxWait` permite limitar sem perder a intenção do caller.  
**Risco/alternativa:** Usar diretamente `options.timeout` poderia esperar mais do que a política anti-throttle aceita.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0197

**Fonte:** `options && typeof options.timeout === 'number'`  
**O que faz:** É a condição da ternária que valida `options.timeout` como número.  
**Como faz:** Somente quando `options` existe e `timeout` é numérico a linha seguinte usa o valor fornecido.  
**Por que assim:** Evita ler propriedade ausente e rejeita tipos não numéricos.  
**Risco/alternativa:** Aceitar string/undefined poderia produzir delay inesperado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0198

**Fonte:** `? options.timeout`  
**O que faz:** Continua a expressão condicional com `? options.timeout`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0199

**Fonte:** `: modeBudget;`  
**O que faz:** Continua a expressão condicional com `: modeBudget;`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0200

**Fonte:** `const maxWait = Math.min(requestedTimeout, modeBudget);`  
**O que faz:** Inicializa `maxWait` com `Math.min(requestedTimeout, modeBudget);`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0201

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **requestIdleCallback adaptativo**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0202

**Fonte:** `const timerId = setTimeout(() => {`  
**O que faz:** Inicializa `timerId` com `setTimeout(() => {`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **requestIdleCallback adaptativo**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0203

**Fonte:** `if (executed) return;`  
**O que faz:** Testa a guarda `if (executed) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **requestIdleCallback adaptativo** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0204

**Fonte:** `executed = true;`  
**O que faz:** Atualiza `executed` para `true;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **requestIdleCallback adaptativo**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0205

**Fonte:** `idleCallbacks.delete(id);`  
**O que faz:** Remove o ID da fila com `idleCallbacks.delete(id);`.  
**Como faz:** Marca a callback como consumida/cancelada antes que outro caminho tente executá-la.  
**Por que assim:** A remoção é a trava contra dupla entrega entre API nativa e fallback.  
**Risco/alternativa:** Manter a entrada permitiria callback duplicado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0206

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0207

**Fonte:** `cb({`  
**O que faz:** Invoca a callback idle `cb` com um deadline sintético.  
**Como faz:** Abre o objeto que fornece `didTimeout` e `timeRemaining` ao consumidor.  
**Por que assim:** Callers de `requestIdleCallback` esperam um objeto compatível com `IdleDeadline`.  
**Risco/alternativa:** Chamar sem deadline quebraria código que lê essas propriedades.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0208

**Fonte:** `didTimeout: true,`  
**O que faz:** Define a propriedade/opção `didTimeout` como `true`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **requestIdleCallback adaptativo**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0209

**Fonte:** `timeRemaining: () => Math.max(`  
**O que faz:** Define a propriedade/opção `timeRemaining` como `() => Math.max(`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **requestIdleCallback adaptativo**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0210

**Fonte:** `0,`  
**O que faz:** Passa `0` como limite inferior de `Math.max` no cálculo de `timeRemaining`.  
**Como faz:** Garante que o tempo restante sintético nunca fique negativo.  
**Por que assim:** A API nativa não deve anunciar orçamento negativo.  
**Risco/alternativa:** Valor negativo pode fazer consumers tomarem decisões inválidas.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0211

**Fonte:** `modeBudget - (performance.now() % modeBudget)`  
**O que faz:** Calcula o orçamento restante como `modeBudget - (performance.now() % modeBudget)`.  
**Como faz:** Usa a posição dentro da janela de cadência para estimar tempo até o próximo budget.  
**Por que assim:** Fornece valor variável e não um número fixo arbitrário.  
**Risco/alternativa:** Um valor constante não refletiria a cadência ativa.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0212

**Fonte:** `)`  
**O que faz:** Fecha/continua a estrutura sintática de **requestIdleCallback adaptativo** com `)`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0213

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **requestIdleCallback adaptativo** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0214

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(_e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0215

**Fonte:** `}, maxWait);`  
**O que faz:** Fecha o callback fallback de idle e agenda-o com `maxWait`.  
**Como faz:** O segundo argumento do `setTimeout` limita a espera ao menor entre timeout pedido e budget do modo.  
**Por que assim:** Isso impede que idle fique indefinidamente preso em background.  
**Risco/alternativa:** Usar o maior valor contrariaria a função de fallback anti-throttle.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0216

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **requestIdleCallback adaptativo**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0217

**Fonte:** `idleCallbacks.set(id, timerId);`  
**O que faz:** Registra item na fila/mapa com `idleCallbacks.set(id, timerId);`.  
**Como faz:** Associa o ID local à callback ou timer para execução/cancelamento posterior.  
**Por que assim:** O Map torna deduplicação e cancelamento O(1) e visíveis.  
**Risco/alternativa:** Array sem IDs exigiria busca e tornaria cancelamento menos preciso.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0218

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **requestIdleCallback adaptativo**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0219

**Fonte:** `if (origIdle && document.visibilityState === 'visible') {`  
**O que faz:** Testa a guarda `if (origIdle && document.visibilityState === 'visible') {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **requestIdleCallback adaptativo** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0220

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0221

**Fonte:** `origIdle(deadline => {`  
**O que faz:** Define callback/arrow expression em `origIdle(deadline => {`.  
**Como faz:** Empacota o comportamento que será chamado por evento, timer, Promise ou iterador.  
**Por que assim:** Callback local mantém o comportamento junto do gatilho que o consome.  
**Risco/alternativa:** Função global separada aumentaria superfície e dificultaria capturar closures.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0222

**Fonte:** `if (executed) return;`  
**O que faz:** Testa a guarda `if (executed) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **requestIdleCallback adaptativo** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0223

**Fonte:** `executed = true;`  
**O que faz:** Atualiza `executed` para `true;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **requestIdleCallback adaptativo**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0224

**Fonte:** `clearTimeout(timerId);`  
**O que faz:** Cancela o timer indicado por `clearTimeout(timerId);`.  
**Como faz:** Impede que uma agenda antiga permaneça ativa após mudança/cancelamento.  
**Por que assim:** **requestIdleCallback adaptativo** precisa ter no máximo a agenda lógica corrente.  
**Risco/alternativa:** Timer órfão causaria callbacks duplicados e retenção.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0225

**Fonte:** `idleCallbacks.delete(id);`  
**O que faz:** Remove o ID da fila com `idleCallbacks.delete(id);`.  
**Como faz:** Marca a callback como consumida/cancelada antes que outro caminho tente executá-la.  
**Por que assim:** A remoção é a trava contra dupla entrega entre API nativa e fallback.  
**Risco/alternativa:** Manter a entrada permitiria callback duplicado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0226

**Fonte:** `try { cb(deadline); } catch(_e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0227

**Fonte:** `}, options);`  
**O que faz:** Fecha a callback passada ao `origIdle` e encaminha `options`.  
**Como faz:** A API nativa recebe as mesmas opções que o caller forneceu, enquanto a callback elimina o fallback timer antes de entregar.  
**Por que assim:** Preserva semântica nativa quando o navegador consegue executar idle normalmente.  
**Risco/alternativa:** Ignorar options mudaria timeout/prioridade esperados pelo caller.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0228

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(_e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0229

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **requestIdleCallback adaptativo** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0230

**Fonte:** `return id;`  
**O que faz:** Encerra o fluxo atual com `return id;`.  
**Como faz:** Evita que o restante do bloco rode neste caso e, quando há expressão, devolve o valor ao caller.  
**Por que assim:** Early return mantém guards de **requestIdleCallback adaptativo** simples e impede efeitos tardios.  
**Risco/alternativa:** Continuar após condição terminal poderia instalar shims ou operar em alvo inválido.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0231

**Fonte:** `};`  
**O que faz:** Fecha o override de `window.requestIdleCallback`.  
**Como faz:** Termina a função que combina timer fallback, idle nativo e ID local.  
**Por que assim:** O override mantém interface compatível com callers existentes.  
**Risco/alternativa:** Não devolver o ID local impediria cancelamento pela API substituída.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0232

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **requestIdleCallback adaptativo**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0233

**Fonte:** `window.cancelIdleCallback = function(id) {`  
**O que faz:** Atualiza `window.cancelIdleCallback` para `function(id) {`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **requestIdleCallback adaptativo**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0234

**Fonte:** `if (idleCallbacks.has(id)) {`  
**O que faz:** Testa a guarda `if (idleCallbacks.has(id)) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **requestIdleCallback adaptativo** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0235

**Fonte:** `clearTimeout(idleCallbacks.get(id));`  
**O que faz:** Cancela o timer indicado por `clearTimeout(idleCallbacks.get(id));`.  
**Como faz:** Impede que uma agenda antiga permaneça ativa após mudança/cancelamento.  
**Por que assim:** **requestIdleCallback adaptativo** precisa ter no máximo a agenda lógica corrente.  
**Risco/alternativa:** Timer órfão causaria callbacks duplicados e retenção.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0236

**Fonte:** `idleCallbacks.delete(id);`  
**O que faz:** Remove o ID da fila com `idleCallbacks.delete(id);`.  
**Como faz:** Marca a callback como consumida/cancelada antes que outro caminho tente executá-la.  
**Por que assim:** A remoção é a trava contra dupla entrega entre API nativa e fallback.  
**Risco/alternativa:** Manter a entrada permitiria callback duplicado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0237

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **requestIdleCallback adaptativo** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0238

**Fonte:** `if (origCancelIdle) {`  
**O que faz:** Testa a guarda `if (origCancelIdle) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **requestIdleCallback adaptativo** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há execução direta desta implementação.

### Linha 0239

**Fonte:** `try { origCancelIdle(id); } catch (_e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0240

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **AudioContext silencioso após gesto confiável** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0241

**Fonte:** `};`  
**O que faz:** Fecha o override de `window.cancelIdleCallback`.  
**Como faz:** Termina a rotina que cancela timer do Map e tenta cancelar a callback nativa.  
**Por que assim:** As duas camadas precisam ser tratadas para impedir entrega tardia.  
**Risco/alternativa:** Cancelar só uma camada deixaria a outra capaz de disparar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0242

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **AudioContext silencioso após gesto confiável**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0243

**Fonte:** `// 3. Audio silencioso apenas após gesto real do usuário.`  
**O que faz:** Documenta no próprio fonte: “3. Audio silencioso apenas após gesto real do usuário.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **AudioContext silencioso após gesto confiável**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0244

**Fonte:** `let audioContextAtivo = false;`  
**O que faz:** Inicializa `audioContextAtivo` com `false;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0245

**Fonte:** `const activateAudio = e => {`  
**O que faz:** Inicializa `activateAudio` com `e => {`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0246

**Fonte:** `if (audioContextAtivo \|\| (e && !e.isTrusted)) return;`  
**O que faz:** Testa a guarda `if (audioContextAtivo \|\| (e && !e.isTrusted)) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **AudioContext silencioso após gesto confiável** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0247

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0248

**Fonte:** `const ctx = new (window.AudioContext \|\| window.webkitAudioContext)();`  
**O que faz:** Inicializa `ctx` com `new (window.AudioContext \|\| window.webkitAudioContext)();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0249

**Fonte:** `if (ctx.state === 'suspended') ctx.resume();`  
**O que faz:** Testa a guarda `if (ctx.state === 'suspended') ctx.resume();`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **AudioContext silencioso após gesto confiável** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0250

**Fonte:** `const osc = ctx.createOscillator();`  
**O que faz:** Inicializa `osc` com `ctx.createOscillator();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0251

**Fonte:** `const gain = ctx.createGain();`  
**O que faz:** Inicializa `gain` com `ctx.createGain();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0252

**Fonte:** `gain.gain.value = 0;`  
**O que faz:** Atualiza `gain.gain.value` para `0;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **AudioContext silencioso após gesto confiável**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0253

**Fonte:** `osc.connect(gain);`  
**O que faz:** Conecta nós de áudio com `osc.connect(gain);`.  
**Como faz:** Monta a cadeia oscillator → gain → destination usada pelo contexto silencioso.  
**Por que assim:** O gain zerado mantém o grafo ativo sem som audível.  
**Risco/alternativa:** Oscillator desconectado não manteria o mesmo pipeline de áudio.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0254

**Fonte:** `gain.connect(ctx.destination);`  
**O que faz:** Conecta nós de áudio com `gain.connect(ctx.destination);`.  
**Como faz:** Monta a cadeia oscillator → gain → destination usada pelo contexto silencioso.  
**Por que assim:** O gain zerado mantém o grafo ativo sem som audível.  
**Risco/alternativa:** Oscillator desconectado não manteria o mesmo pipeline de áudio.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0255

**Fonte:** `osc.start();`  
**O que faz:** Inicia a fonte/rotina com `osc.start();`.  
**Como faz:** Ativa o oscillator ou operação explicitamente criada nas linhas anteriores.  
**Por que assim:** O recurso só produz atividade após início explícito.  
**Risco/alternativa:** Criar sem iniciar não produz o efeito anti-hibernação esperado.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0256

**Fonte:** `audioContextAtivo = true;`  
**O que faz:** Atualiza `audioContextAtivo` para `true;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **AudioContext silencioso após gesto confiável**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0257

**Fonte:** `['click', 'pointerdown', 'keydown'].forEach(evt =>`  
**O que faz:** Itera a coleção com `['click', 'pointerdown', 'keydown'].forEach(evt =>`.  
**Como faz:** Aplica a mesma instalação/remoção a cada tipo de evento listado.  
**Por que assim:** A lista explícita evita duplicar três blocos quase idênticos.  
**Risco/alternativa:** Código repetido poderia remover/adicionar conjuntos diferentes por engano.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0258

**Fonte:** `document.removeEventListener(evt, activateAudio, true)`  
**O que faz:** Remove listener com `document.removeEventListener(evt, activateAudio, true)`.  
**Como faz:** Desativa o gatilho depois que ele não é mais necessário, evitando repetição.  
**Por que assim:** Cleanup local reduz retenção e ativações duplicadas.  
**Risco/alternativa:** Deixar listeners de ativação após sucesso produziria trabalho redundante.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0259

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática de **AudioContext silencioso após gesto confiável** com `);`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0260

**Fonte:** `} catch(_e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(_e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0261

**Fonte:** `};`  
**O que faz:** Fecha a função `activateAudio`.  
**Como faz:** Termina a rotina que, após gesto confiável, cria o grafo silencioso e remove os listeners de ativação.  
**Por que assim:** A função deve executar no máximo uma ativação lógica por Document.  
**Risco/alternativa:** Manter listeners depois da ativação causaria chamadas redundantes.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0262

**Fonte:** `['click', 'pointerdown', 'keydown'].forEach(evt =>`  
**O que faz:** Itera a coleção com `['click', 'pointerdown', 'keydown'].forEach(evt =>`.  
**Como faz:** Aplica a mesma instalação/remoção a cada tipo de evento listado.  
**Por que assim:** A lista explícita evita duplicar três blocos quase idênticos.  
**Risco/alternativa:** Código repetido poderia remover/adicionar conjuntos diferentes por engano.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0263

**Fonte:** `document.addEventListener(evt, activateAudio, true)`  
**O que faz:** Registra o listener `document.addEventListener(evt, activateAudio, true)`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **AudioContext silencioso após gesto confiável**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0264

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática de **AudioContext silencioso após gesto confiável** com `);`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhuma suíte gera gesto real `isTrusted` no arquivo MAIN.

### Linha 0265

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **travessia profunda de DOM e Shadow DOM**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0266

**Fonte:** `// Ghost mousemove removido. Atividade sintética aleatória não é necessária`  
**O que faz:** Documenta no próprio fonte: “Ghost mousemove removido. Atividade sintética aleatória não é necessária”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **travessia profunda de DOM e Shadow DOM**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0267

**Fonte:** `// para manter rAF/idle vivos e pode interferir com menus, tooltips e seleção.`  
**O que faz:** Documenta no próprio fonte: “para manter rAF/idle vivos e pode interferir com menus, tooltips e seleção.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **travessia profunda de DOM e Shadow DOM**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0268

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **travessia profunda de DOM e Shadow DOM**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0269

**Fonte:** `// Helper: busca profunda atravessando Shadow Roots`  
**O que faz:** Documenta no próprio fonte: “Helper: busca profunda atravessando Shadow Roots”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **travessia profunda de DOM e Shadow DOM**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0270

**Fonte:** `function findAllDeep(root, predicate) {`  
**O que faz:** Declara `findAllDeep` dentro de **travessia profunda de DOM e Shadow DOM**.  
**Como faz:** O corpo seguinte implementa a rotina reutilizável associada a esse nome.  
**Por que assim:** A função mantém a política do bloco centralizada.  
**Risco/alternativa:** Duplicar o corpo nos callers aumentaria divergência.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0271

**Fonte:** `const list = [];`  
**O que faz:** Inicializa `list` com `[];`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **travessia profunda de DOM e Shadow DOM**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0272

**Fonte:** `function walk(node) {`  
**O que faz:** Declara `walk` dentro de **travessia profunda de DOM e Shadow DOM**.  
**Como faz:** O corpo seguinte implementa a rotina reutilizável associada a esse nome.  
**Por que assim:** A função mantém a política do bloco centralizada.  
**Risco/alternativa:** Duplicar o corpo nos callers aumentaria divergência.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0273

**Fonte:** `if (!node) return;`  
**O que faz:** Testa a guarda `if (!node) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **travessia profunda de DOM e Shadow DOM** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0274

**Fonte:** `if (node.nodeType === Node.ELEMENT_NODE) {`  
**O que faz:** Testa a guarda `if (node.nodeType === Node.ELEMENT_NODE) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **travessia profunda de DOM e Shadow DOM** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0275

**Fonte:** `try { if (predicate(node)) list.push(node); } catch(e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0276

**Fonte:** `try { if (node.shadowRoot) walk(node.shadowRoot); } catch(e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0277

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **travessia profunda de DOM e Shadow DOM** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0278

**Fonte:** `let child = node.firstChild;`  
**O que faz:** Inicializa `child` com `node.firstChild;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **travessia profunda de DOM e Shadow DOM**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0279

**Fonte:** `while (child) {`  
**O que faz:** Inicia iteração `while (child) {`.  
**Como faz:** Percorre callbacks, nós ou botões enquanto aplica os guards do bloco.  
**Por que assim:** A unidade precisa avaliar todos os candidatos até encontrar/consumir os adequados.  
**Risco/alternativa:** Tratar apenas o primeiro elemento falharia em DOM dinâmico/Shadow DOM.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0280

**Fonte:** `walk(child);`  
**O que faz:** Chama `walk` com `child`.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **travessia profunda de DOM e Shadow DOM**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0281

**Fonte:** `child = child.nextSibling;`  
**O que faz:** Atualiza `child` para `child.nextSibling;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **travessia profunda de DOM e Shadow DOM**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0282

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **travessia profunda de DOM e Shadow DOM** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0283

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **travessia profunda de DOM e Shadow DOM** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0284

**Fonte:** `walk(root);`  
**O que faz:** Chama `walk` com `root`.  
**Como faz:** Invoca a operação nomeada usando os argumentos preparados pelas linhas anteriores de **travessia profunda de DOM e Shadow DOM**.  
**Por que assim:** A chamada materializa a etapa do protocolo/DOM descrita pelo próprio identificador.  
**Risco/alternativa:** Omitir a chamada deixaria o estado preparado sem produzir o efeito esperado.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0285

**Fonte:** `return list;`  
**O que faz:** Encerra o fluxo atual com `return list;`.  
**Como faz:** Evita que o restante do bloco rode neste caso e, quando há expressão, devolve o valor ao caller.  
**Por que assim:** Early return mantém guards de **travessia profunda de DOM e Shadow DOM** simples e impede efeitos tardios.  
**Risco/alternativa:** Continuar após condição terminal poderia instalar shims ou operar em alvo inválido.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0286

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **travessia profunda de DOM e Shadow DOM** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0287

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **travessia profunda de DOM e Shadow DOM**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — módulos Gemini testam Shadow DOM, mas não este helper local.

### Linha 0288

**Fonte:** `// 5. Ponte entre Isolated World e Main World (Gemini Input / BardChatUi)`  
**O que faz:** Documenta no próprio fonte: “5. Ponte entre Isolated World e Main World (Gemini Input / BardChatUi)”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0289

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', (e) => {`  
**O que faz:** Registra o listener `window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', (e) => {`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **ponte MAIN de prompt**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0290

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0291

**Fonte:** `const text = e.detail && e.detail.prompt;`  
**O que faz:** Inicializa `text` com `e.detail && e.detail.prompt;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN de prompt**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0292

**Fonte:** `if (!text) return;`  
**O que faz:** Testa a guarda `if (!text) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0293

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0294

**Fonte:** `const rta = document.querySelector('rich-textarea');`  
**O que faz:** Inicializa `rta` com `document.querySelector('rich-textarea');`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN de prompt**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0295

**Fonte:** `const target = (rta && rta.querySelector ? rta.querySelector('[contenteditable="true"], .ql-editor') : null)`  
**O que faz:** Inicializa `target` com `(rta && rta.querySelector ? rta.querySelector('[contenteditable="true"], .ql-editor') : null)`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN de prompt**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0296

**Fonte:** `\|\| document.querySelector('[contenteditable="true"], .ql-editor');`  
**O que faz:** Continua a expressão condicional com `\|\| document.querySelector('[contenteditable="true"], .ql-editor');`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0297

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0298

**Fonte:** `if (!target) return;`  
**O que faz:** Testa a guarda `if (!target) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0299

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0300

**Fonte:** `// Previne duplicação do prompt se já estiver preenchido com o texto exato`  
**O que faz:** Documenta no próprio fonte: “Previne duplicação do prompt se já estiver preenchido com o texto exato”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0301

**Fonte:** `if (target.textContent.trim() === text.trim()) return;`  
**O que faz:** Testa a guarda `if (target.textContent.trim() === text.trim()) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0302

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0303

**Fonte:** `// 1. Tenta acessar Quill se disponível`  
**O que faz:** Documenta no próprio fonte: “1. Tenta acessar Quill se disponível”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0304

**Fonte:** `const q = (target && target.__quill)`  
**O que faz:** Inicializa `q` com `(target && target.__quill)`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN de prompt**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0305

**Fonte:** `\|\| (rta && rta.__quill)`  
**O que faz:** Continua a expressão condicional com `\|\| (rta && rta.__quill)`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0306

**Fonte:** `\|\| (window.Quill && typeof window.Quill.find === 'function' && (window.Quill.find(target) \|\| window.Quill.find(rta)));`  
**O que faz:** Continua a expressão condicional com `\|\| (window.Quill && typeof window.Quill.find === 'function' && (window.Quill.find(target) \|\| window.Quill.find(rta)));`.  
**Como faz:** Esta linha fornece o ramo/fallback lógico da expressão iniciada acima.  
**Por que assim:** A composição escolhe a opção disponível sem duplicar a decisão em vários `if`s.  
**Risco/alternativa:** Separar incorretamente os ramos pode mudar precedência ou selecionar API errada.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0307

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0308

**Fonte:** `if (q) {`  
**O que faz:** Testa a guarda `if (q) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0309

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0310

**Fonte:** `if (typeof q.setText === 'function') q.setText(text, 'user');`  
**O que faz:** Testa a guarda `if (typeof q.setText === 'function') q.setText(text, 'user');`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0311

**Fonte:** `if (typeof q.update === 'function') q.update('user');`  
**O que faz:** Testa a guarda `if (typeof q.update === 'function') q.update('user');`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0312

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0313

**Fonte:** `} else {`  
**O que faz:** Entra no ramo alternativo da condição anterior.  
**Como faz:** Seleciona o fallback quando a estratégia principal de **ponte MAIN de prompt** não se aplica.  
**Por que assim:** A separação preserva degradação controlada entre APIs/DOM disponíveis e ausentes.  
**Risco/alternativa:** Misturar os dois caminhos faria ambos rodarem ou ocultaria o fallback.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0314

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0315

**Fonte:** `const dt = new DataTransfer();`  
**O que faz:** Inicializa `dt` com `new DataTransfer();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN de prompt**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0316

**Fonte:** `dt.setData('text/plain', text);`  
**O que faz:** Preenche o `DataTransfer` com `dt.setData('text/plain', text);`.  
**Como faz:** Constrói payload de clipboard em formato texto/HTML para o evento paste.  
**Por que assim:** Editor rich-text pode depender do formato de clipboard para atualizar seu modelo.  
**Risco/alternativa:** Escrever apenas DOM pode não notificar Quill/framework.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0317

**Fonte:** `const safeHtml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');`  
**O que faz:** Inicializa `safeHtml` com `text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN de prompt**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0318

**Fonte:** `dt.setData('text/html', \`<p>${safeHtml}</p>\`);`  
**O que faz:** Preenche o `DataTransfer` com `dt.setData('text/html', \`<p>${safeHtml}</p>\`);`.  
**Como faz:** Constrói payload de clipboard em formato texto/HTML para o evento paste.  
**Por que assim:** Editor rich-text pode depender do formato de clipboard para atualizar seu modelo.  
**Risco/alternativa:** Escrever apenas DOM pode não notificar Quill/framework.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0319

**Fonte:** `target.dispatchEvent(new ClipboardEvent('paste', {`  
**O que faz:** Despacha `target.dispatchEvent(new ClipboardEvent('paste', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0320

**Fonte:** `bubbles: true, cancelable: true, composed: true, clipboardData: dt`  
**O que faz:** Define a propriedade/opção `bubbles` como `true, cancelable: true, composed: true, clipboardData: dt`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **ponte MAIN de prompt**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0321

**Fonte:** `}));`  
**O que faz:** Fecha o `ClipboardEvent('paste', ...)` e sua entrega ao editor.  
**Como faz:** Conclui o objeto com `clipboardData: dt` e despacha paste bubbling/cancelable/composed.  
**Por que assim:** O editor pode depender do evento de clipboard para atualizar seu modelo interno.  
**Risco/alternativa:** Só mudar DOM pode deixar estado de Quill divergente.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0322

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0323

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN de prompt** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0324

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0325

**Fonte:** `// 2. Garante o elemento de parágrafo no DOM caso vazio`  
**O que faz:** Documenta no próprio fonte: “2. Garante o elemento de parágrafo no DOM caso vazio”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0326

**Fonte:** `if ((target.textContent \|\| '').trim().length === 0) {`  
**O que faz:** Testa a guarda `if ((target.textContent \|\| '').trim().length === 0) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0327

**Fonte:** `const p = document.createElement('p');`  
**O que faz:** Inicializa `p` com `document.createElement('p');`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN de prompt**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0328

**Fonte:** `p.textContent = text;`  
**O que faz:** Atualiza `p.textContent` para `text;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **ponte MAIN de prompt**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0329

**Fonte:** `if (typeof target.replaceChildren === 'function') {`  
**O que faz:** Testa a guarda `if (typeof target.replaceChildren === 'function') {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0330

**Fonte:** `target.replaceChildren(p);`  
**O que faz:** Muta a árvore DOM com `target.replaceChildren(p);`.  
**Como faz:** Adiciona/substitui/remove o nó usado como fallback de prompt.  
**Por que assim:** DOM API com `textContent` mantém o texto do usuário separado de markup.  
**Risco/alternativa:** Concatenar HTML bruto do prompt aumentaria risco de injeção.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0331

**Fonte:** `} else {`  
**O que faz:** Entra no ramo alternativo da condição anterior.  
**Como faz:** Seleciona o fallback quando a estratégia principal de **ponte MAIN de prompt** não se aplica.  
**Por que assim:** A separação preserva degradação controlada entre APIs/DOM disponíveis e ausentes.  
**Risco/alternativa:** Misturar os dois caminhos faria ambos rodarem ou ocultaria o fallback.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0332

**Fonte:** `while (target.firstChild) {`  
**O que faz:** Inicia iteração `while (target.firstChild) {`.  
**Como faz:** Percorre callbacks, nós ou botões enquanto aplica os guards do bloco.  
**Por que assim:** A unidade precisa avaliar todos os candidatos até encontrar/consumir os adequados.  
**Risco/alternativa:** Tratar apenas o primeiro elemento falharia em DOM dinâmico/Shadow DOM.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0333

**Fonte:** `target.removeChild(target.firstChild);`  
**O que faz:** Muta a árvore DOM com `target.removeChild(target.firstChild);`.  
**Como faz:** Adiciona/substitui/remove o nó usado como fallback de prompt.  
**Por que assim:** DOM API com `textContent` mantém o texto do usuário separado de markup.  
**Risco/alternativa:** Concatenar HTML bruto do prompt aumentaria risco de injeção.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0334

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN de prompt** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0335

**Fonte:** `target.appendChild(p);`  
**O que faz:** Muta a árvore DOM com `target.appendChild(p);`.  
**Como faz:** Adiciona/substitui/remove o nó usado como fallback de prompt.  
**Por que assim:** DOM API com `textContent` mantém o texto do usuário separado de markup.  
**Risco/alternativa:** Concatenar HTML bruto do prompt aumentaria risco de injeção.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0336

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN de prompt** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0337

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN de prompt** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0338

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0339

**Fonte:** `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`  
**O que faz:** Testa a guarda `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0340

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0341

**Fonte:** `// 3. Dispara eventos de Input com composed: true`  
**O que faz:** Documenta no próprio fonte: “3. Dispara eventos de Input com composed: true”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0342

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0343

**Fonte:** `target.dispatchEvent(new InputEvent('beforeinput', {`  
**O que faz:** Despacha `target.dispatchEvent(new InputEvent('beforeinput', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0344

**Fonte:** `bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text`  
**O que faz:** Define a propriedade/opção `bubbles` como `true, cancelable: true, composed: true, inputType: 'insertText', data: text`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **ponte MAIN de prompt**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0345

**Fonte:** `}));`  
**O que faz:** Fecha o primeiro `InputEvent`, do tipo `beforeinput`.  
**Como faz:** Conclui as opções `insertText`/`data:text` e despacha a fase anterior à mutação percebida pelo editor.  
**Por que assim:** Frameworks podem observar beforeinput separadamente de input.  
**Risco/alternativa:** Omitir a fase pode reduzir compatibilidade com editores controlados.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0346

**Fonte:** `target.dispatchEvent(new InputEvent('input', {`  
**O que faz:** Despacha `target.dispatchEvent(new InputEvent('input', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0347

**Fonte:** `bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text`  
**O que faz:** Define a propriedade/opção `bubbles` como `true, cancelable: true, composed: true, inputType: 'insertText', data: text`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **ponte MAIN de prompt**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0348

**Fonte:** `}));`  
**O que faz:** Fecha o segundo `InputEvent`, do tipo `input`.  
**Como faz:** Entrega a notificação principal de inserção com o mesmo texto e flags de propagação.  
**Por que assim:** `input` é o sinal padrão de que o conteúdo editável mudou.  
**Risco/alternativa:** Sem ele o framework pode não sincronizar seu state.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0349

**Fonte:** `target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));`  
**O que faz:** Despacha `target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0350

**Fonte:** `target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));`  
**O que faz:** Despacha `target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0351

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0352

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0353

**Fonte:** `if (rta) {`  
**O que faz:** Testa a guarda `if (rta) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN de prompt** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0354

**Fonte:** `try { if ('value' in rta) rta.value = text; } catch(e) {}`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0355

**Fonte:** `try { rta.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch(e) {}`  
**O que faz:** Despacha `try { rta.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch(e) {}`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0356

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN de prompt** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0357

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0358

**Fonte:** `console.log("⚡ [inject.js] Prompt injetado com sucesso no modelo do Gemini!");`  
**O que faz:** Emite diagnóstico `console.log("⚡ [inject.js] Prompt injetado com sucesso no modelo do Gemini!");`.  
**Como faz:** Escreve no console da página para tornar sucesso/falha MAIN-world observável.  
**Por que assim:** Falhas de world/DOM são difíceis de rastrear apenas pelo isolated world.  
**Risco/alternativa:** Sem diagnóstico, regressões da ponte ficam silenciosas.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0359

**Fonte:** `} catch(err) {`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(err) {`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0360

**Fonte:** `console.warn("❌ [inject.js] Erro ao injetar prompt:", err);`  
**O que faz:** Emite diagnóstico `console.warn("❌ [inject.js] Erro ao injetar prompt:", err);`.  
**Como faz:** Escreve no console da página para tornar sucesso/falha MAIN-world observável.  
**Por que assim:** Falhas de world/DOM são difíceis de rastrear apenas pelo isolated world.  
**Risco/alternativa:** Sem diagnóstico, regressões da ponte ficam silenciosas.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0361

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN de prompt** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0362

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN de prompt** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0363

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN de prompt**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0364

**Fonte:** `// A imagem do resultado já está acessível dentro da sessão autenticada do`  
**O que faz:** Documenta no próprio fonte: “A imagem do resultado já está acessível dentro da sessão autenticada do”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0365

**Fonte:** `// Gemini. Esta ponte permite que o content script a converta sem abrir uma`  
**O que faz:** Documenta no próprio fonte: “Gemini. Esta ponte permite que o content script a converta sem abrir uma”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0366

**Fonte:** `// aba auxiliar e sem usar o fetch anônimo do Service Worker.`  
**O que faz:** Documenta no próprio fonte: “aba auxiliar e sem usar o fetch anônimo do Service Worker.”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **ponte MAIN de prompt**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor real + simulação da outra ponta — CG-23/24 prova emissão e fallback do runner; listener real não é carregado.

### Linha 0367

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', async (event) => {`  
**O que faz:** Registra o listener `window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', async (event) => {`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **ponte MAIN autenticada de imagem**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0368

**Fonte:** `const detail = event.detail \|\| {};`  
**O que faz:** Inicializa `detail` com `event.detail \|\| {};`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN autenticada de imagem**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0369

**Fonte:** `if (!detail.requestId \|\| !detail.url) return;`  
**O que faz:** Testa a guarda `if (!detail.requestId \|\| !detail.url) return;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN autenticada de imagem** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0370

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0371

**Fonte:** `const response = await fetch(detail.url, { credentials: 'include', cache: 'no-store' });`  
**O que faz:** Inicializa `response` com `await fetch(detail.url, { credentials: 'include', cache: 'no-store' });`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN autenticada de imagem**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0372

**Fonte:** `if (!response.ok) throw new Error(\`HTTP ${response.status}\`);`  
**O que faz:** Testa a guarda `if (!response.ok) throw new Error(\`HTTP ${response.status}\`);`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN autenticada de imagem** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0373

**Fonte:** `const blob = await response.blob();`  
**O que faz:** Inicializa `blob` com `await response.blob();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN autenticada de imagem**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0374

**Fonte:** `if (!blob.type.startsWith('image/')) throw new Error(\`Tipo inválido: ${blob.type \|\| 'desconhecido'}\`);`  
**O que faz:** Testa a guarda `if (!blob.type.startsWith('image/')) throw new Error(\`Tipo inválido: ${blob.type \|\| 'desconhecido'}\`);`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **ponte MAIN autenticada de imagem** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0375

**Fonte:** `const dataUrl = await new Promise((resolve, reject) => {`  
**O que faz:** Inicializa `dataUrl` com `await new Promise((resolve, reject) => {`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN autenticada de imagem**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0376

**Fonte:** `const reader = new FileReader();`  
**O que faz:** Inicializa `reader` com `new FileReader();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN autenticada de imagem**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0377

**Fonte:** `reader.onloadend = () => resolve(reader.result);`  
**O que faz:** Atualiza `reader.onloadend` para `() => resolve(reader.result);`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **ponte MAIN autenticada de imagem**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0378

**Fonte:** `reader.onerror = () => reject(reader.error \|\| new Error('Falha ao ler imagem'));`  
**O que faz:** Atualiza `reader.onerror` para `() => reject(reader.error \|\| new Error('Falha ao ler imagem'));`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **ponte MAIN autenticada de imagem**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0379

**Fonte:** `reader.readAsDataURL(blob);`  
**O que faz:** Converte o `Blob` em Data URL com `FileReader.readAsDataURL`.  
**Como faz:** A leitura assíncrona alimenta `onloadend`/`onerror` e produz payload transportável por CustomEvent.  
**Por que assim:** Data URL é serializável e reutilizável pelo isolated world.  
**Risco/alternativa:** Repassar Blob entre contratos esperados como string complicaria persistência/IPC.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0380

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN autenticada de imagem** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0381

**Fonte:** `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`  
**O que faz:** Despacha `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0382

**Fonte:** `detail: { requestId: detail.requestId, dataUrl }`  
**O que faz:** Define a propriedade/opção `detail` como `{ requestId: detail.requestId, dataUrl }`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **ponte MAIN autenticada de imagem**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0383

**Fonte:** `}));`  
**O que faz:** Fecha o `CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT')` de sucesso.  
**Como faz:** Finaliza `detail` com `requestId` e `dataUrl` e entrega a resposta ao isolated world.  
**Por que assim:** RequestId correlaciona a resposta certa quando há fetches concorrentes.  
**Risco/alternativa:** Resposta sem correlação poderia satisfazer a requisição errada.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0384

**Fonte:** `} catch (error) {`  
**O que faz:** Captura exceção da tentativa anterior com `} catch (error) {`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0385

**Fonte:** `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`  
**O que faz:** Despacha `window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0386

**Fonte:** `detail: { requestId: detail.requestId, error: error && error.message ? error.message : 'Falha ao buscar imagem' }`  
**O que faz:** Define a propriedade/opção `detail` como `{ requestId: detail.requestId, error: error && error.message ? error.message : 'Falha ao buscar imagem' }`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **ponte MAIN autenticada de imagem**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0387

**Fonte:** `}));`  
**O que faz:** Fecha o `CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT')` de erro.  
**Como faz:** Finaliza `detail` com o mesmo requestId e uma mensagem de erro normalizada.  
**Por que assim:** O consumidor precisa distinguir falha da ausência de resposta/timeout.  
**Risco/alternativa:** Silenciar erro atrasaria fallback e perderia diagnóstico.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0388

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN autenticada de imagem** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0389

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **ponte MAIN autenticada de imagem** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0390

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **ponte MAIN autenticada de imagem**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0391

**Fonte:** `let _lastTriggerSendTime = 0;`  
**O que faz:** Inicializa `_lastTriggerSendTime` com `0;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **ponte MAIN autenticada de imagem**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 protocolo provado; implementação MAIN indireta — requestId/erro/timeout são provados com responder simulado em safe-background-delete/result-extractor.

### Linha 0392

**Fonte:** `window.addEventListener('MANGA_TRANSLATOR_TRIGGER_SEND', () => {`  
**O que faz:** Registra o listener `window.addEventListener('MANGA_TRANSLATOR_TRIGGER_SEND', () => {`.  
**Como faz:** Conecta o evento DOM/lifecycle ao callback que implementa **fallback de submit**.  
**Por que assim:** Eventos são a ponte entre mundos e o mecanismo de lifecycle disponível.  
**Risco/alternativa:** Polling equivalente gastaria CPU e perderia semântica de evento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0393

**Fonte:** `const now = Date.now();`  
**O que faz:** Inicializa `now` com `Date.now();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0394

**Fonte:** `if (now - _lastTriggerSendTime < 3000) return; // Debounce de 3s para evitar envios duplicados`  
**O que faz:** Testa a guarda `if (now - _lastTriggerSendTime < 3000) return; // Debounce de 3s para evitar envios duplicados`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **fallback de submit** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0395

**Fonte:** `_lastTriggerSendTime = now;`  
**O que faz:** Atualiza `_lastTriggerSendTime` para `now;`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **fallback de submit**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0396

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0397

**Fonte:** `window.dispatchEvent(new Event('focus'));`  
**O que faz:** Despacha `window.dispatchEvent(new Event('focus'));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0398

**Fonte:** `document.dispatchEvent(new Event('focus'));`  
**O que faz:** Despacha `document.dispatchEvent(new Event('focus'));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0399

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0400

**Fonte:** `// 1. Dispara Enter no container e editores`  
**O que faz:** Documenta no próprio fonte: “1. Dispara Enter no container e editores”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **fallback de submit**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0401

**Fonte:** `const rta = document.querySelector('rich-textarea');`  
**O que faz:** Inicializa `rta` com `document.querySelector('rich-textarea');`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0402

**Fonte:** `if (rta) {`  
**O que faz:** Testa a guarda `if (rta) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **fallback de submit** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0403

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0404

**Fonte:** `rta.dispatchEvent(new KeyboardEvent('keydown', {`  
**O que faz:** Despacha `rta.dispatchEvent(new KeyboardEvent('keydown', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0405

**Fonte:** `bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`  
**O que faz:** Define a propriedade/opção `bubbles` como `true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **fallback de submit**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0406

**Fonte:** `}));`  
**O que faz:** Fecha o `KeyboardEvent('keydown')` enviado ao `rich-textarea`.  
**Como faz:** Conclui os campos Enter/keyCode/which e despacha o evento no wrapper principal.  
**Por que assim:** Algumas versões do Gemini escutam Enter no wrapper, não no editor interno.  
**Risco/alternativa:** Enviar só no editor profundo pode não iniciar submit.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0407

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0408

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fallback de submit** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0409

**Fonte:** `const targets = findAllDeep(document.body, el => el.getAttribute && (el.getAttribute('contenteditable') === 'true' \|\| (el.className && typeof el.className === 'string' && el.className.includes('ql-editor'))));`  
**O que faz:** Inicializa `targets` com `findAllDeep(document.body, el => el.getAttribute && (el.getAttribute('contenteditable') === 'true' \|\| (el.className && typeo…`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0410

**Fonte:** `for (const target of targets) {`  
**O que faz:** Inicia iteração `for (const target of targets) {`.  
**Como faz:** Percorre callbacks, nós ou botões enquanto aplica os guards do bloco.  
**Por que assim:** A unidade precisa avaliar todos os candidatos até encontrar/consumir os adequados.  
**Risco/alternativa:** Tratar apenas o primeiro elemento falharia em DOM dinâmico/Shadow DOM.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0411

**Fonte:** `try {`  
**O que faz:** Abre `try` para uma operação compatível com múltiplas versões de DOM/API.  
**Como faz:** Erros de uma técnica ficam confinados ao catch e permitem que fallbacks posteriores continuem.  
**Por que assim:** MAIN world muda com o navegador/Gemini; tolerância local evita abortar o job inteiro.  
**Risco/alternativa:** Sem isolamento, uma API ausente derrubaria toda a ponte.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0412

**Fonte:** `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`  
**O que faz:** Testa a guarda `if (typeof target.focus === 'function') target.focus({ preventScroll: true });`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **fallback de submit** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0413

**Fonte:** `target.dispatchEvent(new KeyboardEvent('keydown', {`  
**O que faz:** Despacha `target.dispatchEvent(new KeyboardEvent('keydown', {`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0414

**Fonte:** `bubbles: true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`  
**O que faz:** Define a propriedade/opção `bubbles` como `true, cancelable: true, composed: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13`.  
**Como faz:** Esta linha compõe o objeto/tabela configurado nas linhas vizinhas de **fallback de submit**.  
**Por que assim:** O valor nomeado permite que a API/cadência seja parametrizada de forma explícita.  
**Risco/alternativa:** Valor posicional sem chave seria menos legível e mais sujeito a troca acidental.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0415

**Fonte:** `}));`  
**O que faz:** Fecha o `KeyboardEvent('keydown')` enviado a cada editor profundo.  
**Como faz:** Entrega Enter em cada contenteditable/ql-editor encontrado pelo traversal.  
**Por que assim:** Serve de fallback quando o wrapper não processa Enter.  
**Risco/alternativa:** Não cobrir Shadow/editores internos reduziria robustez após mudanças do DOM.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0416

**Fonte:** `} catch(e) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(e) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0417

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fallback de submit** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0418

**Fonte:** ``  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0419

**Fonte:** `// 2. Busca profunda por botões de envio em Light DOM e Shadow Roots`  
**O que faz:** Documenta no próprio fonte: “2. Busca profunda por botões de envio em Light DOM e Shadow Roots”.  
**Como faz:** É comentário; registra intenção/limitação para as linhas executáveis próximas.  
**Por que assim:** O comentário reduz risco de manutenção contradizer a política de **fallback de submit**.  
**Risco/alternativa:** Código continuaria rodando sem ele, mas a decisão arquitetural ficaria oculta.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0420

**Fonte:** `const allButtons = findAllDeep(document.body, el => {`  
**O que faz:** Inicializa `allButtons` com `findAllDeep(document.body, el => {`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0421

**Fonte:** `if (!el \|\| el.nodeType !== Node.ELEMENT_NODE) return false;`  
**O que faz:** Testa a guarda `if (!el \|\| el.nodeType !== Node.ELEMENT_NODE) return false;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **fallback de submit** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0422

**Fonte:** `const tag = el.tagName.toLowerCase();`  
**O que faz:** Inicializa `tag` com `el.tagName.toLowerCase();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0423

**Fonte:** `const role = (el.getAttribute('role') \|\| '').toLowerCase();`  
**O que faz:** Inicializa `role` com `(el.getAttribute('role') \|\| '').toLowerCase();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0424

**Fonte:** `return tag === 'button' \|\| role === 'button' \|\| tag.includes('button') \|\| tag === 'mat-icon-button';`  
**O que faz:** Encerra o fluxo atual com `return tag === 'button' \|\| role === 'button' \|\| tag.includes('button') \|\| tag === 'mat-icon-button';`.  
**Como faz:** Evita que o restante do bloco rode neste caso e, quando há expressão, devolve o valor ao caller.  
**Por que assim:** Early return mantém guards de **fallback de submit** simples e impede efeitos tardios.  
**Risco/alternativa:** Continuar após condição terminal poderia instalar shims ou operar em alvo inválido.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0425

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **fallback de submit** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0426

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0427

**Fonte:** `const blacklist = ['feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close', 'fechar', 'dismiss', 'mic', 'microfone', 'voice', 'audio', 'stop'];`  
**O que faz:** Inicializa `blacklist` com `['feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close', 'fechar', 'dismiss', 'mic', 'microfone', 'voice', 'au…`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0428

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0429

**Fonte:** `for (let i = allButtons.length - 1; i >= 0; i--) {`  
**O que faz:** Inicia iteração `for (let i = allButtons.length - 1; i >= 0; i--) {`.  
**Como faz:** Percorre callbacks, nós ou botões enquanto aplica os guards do bloco.  
**Por que assim:** A unidade precisa avaliar todos os candidatos até encontrar/consumir os adequados.  
**Risco/alternativa:** Tratar apenas o primeiro elemento falharia em DOM dinâmico/Shadow DOM.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0430

**Fonte:** `const btn = allButtons[i];`  
**O que faz:** Inicializa `btn` com `allButtons[i];`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0431

**Fonte:** `const label = (btn.getAttribute('aria-label') \|\| '').toLowerCase().trim();`  
**O que faz:** Inicializa `label` com `(btn.getAttribute('aria-label') \|\| '').toLowerCase().trim();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0432

**Fonte:** `const tooltip = (btn.getAttribute('mattooltip') \|\| '').toLowerCase().trim();`  
**O que faz:** Inicializa `tooltip` com `(btn.getAttribute('mattooltip') \|\| '').toLowerCase().trim();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0433

**Fonte:** `const dataTooltip = (btn.getAttribute('data-tooltip') \|\| '').toLowerCase().trim();`  
**O que faz:** Inicializa `dataTooltip` com `(btn.getAttribute('data-tooltip') \|\| '').toLowerCase().trim();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0434

**Fonte:** `const testId = (btn.getAttribute('data-test-id') \|\| btn.getAttribute('data-testid') \|\| '').toLowerCase().trim();`  
**O que faz:** Inicializa `testId` com `(btn.getAttribute('data-test-id') \|\| btn.getAttribute('data-testid') \|\| '').toLowerCase().trim();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0435

**Fonte:** `const className = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();`  
**O que faz:** Inicializa `className` com `(typeof btn.className === 'string' ? btn.className : '').toLowerCase();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0436

**Fonte:** `const text = (btn.innerText \|\| btn.textContent \|\| '').toLowerCase().trim();`  
**O que faz:** Inicializa `text` com `(btn.innerText \|\| btn.textContent \|\| '').toLowerCase().trim();`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0437

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0438

**Fonte:** `const combined = \`${label} ${tooltip} ${dataTooltip} ${testId} ${className}\`;`  
**O que faz:** Inicializa `combined` com `\`${label} ${tooltip} ${dataTooltip} ${testId} ${className}\`;`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0439

**Fonte:** `if (blacklist.some(b => combined.includes(b))) continue;`  
**O que faz:** Testa a guarda `if (blacklist.some(b => combined.includes(b))) continue;`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **fallback de submit** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0440

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0441

**Fonte:** `const hasSendIcon = text.includes('arrow_upward') \|\| text.includes('send') \|\|`  
**O que faz:** Inicializa `hasSendIcon` com `text.includes('arrow_upward') \|\| text.includes('send') \|\|`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0442

**Fonte:** `!!btn.querySelector('mat-icon, svg, [data-icon-name*="send"], [data-icon-name*="arrow"]');`  
**O que faz:** Define `hasSendIcon` procurando texto de envio ou elementos `mat-icon/svg/data-icon-name`.  
**Como faz:** A expressão combina indícios textuais e existência de ícone dentro do botão candidato.  
**Por que assim:** O Gemini pode trocar labels/classes mantendo um ícone visual de envio.  
**Risco/alternativa:** A condição é ampla: qualquer SVG com label vazio pode virar falso positivo; por isso há lacuna dedicada.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0443

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0444

**Fonte:** `const isSend = label === 'enviar' \|\| label === 'enviar mensagem' \|\| label === 'enviar prompt' \|\| label === 'enviar consulta' \|\|`  
**O que faz:** Inicializa `isSend` com `label === 'enviar' \|\| label === 'enviar mensagem' \|\| label === 'enviar prompt' \|\| label === 'enviar consulta' \|\|`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0445

**Fonte:** `label === 'send' \|\| label === 'send message' \|\| label === 'send prompt' \|\|`  
**O que faz:** Atualiza `label` para `== 'send' \|\| label === 'send message' \|\| label === 'send prompt' \|\|`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **fallback de submit**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0446

**Fonte:** `tooltip === 'enviar' \|\| tooltip === 'enviar mensagem' \|\| tooltip === 'send' \|\|`  
**O que faz:** Atualiza `tooltip` para `== 'enviar' \|\| tooltip === 'enviar mensagem' \|\| tooltip === 'send' \|\|`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **fallback de submit**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0447

**Fonte:** `dataTooltip === 'enviar' \|\| dataTooltip === 'send' \|\|`  
**O que faz:** Atualiza `dataTooltip` para `== 'enviar' \|\| dataTooltip === 'send' \|\|`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **fallback de submit**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0448

**Fonte:** `testId === 'send-button' \|\| className.includes('send-button') \|\|`  
**O que faz:** Atualiza `testId` para `== 'send-button' \|\| className.includes('send-button') \|\|`.  
**Como faz:** A atribuição muda explicitamente o estado usado pelas próximas etapas de **fallback de submit**.  
**Por que assim:** A mutação é local ao contrato desse estado e torna a transição observável.  
**Risco/alternativa:** Mutação implícita/duplicada em vários pontos tornaria o lifecycle mais difícil de auditar.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0449

**Fonte:** `(hasSendIcon && (label.includes('enviar') \|\| label.includes('send') \|\| label === ''));`  
**O que faz:** Fecha a expressão booleana `isSend` com o caso de ícone + label contendo enviar/send ou vazio.  
**Como faz:** É o último fallback da heurística depois de labels, tooltips, test-id e class exatos.  
**Por que assim:** Permite reconhecer versões do botão sem rótulo acessível.  
**Risco/alternativa:** O caso `label === ''` aumenta risco de classificar botão genérico com SVG.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0450

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0451

**Fonte:** `const enabled = btn.disabled !== true &&`  
**O que faz:** Inicializa `enabled` com `btn.disabled !== true &&`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0452

**Fonte:** `!btn.hasAttribute('disabled') &&`  
**O que faz:** Continua a expressão `enabled` exigindo ausência do atributo HTML `disabled`.  
**Como faz:** Complementa o teste `btn.disabled !== true` para componentes que usam apenas atributo.  
**Por que assim:** Evita clicar controles semanticamente desabilitados.  
**Risco/alternativa:** Checar apenas a propriedade pode falhar em web components/custom elements.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0453

**Fonte:** `btn.getAttribute('aria-disabled') !== 'true';`  
**O que faz:** Finaliza `enabled` exigindo `aria-disabled !== 'true'`.  
**Como faz:** Acrescenta o estado de acessibilidade à validação de disponibilidade do botão.  
**Por que assim:** Muitos componentes modernos sinalizam desabilitado só por ARIA.  
**Risco/alternativa:** Ignorar ARIA pode disparar clique em controle visualmente desabilitado.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0454

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0455

**Fonte:** `if (isSend && enabled) {`  
**O que faz:** Testa a guarda `if (isSend && enabled) {`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **fallback de submit** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0456

**Fonte:** `if (typeof btn.focus === 'function') btn.focus();`  
**O que faz:** Testa a guarda `if (typeof btn.focus === 'function') btn.focus();`.  
**Como faz:** Somente o ramo verdadeiro pode produzir os side effects globais subsequentes.  
**Por que assim:** **fallback de submit** precisa bloquear casos fora do contrato antes de alterar a página.  
**Risco/alternativa:** Executar sem a guarda ampliaria escopo ou duplicaria trabalho.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0457

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0458

**Fonte:** `const eventOpts = { bubbles: true, cancelable: true, composed: true, view: window };`  
**O que faz:** Inicializa `eventOpts` com `{ bubbles: true, cancelable: true, composed: true, view: window };`.  
**Como faz:** O valor fica no escopo da IIFE/bloco e alimenta **fallback de submit**.  
**Por que assim:** Essa variável separa estado/política da operação que a consome.  
**Risco/alternativa:** Incorporar o valor em vários lugares dificultaria sincronizar o comportamento.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0459

**Fonte:** `btn.dispatchEvent(new PointerEvent('pointerdown', eventOpts));`  
**O que faz:** Despacha `btn.dispatchEvent(new PointerEvent('pointerdown', eventOpts));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0460

**Fonte:** `btn.dispatchEvent(new MouseEvent('mousedown', eventOpts));`  
**O que faz:** Despacha `btn.dispatchEvent(new MouseEvent('mousedown', eventOpts));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0461

**Fonte:** `btn.dispatchEvent(new MouseEvent('mouseup', eventOpts));`  
**O que faz:** Despacha `btn.dispatchEvent(new MouseEvent('mouseup', eventOpts));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0462

**Fonte:** `btn.dispatchEvent(new PointerEvent('pointerup', eventOpts));`  
**O que faz:** Despacha `btn.dispatchEvent(new PointerEvent('pointerup', eventOpts));`.  
**Como faz:** Publica um evento no MAIN world para sincronizar página/isolated world ou simular a interação necessária.  
**Por que assim:** Custom/Event dispatch é o boundary disponível sem acesso direto entre worlds.  
**Risco/alternativa:** Chamada direta entre mundos não existe e acoplamento global seria mais frágil.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0463

**Fonte:** `btn.click();`  
**O que faz:** Aciona `click()` no botão candidato selecionado.  
**Como faz:** Depois de pointer/mouse events, chama a ação semântica nativa do elemento.  
**Por que assim:** Alguns frameworks escutam `click` em vez de eventos de baixo nível.  
**Risco/alternativa:** O clique amplia chance de submit, mas deve ocorrer só no botão validado.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0464

**Fonte:** `break;`  
**O que faz:** Interrompe o loop assim que o candidato desejado foi tratado.  
**Como faz:** Impede que o fallback de submit continue clicando outros botões após um clique escolhido.  
**Por que assim:** A unidade deve limitar a tentativa a um botão por varredura.  
**Risco/alternativa:** Continuar poderia gerar múltiplos cliques/submits.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0465

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fallback de submit** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0466

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fallback de submit** com `}`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0467

**Fonte:** `} catch(err) {}`  
**O que faz:** Captura exceção da tentativa anterior com `} catch(err) {}`.  
**Como faz:** Transforma incompatibilidade em degradação silenciosa ou resposta de erro controlada.  
**Por que assim:** Fallbacks deste arquivo são best-effort e não podem derrubar o app.  
**Risco/alternativa:** Propagar qualquer erro de DOM impediria as rotas seguintes.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0468

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **fallback de submit** com `});`.  
**Como faz:** Delimita callback, objeto, chamada ou bloco aberto nas linhas anteriores.  
**Por que assim:** A posição preserva o escopo exato da operação composta.  
**Risco/alternativa:** Mover/omitir o delimitador alteraria escopo ou sintaxe.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0469

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **fallback de submit**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 consumidor provado; ⚠️ listener MAIN sem prova direta — rpa-flow prova emissão do evento, não a heurística Enter+botão desta implementação.

### Linha 0470

**Fonte:** `console.log("⚡ Anti-throttling progressivo ativo no Gemini (modo " + antiThrottleMode + ").");`  
**O que faz:** Emite diagnóstico `console.log("⚡ Anti-throttling progressivo ativo no Gemini (modo " + antiThrottleMode + ").");`.  
**Como faz:** Escreve no console da página para tornar sucesso/falha MAIN-world observável.  
**Por que assim:** Falhas de world/DOM são difíceis de rastrear apenas pelo isolated world.  
**Risco/alternativa:** Sem diagnóstico, regressões da ponte ficam silenciosas.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — MV3 pode carregar o script, mas não há assertion do log final.

### Linha 0471

**Fonte:** `})();`  
**O que faz:** Fecha e invoca imediatamente a IIFE do arquivo.  
**Como faz:** O `})();` termina o escopo privado e executa todo o bootstrap uma única vez na carga do content script.  
**Por que assim:** IIFE permite instalação imediata sem exportar variáveis internas.  
**Risco/alternativa:** Sem invocação o código ficaria apenas declarado e nenhuma ponte seria instalada.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — MV3 pode carregar o script, mas não há assertion do log final.

### Linha 0472

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **log final e fechamento**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — MV3 pode carregar o script, mas não há assertion do log final.

### Linha 0473

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia entre trechos de **log final e fechamento**.  
**Como faz:** Não roda JavaScript; separa visualmente responsabilidades e preserva a numeração física.  
**Por que assim:** A separação torna revisões de overrides globais menos ambíguas.  
**Risco/alternativa:** Remover não muda o runtime, mas altera a rastreabilidade posicional.  
**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — MV3 pode carregar o script, mas não há assertion do log final.


## 15. Checklist de revisão antes da conclusão

- [x] Fonte integral materializada.
- [x] SHA reservado coincide com o fonte atual.
- [x] 473/473 posições documentadas em ordem.
- [x] Manifest, background builder, consumers e testes cruzados.
- [x] Simulações/gates separados de prova direta.
- [x] Divergências de testes desatualizados registradas.
- [x] Segurança, lifecycle, scheduling e trust boundaries analisados.
- [x] Lacunas e invariantes explícitos.
- [x] Releitura do blob gravado e validação mecânica final.
- [x] Conclusão atômica em STATUS/CHECKLIST/AUDITORIA/PR sob PROGRESS lock.

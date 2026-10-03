# Bíblia técnica — extracted-functions.js

> **Estado documental:** 🟡 CORRIGIDA após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `ccbf20485608a223c723adf638860cb7151c8886`  
> **Agente responsável:** AGENTE 3  
> **Arquivo:** `tests/helpers/extracted-functions.js`  
> **Tipo:** helper de testes com mirrors de lógica de produção  
> **Linhas textuais:** **101**  
> **Posições documentais:** **102**, contando o newline terminal  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Este arquivo não é produção. Exporta `canonicalTitle`, `playErrorSound`, `waitForDownload` e `escapeForRegex` como reimplementações para testes isolados. Um teste que importa este helper prova o **mirror**, não automaticamente a implementação real.

No snapshot auditado isso é concreto: `canonicalTitle` do helper já diverge da função real.

## 2. `canonicalTitle` e drift

O helper remove prefixo textual opcional+número e também remove integralmente sufixo final de site, além de normalização/lowercase/limite 80. A produção atual em `extension/content/cm-chapter.js` (SHA observado `44b621d570b6492ef08982ec4e093ffcfe6d24f8`) remove apenas prefixo puramente numérico e não possui esses dois passos extras. O cabeçalho que aponta canonical para `content_manga.js` está histórico.

`canonical-title.test.js` e `canonical-title-full.test.js` importam este helper: ✅ prova direta do mirror; ⚠️ não prova `cm-chapter.js`. `Cap 5: Dragon Ball` é caso concreto de semântica divergente.

## 3. `playErrorSound`

O helper aceita `audioCtxFactory`, cria dois pulsos sawtooth 300/150 Hz e absorve exceções. A produção em `extension/content/content_manga.js` (SHA observado `a8b3698019f6f22027f09f544f15c0563a9f6515`) tem parâmetros equivalentes no snapshot, porém não expõe factory. `audio-synthesis*.test.js` prova diretamente o mirror, não a função interna real.

## 4. `waitForDownload`

O helper usa `downloadsMock`, cleanup em complete/interrupted, timeout 600.000 ms e retorna handler. A produção em `extension/background.js` usa `chrome.downloads`, mensagem de timeout diferente e não retorna handler. `download-wait.test.js` testa diretamente a produção. Nenhum consumer deste export do helper foi localizado.

## 5. `escapeForRegex`

A lógica real correspondente está em `extension/background/actions/open-existing-folder.js`; `regex-escape.test.js` testa o fluxo real. Nenhum consumer deste export do helper foi localizado.

## 6. Evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| canonical helper | `canonical-title*.test.js` | ✅ PROVADO DIRETAMENTE — helper |
| equivalência canonical helper↔produção | fontes divergem; sem equivalence gate | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| áudio helper | `audio-synthesis*.test.js` | ✅ PROVADO DIRETAMENTE — helper |
| equivalência áudio | comparação de fonte apenas | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| wait helper | sem consumer/teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| wait produção | `download-wait.test.js` | ✅ PROVADO DIRETAMENTE — produção |
| regex helper | sem consumer/teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| regex produção | `regex-escape.test.js` | ✅ PROVADO DIRETAMENTE — produção |

## 7. Riscos

1. **HIGH:** mirror drift de `canonicalTitle` já presente.
2. Suites do mirror podem gerar falso verde para produção.
3. A promessa “a suíte detectará divergências” não possui equivalence gate localizado.
4. `waitForDownload` e `escapeForRegex` parecem mirrors legados sem consumers.
5. `chapter-dedup.test.js` mantém outra cópia de canonicalização.

## 8. Solicitações ao auditor

### 099-001 — MIRROR_DRIFT — ACCEPTED — HIGH

Migrar vetores de `canonicalTitle` para a implementação real/compartilhada ou criar equivalência explícita. Risco: testes verdes validarem comportamento ausente na extensão.

### 099-002 — TEST_ARCHITECTURE_REVIEW — SUPERSEDED → 191-001

Exercitar `playErrorSound` real ou estabelecer fonte compartilhada/equivalence gate; a factory existe apenas no mirror.

### 099-003 — STALE_HELPER_REVIEW — ACCEPTED

Confirmar ausência de consumers de `waitForDownload`/`escapeForRegex` e remover/deprecar/documentar os mirrors em alteração separada, pois produção já tem testes reais.

## 9. Mapa de cobertura

| Linhas/posição | Unidade | Papel |
|---|---|---|
| 1–13 | cabeçalho | contrato de mirror/manutenção |
| 14 | separador | cabeçalho→canonical |
| 15–17 | comentários canonical | intenção/versionamento |
| 18–19 | início canonical | função/fallback |
| 20–25 | prefixo | explicação + regex inicial |
| 26–31 | sufixo | explicação + strip de site |
| 32–37 | normalização | separadores, trim, lowercase, limite |
| 38 | fim canonical | fechamento |
| 39 | separador | canonical→áudio |
| 40–42 | comentários áudio | contrato |
| 43–48 | contexto áudio | factory/API global |
| 49–61 | síntese | nós, frequências, gains e tempos |
| 62–63 | catch/fim | falha silenciosa |
| 64 | separador | áudio→download |
| 65–66 | comentários download | origem |
| 67–70 | setup download | timer/handler/filtro |
| 71–79 | estados | complete/interrupted |
| 80–81 | listener | registro |
| 82–85 | timeout | cleanup/error |
| 86–87 | retorno/fim | handler |
| 88 | separador | download→regex |
| 89–91 | comentários regex | origem histórica |
| 92–94 | escape | implementação |
| 95 | separador | regex→exports |
| 96–101 | exports | quatro símbolos |
| 102 | newline terminal | LF final |

## 10. Fonte integral auditada

```javascript
/**
 * extracted-functions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-implementa as funções puras do content_manga.js para testes isolados.
 *
 * MOTIVO: content_manga.js é um IIFE que roda em ambiente de extensão Chrome.
 * Funções como `canonicalTitle` e `playErrorSound` ficam dentro do escopo da
 * closure e não são exportadas. Este arquivo espelha essas implementações para
 * que possam ser testadas sem carregar o content script inteiro.
 *
 * MANUTENÇÃO: Se canonicalTitle ou playErrorSound mudarem em content_manga.js,
 * atualize aqui também. A suíte de testes detectará divergências.
 */

// ── canonicalTitle ────────────────────────────────────────────────────────────
// Normaliza o título da aba para uso como chave de agrupamento de capítulos.
// Versão v3.2 — regex expandida para tratar variações reais de sites de mangá.
function canonicalTitle(t) {
    return (t || '')
        // CORREÇÃO v3.2: Antes a regex era /^\d+[\s.\-–—:|]+/ — só removia prefixos
        // NUMÉRICOS PUROS (ex: "1050 - Title"). Não funcionava para "Cap 5: Title"
        // porque "Cap" começa com letra, não dígito.
        // NOVO: (?:[A-Za-z]+\.?\s+)? torna o prefixo textual opcional, permitindo
        // remover "Cap 5: ", "Ch. 12 ", "Vol. 3: " além dos numéricos puros.
        .replace(/^(?:[A-Za-z]+\.?\s+)?\d+[\s.\-–—:|]+/, '')
        // CORREÇÃO v3.2: Remove sufixo de site no final "| Site" ou " - Site"
        // Exemplo: "One Piece Cap 1050 | Ler" → "One Piece Cap 1050"
        //          "One Piece Cap 1050 - Mangás" → "One Piece Cap 1050"
        // Isso garante que o mesmo capítulo visitado em sessões com títulos
        // ligeiramente diferentes (sufixo do site variando) produza a mesma chave.
        .replace(/\s+[-|–—]\s+.+$/, '')
        .replace(/[|–—•·\[\]()\u00AB\u00BB]/g, ' ') // Substitui separadores por espaço
        .replace(/\s*[-:]\s*$/, '')                  // Remove traço/dois-pontos no fim
        .replace(/\s{2,}/g, ' ')                     // Colapsa espaços múltiplos
        .trim()
        .toLowerCase()
        .slice(0, 80);
}

// ── playErrorSound ────────────────────────────────────────────────────────────
// Síntese procedural: dois pulsos sawtooth descendentes (300Hz → 150Hz).
// Versão simplificada para verificação de assinatura da API de áudio.
function playErrorSound(audioCtxFactory) {
    try {
        const audioCtx = audioCtxFactory
            ? audioCtxFactory()
            : new (window.AudioContext || window.webkitAudioContext)();

        [0, 0.2].forEach((t, i) => {
            const osc  = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime([300, 150][i], audioCtx.currentTime + t);
            gain.gain.setValueAtTime(0, audioCtx.currentTime + t);
            gain.gain.linearRampToValueAtTime(0.4,   audioCtx.currentTime + t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.28);
            osc.start(audioCtx.currentTime + t);
            osc.stop(audioCtx.currentTime + t + 0.3);
        });
    } catch (e) { /* silencioso por design */ }
}

// ── waitForDownload (background.js) ──────────────────────────────────────────
// Extração para testar o padrão de listener com cleanup garantido.
function waitForDownload(downloadsMock, id, onComplete, onError) {
    let safetyTimer;
    function handler(delta) {
        if (delta.id !== id) return;
        if (delta.state?.current === 'complete') {
            clearTimeout(safetyTimer);
            downloadsMock.onChanged.removeListener(handler);
            onComplete(id);
        } else if (delta.state?.current === 'interrupted') {
            clearTimeout(safetyTimer);
            downloadsMock.onChanged.removeListener(handler);
            if (onError) onError(new Error(`Download ${id} interrupted`));
        }
    }
    downloadsMock.onChanged.addListener(handler);
    safetyTimer = setTimeout(() => {
        downloadsMock.onChanged.removeListener(handler);
        if (onError) onError(new Error('Timeout'));
    }, 600_000);
    return handler; // retorna para inspeção em testes
}

// ── fallbackSearchRegex ───────────────────────────────────────────────────────
// Isola a lógica de escape de regex do fallbackSearch (background.js).
// Bug #14 Fix: regex /[.*+?^${}()|[\]\\]/g — correta para todos os paths.
function escapeForRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    canonicalTitle,
    playErrorSound,
    waitForDownload,
    escapeForRegex,
};
```

## 11. Conclusão

O helper deve ser tratado como mirror. A auditoria encontrou drift real em `canonicalTitle`; correções externas foram registradas e não fabricadas pelo AGENTE 3.

> **Lifecycle pós-REAUDIT:** 099-001 e 099-003 estão ACCEPTED; 099-002 está SUPERSEDED por `191-001`, que centraliza a dívida de autenticidade de `playErrorSound`.

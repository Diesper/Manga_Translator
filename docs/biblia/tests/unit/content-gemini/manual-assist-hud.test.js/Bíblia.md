# Bíblia técnica — tests/unit/content-gemini/manual-assist-hud.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `14f53ac3c5a9d6fcf7898b12dab8ef53e6a1997f`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest/JSDOM do HUD manual Gemini  
> **Linhas textuais:** 102  
> **Posições documentais:** 103

## 1. Papel arquitetural

Esta suíte testa a interface manual de recuperação `#mt-gemini-assist`, exposta por `content_gemini.js` e implementada pelo `job-runner.js`.

Ela usa `loadContentGeminiModule({skipAutoProcess:true})`; portanto não reimplementa o HUD. As chamadas:
- `createGeminiManualPanel`;
- `removeGeminiManualPanel`;

passam pelo API real de `content_gemini.js` e delegam para o JobRunner real carregado pelo helper.

O painel existe como fallback quando a detecção automática do resultado falha. Ele permite:
1. “Usar última” — escolher o último candidato retornado por `findGeneratedResultImages`;
2. “Selecionar” — destacar candidatos e aceitar clique manual do usuário.

## 2. Cenários diretamente provados

### HUD inicial

O primeiro teste exige:
- painel `#mt-gemini-assist`;
- número humano `index+1`;
- botões `mt-gemini-use-last` e `mt-gemini-pick`;
- status inicial “Aguardando imagem gerada.”.

Classificação: ✅ PROVADO DIRETAMENTE.

### “Usar última” com candidato

Cria uma imagem Googleusercontent 800×1200, clica o botão e exige:
- `window.__mangaTranslatorManualGeminiResultUrl` igual à URL;
- status “Imagem marcada”.

Classificação: ✅ PROVADO DIRETAMENTE para **um único candidato válido**.

### “Usar última” sem candidatos

Exige a mensagem de ausência de imagem.

Classificação: ✅ PROVADO DIRETAMENTE.

### Seleção manual

O teste prova:
- status instrutivo;
- `data-mt-gemini-pickable=true`;
- outline visual;
- click real no IMG;
- gravação da URL;
- remoção do destaque após seleção.

Classificação: ✅ PROVADO DIRETAMENTE.

### Remoção do painel

O último teste exige que o elemento HUD seja removido do DOM.

Classificação: ✅ PROVADO DIRETAMENTE apenas para remoção visual do painel.

## 3. Contrato real relacionado

No JobRunner real:

- `createGeminiManualPanel` sempre chama `removeGeminiManualPanel` primeiro;
- limpa a URL manual anterior;
- “Usar última” chama `findGeneratedResultImages(getIgnoreImages())` e escolhe `images[images.length - 1]`;
- “Selecionar” marca todas as imagens aceitas por `isManualSelectableImage`;
- instala um listener capture no document;
- o click usa `event.composedPath()` antes de fallback por `closest('img')`, portanto suporta imagem em Shadow DOM aberto;
- `setManualGeminiResultUrl` também chama `observer.acceptResult(null,url)` quando existe observer ativo;
- `removeGeminiManualPanel` remove listener global e limpa todos os outlines/datasets residuais.

Esses detalhes são implementação real, mas nem todos recebem assertion neste arquivo.

## 4. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| criação do HUD real | teste 1 | ✅ PROVADO DIRETAMENTE |
| índice + 1 | teste 1 | ✅ PROVADO DIRETAMENTE |
| botões/status inicial | teste 1 | ✅ PROVADO DIRETAMENTE |
| seleção “última” com 1 candidato | teste 2 | ✅ PROVADO DIRETAMENTE |
| ausência de candidato | teste 3 | ✅ PROVADO DIRETAMENTE |
| destaque manual e click | teste 4 | ✅ PROVADO DIRETAMENTE |
| cleanup visual após click | teste 4 | ✅ PROVADO DIRETAMENTE |
| painel removido por removeGeminiManualPanel | teste 5 | ✅ PROVADO DIRETAMENTE |
| listener capture removido pelo cleanup | título afirma, mas não há assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| outlines/dataset de seleção pendente removidos por remove | não testado no teste 5 | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| “última” entre múltiplos candidatos é realmente a geração mais recente | apenas 1 candidato no teste | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ignoreImages realmente exclui candidato stale | callback sempre retorna Set vazio | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| observer.acceptResult recebe URL manual | não há observer ativo no teste | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| composedPath seleciona IMG dentro de ShadowRoot | click usa imagem light DOM | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| log GEMINI_MANUAL_INTERVENTION_REQUIRED | não assertado | 🟨 EXECUTADO INDIRETAMENTE |
| recriar painel elimina listener anterior | não há cenário de criação dupla | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Solicitações ao auditor

### 182-001 — TEST_STRENGTH_REVIEW — OPEN

O teste “removeGeminiManualPanel remove o HUD e limpa listeners residuais” só exige que o painel desapareça.

**Falta provar:**
- `__mangaTranslatorManualPickHandler === null`;
- click posterior não seleciona imagem;
- `data-mt-gemini-pickable` e outline pendentes são removidos.

**Risco:** listener capture de um job anterior pode interferir no job seguinte apesar do teste permanecer verde.

**Severidade:** HIGH.

### 182-002 — CONTRACT_REVIEW — OPEN

“Usar última” escolhe `images[images.length-1]`, isto é, o último candidato na ordem retornada pelo DOM traversal. O teste possui somente uma imagem e não prova que a ordem DOM equivale à geração temporal mais recente.

**Necessário:** cenário com:
- resultado antigo;
- resultado novo;
- imagem irrelevante;
- `ignoreImages` contendo candidatos antigos;
- eventualmente Shadow DOM.

**Risco:** fallback manual “Usar última” pode marcar resultado stale/errado — especialmente relevante quando a detecção automática já falhou.

**Severidade:** HIGH.

### 182-003 — TEST_REQUIRED — OPEN

Não há prova focal de que uma escolha manual:
- chama `observer.acceptResult(null,url)`;
- atravessa `composedPath` para IMG em ShadowRoot;
- substitui corretamente um handler de seleção anterior quando o painel é recriado.

**Risco:** a UI pode mostrar “Imagem marcada” e gravar a variável global, mas o pipeline observador não receber a seleção em alguma configuração.

**Severidade:** NORMAL.

## 6. Fonte integral auditada

```javascript
/**
 * manual-assist-hud.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o painel flutuante de assistência manual (#mt-gemini-assist)
 * implementado em content_gemini.js na arquitetura atual.
 */

const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');

describe('Manual Assist HUD (#mt-gemini-assist) — content_gemini.js', () => {
    let geminiMod;

    beforeEach(() => {
        document.documentElement.innerHTML = '<head></head><body></body>';
        geminiMod = loadContentGeminiModule({ skipAutoProcess: true });
    });

    afterEach(() => {
        geminiMod.removeGeminiManualPanel();
        document.documentElement.innerHTML = '<head></head><body></body>';
        delete window.__mangaTranslatorManualGeminiResultUrl;
    });

    test('cria o painel #mt-gemini-assist com botões de ação e status inicial', () => {
        geminiMod.createGeminiManualPanel({ index: 2 }, () => new Set());

        const panel = document.getElementById('mt-gemini-assist');
        expect(panel).not.toBeNull();
        expect(panel.textContent).toContain('Imagem 3');

        const btnUseLast = document.getElementById('mt-gemini-use-last');
        const btnPick = document.getElementById('mt-gemini-pick');
        const status = document.getElementById('mt-gemini-assist-status');

        expect(btnUseLast).not.toBeNull();
        expect(btnPick).not.toBeNull();
        expect(status.textContent).toBe('Aguardando imagem gerada.');
    });

    test('botão "Usar última" marca a URL da imagem candidata mais recente', () => {
        const candidateImg = document.createElement('img');
        candidateImg.src = 'https://lh3.googleusercontent.com/result_image_123=s1024';
        Object.defineProperty(candidateImg, 'naturalWidth', { value: 800, configurable: true });
        Object.defineProperty(candidateImg, 'naturalHeight', { value: 1200, configurable: true });
        document.body.appendChild(candidateImg);

        geminiMod.createGeminiManualPanel({ index: 0 }, () => new Set());

        const btnUseLast = document.getElementById('mt-gemini-use-last');
        btnUseLast.click();

        expect(window.__mangaTranslatorManualGeminiResultUrl).toBe('https://lh3.googleusercontent.com/result_image_123=s1024');
        const status = document.getElementById('mt-gemini-assist-status');
        expect(status.textContent).toContain('Imagem marcada');
    });

    test('botão "Usar última" atualiza status se não houver candidatos', () => {
        geminiMod.createGeminiManualPanel({ index: 0 }, () => new Set());

        const btnUseLast = document.getElementById('mt-gemini-use-last');
        btnUseLast.click();

        const status = document.getElementById('mt-gemini-assist-status');
        expect(status.textContent).toContain('Ainda não encontrei uma imagem candidata');
    });

    test('botão "Selecionar" destaca imagens candidatas e captura clique manual', () => {
        const candidateImg = document.createElement('img');
        candidateImg.src = 'https://lh3.googleusercontent.com/picked_image=s1024';
        Object.defineProperty(candidateImg, 'naturalWidth', { value: 800, configurable: true });
        Object.defineProperty(candidateImg, 'naturalHeight', { value: 1200, configurable: true });
        document.body.appendChild(candidateImg);

        geminiMod.createGeminiManualPanel({ index: 0 }, () => new Set());

        const btnPick = document.getElementById('mt-gemini-pick');
        btnPick.click();

        const status = document.getElementById('mt-gemini-assist-status');
        expect(status.textContent).toContain('Clique diretamente na imagem correta');
        expect(candidateImg.dataset.mtGeminiPickable).toBe('true');
        expect(candidateImg.style.outline).toContain('solid');

        // Simula o clique do usuário diretamente na imagem candidata
        candidateImg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        // Verifica que a URL foi gravada
        expect(window.__mangaTranslatorManualGeminiResultUrl).toBe('https://lh3.googleusercontent.com/picked_image=s1024');

        // Verifica que o destaque visual foi removido
        expect(candidateImg.dataset.mtGeminiPickable).toBeUndefined();
        expect(candidateImg.style.outline).toBe('');
    });

    test('removeGeminiManualPanel remove o HUD e limpa listeners residuais', () => {
        geminiMod.createGeminiManualPanel({ index: 1 }, () => new Set());
        expect(document.getElementById('mt-gemini-assist')).not.toBeNull();

        geminiMod.removeGeminiManualPanel();
        expect(document.getElementById('mt-gemini-assist')).toBeNull();
    });
});
```

## 7. Mapa integral

| Linhas | Responsabilidade |
|---:|---|
| 1–5 | comentário/objetivo |
| 6–8 | import do loader real |
| 9 | describe |
| 10–14 | setup |
| 15–20 | cleanup |
| 21–36 | criação/estado inicial |
| 37–54 | “Usar última” com candidato |
| 55–66 | “Usar última” sem candidato |
| 67–95 | seleção manual e cleanup pós-click |
| 96–102 | remoção do HUD |
| posição final | newline final |

## 8. Invariantes

1. o HUD é fallback manual, não caminho principal;
2. a seleção manual deve passar pelos mesmos filtros de imagem;
3. uma nova seleção não deve deixar listener/destaque do job anterior;
4. “Usar última” só é seguro se a ordenação/ignore set realmente excluírem candidatos stale;
5. gravação visual/global deve permanecer coerente com o observer ativo.

## 9. Autoauditoria do AGENTE 17

- [x] reserva exclusiva confirmada;
- [x] state próprio criado;
- [x] source SHA reconfirmado;
- [x] implementação real do JobRunner lida;
- [x] cada assertion do teste classificada;
- [x] título do teste de cleanup não foi promovido a prova de listener;
- [x] fonte integral incorporada exatamente;
- [x] nenhuma implementação/teste externo modificado;
- [x] três solicitações externas registradas.

**Resultado:** suíte útil e autêntica para o HUD básico, porém ainda fraca nos contratos mais perigosos: cleanup global e definição real de “última imagem”.

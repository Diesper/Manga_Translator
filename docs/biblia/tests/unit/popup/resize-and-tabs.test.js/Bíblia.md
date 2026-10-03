# Bíblia técnica — tests/unit/popup/resize-and-tabs.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `d611cadbdfc9b73727dcab60368a6dcbe6d8b703`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest/jsdom do popup real  
> **Linhas textuais:** 136  
> **Posições documentais:** 137, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte testa três comportamentos do popup real:

1. restauração do tamanho salvo;
2. redimensionamento bidimensional por drag e persistência em `popupSize`;
3. agrupamento de imagens banidas por domínio, incluindo defesa contra injeção HTML em `siteMeta.title`.

O arquivo carrega `extension/popup/popup.html` e `extension/popup/popup.js` reais via `loadExtensionPage`.

Não há mirror local da lógica do popup.

## 2. Setup

Antes de cada teste:

- módulos Jest são resetados;
- storage é limpo;
- DOM é resetado;
- `requestAnimationFrame` executa imediatamente;
- `offsetWidth` e `offsetHeight` são derivados do style com fallback 500×600.

Essa simulação permite testar o fluxo real de resize sem layout engine completa.

## 3. Teste 1 — dimensão persistida

O storage recebe:

```js
popupSize: { width: 650, height: 550 }
```

Após o popup real carregar, a suíte exige:

```text
body.style.width  = 650px
body.style.height = 550px
```

No runtime atual, `popup.js`:
- aplica largura diretamente;
- limita a altura salva com `Math.min(height, 600)`;
- quando `popupSize` não existe, usa 500×600.

A suíte, apesar do nome “ou aplica padrão 500x600”, **não testa o ramo sem popupSize**.

Também não testa valores persistidos fora de faixa.

## 4. Teste 2 — resizer diagonal e persistência

A suíte confirma a existência de `#resizer-br`.

Em seguida:
- mousedown em (100,100);
- mousemove para (250,200);
- mouseup;
- leitura de `popupSize`.

O código real usa:
- mínimo 400×400;
- máximo 800×600;
- eixo `both` para o resizer diagonal;
- `chrome.storage.local.set` no mouseup.

A suíte exige apenas:
- `popupSize` definido;
- width >= 400;
- height >= 400.

Ela não exige os valores finais exatos nem os limites máximos.

Os handles `#resizer-r` e `#resizer-b` também não são exercitados.

## 5. Teste 3 — agrupamento das banidas

O storage contém:

- dois domínios habilitados;
- 2 URLs banidas em site-a;
- 1 URL banida em site-b;
- título malicioso:
  `<img src=x onerror=alert(1)>`.

A suíte abre a aba “Banidas” quando o botão existe e exige:

- duas `.site-folder`;
- contagens `2 ban.` e `1 ban.`;
- texto do nome preservando literalmente a string maliciosa;
- nenhum elemento `img` criado dentro do nome.

Isso prova diretamente que o título passa por escaping antes do `innerHTML` do header.

## 6. Segurança de XSS

O runtime usa:

```js
<span class="site-folder-name" ...>${escapeHTML(siteTitle)}</span>
```

O teste é uma prova específica e útil: se `escapeHTML` deixar de proteger o conteúdo, `querySelector('.site-folder-name img')` deixará de ser null.

Classificação:

**✅ PROVADO DIRETAMENTE**

## 7. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| popup.html/popup.js reais são carregados | loadExtensionPage | ✅ PROVADO DIRETAMENTE |
| largura salva 650 é restaurada | teste 1 | ✅ PROVADO DIRETAMENTE |
| altura salva 550 é restaurada | teste 1 | ✅ PROVADO DIRETAMENTE |
| default 500×600 sem popupSize | nome do teste menciona, mas não há caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| altura persistida >600 é limitada | código real, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| largura persistida inválida é normalizada | runtime atual não normaliza no load | ⚠️ CONTRATO NÃO PROVADO |
| resizer diagonal existe | teste 2 | ✅ PROVADO DIRETAMENTE |
| drag salva popupSize | teste 2 | ✅ PROVADO DIRETAMENTE |
| mínimo 400 | assertions apenas >=400 | 🟨 EXECUTADO, MAS ASSERTION NÃO ISOLA CLAMP |
| máximo 800×600 | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resizer horizontal `resizer-r` | sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resizer vertical `resizer-b` | sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| agrupamento por dois domínios | teste 3 | ✅ PROVADO DIRETAMENTE |
| contagens 2/1 | teste 3 | ✅ PROVADO DIRETAMENTE |
| título malicioso vira texto, não HTML | teste 3 | ✅ PROVADO DIRETAMENTE |
| botão da aba Banidas é obrigatório | clique protegido por `if` | ⚠️ SEM ASSERTION OBRIGATÓRIA |
| colapso/expansão de `.site-folder` | não testado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Solicitações ao auditor

### 220-001 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** o primeiro teste declara cobrir “popupSize ou padrão 500x600”, mas executa apenas o caminho com tamanho salvo.

**Evidência atual:** 650×550 é restaurado.

**Evidência ausente:** storage sem popupSize e valores persistidos fora dos limites.

**Ação solicitada:** adicionar casos para default 500×600 e para dimensões salvas acima/abaixo do contrato, documentando se load deve clampá-las.

**Risco:** regressão do default ou persistência corrompida não é detectada.

**Severidade:** NORMAL.

### 220-002 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** o teste de resize apenas exige `width>=400` e `height>=400`, embora o código implemente cálculo exato e clamp 400–800 × 400–600.

**Evidência atual:** o drag diagonal gera e salva dimensões válidas.

**Evidência ausente:** valor exato do delta, máximos, mínimos e handles horizontal/vertical.

**Ação solicitada:** adicionar casos determinísticos para `resizer-r`, `resizer-b`, `resizer-br`, clamp mínimo e clamp máximo.

**Risco:** um erro de cálculo que ainda produza tamanho >=400 pode permanecer verde.

**Severidade:** NORMAL.

### 220-003 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** o botão `.tab-btn[data-tab="banned-tab"]` é clicado apenas dentro de `if (bannedTabBtn)`.

**Evidência atual:** folders e escaping são validados.

**Evidência ausente:** existência obrigatória do controle de navegação da aba.

**Ação solicitada:** substituir a guarda por assertion de existência antes do click e testar também abertura/colapso da pasta se fizer parte do contrato.

**Risco:** a UI pode perder o botão “Banidas” e a parte central da suíte ainda conseguir executar/renderizar dados sem falhar pelo controle ausente.

**Severidade:** HIGH.

## 9. Fonte integral auditada

```js
/**
 * resize-and-tabs.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o redimensionamento bidimensional (2D resizing) do popup e o
 * agrupamento de imagens banidas por domínio em pastas colapsáveis na arquitetura atual.
 */

const { loadExtensionPage, flushAsyncTasks } = require('../../helpers/load-extension-page.js');
const { getStorageMock, getTabsMock } = require('../../mocks/chrome-api.mock.js');

describe('Popup 2D Resizing e Agrupamento de Banidas — popup.js', () => {
    let storageMock;
    let tabsMock;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';

        window.requestAnimationFrame = (cb) => cb();
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
            get: function() { return parseInt(this.style.width, 10) || 500; },
            configurable: true,
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            get: function() { return parseInt(this.style.height, 10) || 600; },
            configurable: true,
        });
    });

    afterEach(() => {
        delete HTMLElement.prototype.offsetWidth;
        delete HTMLElement.prototype.offsetHeight;
        jest.restoreAllMocks();
    });

    test('carrega dimensões salvas em popupSize ou aplica padrão 500x600', async () => {
        await storageMock.set({
            popupSize: { width: 650, height: 550 },
            enabledDomains: ['manga.test'],
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        expect(document.body.style.width).toBe('650px');
        expect(document.body.style.height).toBe('550px');
    });

    test('cria alças de redimensionamento e salva novas dimensões ao soltar o mouse', async () => {
        await storageMock.set({
            enabledDomains: ['manga.test'],
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        const resizerBR = document.getElementById('resizer-br');
        expect(resizerBR).not.toBeNull();

        // Simula clique e arrasto no resizer diagonal (both)
        resizerBR.dispatchEvent(new MouseEvent('mousedown', { screenX: 100, screenY: 100, bubbles: true }));

        // Simula movimento
        document.dispatchEvent(new MouseEvent('mousemove', { screenX: 250, screenY: 200, bubbles: true }));

        // Simula soltar o mouse (salva no storage)
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await flushAsyncTasks(4);

        const saved = await storageMock.get(['popupSize']);
        expect(saved.popupSize).toBeDefined();
        expect(saved.popupSize.width).toBeGreaterThanOrEqual(400);
        expect(saved.popupSize.height).toBeGreaterThanOrEqual(400);
    });

    test('agrupa imagens banidas por domínio em pastas .site-folder separadas', async () => {
        await storageMock.set({
            enabledDomains: ['site-a.com', 'site-b.com'],
            'bannedImages_site-a.com': ['https://site-a.com/ad1.png', 'https://site-a.com/ad2.png'],
            'bannedImages_site-b.com': ['https://site-b.com/banner.png'],
            'siteMeta_site-a.com': { title: '<img src=x onerror=alert(1)>' },
        });

        const activeTab = await tabsMock.create({
            url: 'https://site-a.com/read',
            active: true,
            title: 'Site A',
        });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        // Abre a aba de banidas
        const bannedTabBtn = document.querySelector('.tab-btn[data-tab="banned-tab"]');
        if (bannedTabBtn) bannedTabBtn.click();
        await flushAsyncTasks(8);

        const folders = document.querySelectorAll('#banned-site-list .site-folder');
        expect(folders).toHaveLength(2);

        const folderCounts = Array.from(document.querySelectorAll('.site-folder-count')).map(el => el.textContent);
        expect(folderCounts).toEqual(['2 ban.', '1 ban.']);
        expect(folders[0].querySelector('.site-folder-name').textContent).toBe('<img src=x onerror=alert(1)>');
        expect(folders[0].querySelector('.site-folder-name img')).toBeNull();
    });
});
```

## 10. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–6 | cabeçalho |
| 8–9 | imports |
| 11–35 | describe + setup de layout |
| 36–41 | cleanup |
| 42–66 | restauração de tamanho salvo |
| 67–106 | resize diagonal e persistência |
| 107–135 | agrupamento/XSS das banidas |
| 136 | fecha describe |
| posição 137 | newline final |

## 11. Autoauditoria do AGENTE 17

- [x] reserva #220 criada via CREATE ONLY e relida;
- [x] state próprio criado;
- [x] popup.js real inspecionado;
- [x] fonte integral incorporada;
- [x] 136 linhas + newline = 137 posições;
- [x] XSS classificado como prova direta;
- [x] defaults/clamps/guards não foram promovidos indevidamente a prova;
- [x] três solicitações registradas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #220 prova o resize básico, persistência, agrupamento e escaping do popup real, mas ainda possui lacunas de força de assertion e de obrigatoriedade do controle “Banidas”.

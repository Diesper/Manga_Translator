# Bíblia técnica — tests/mocks/dom-environment.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `9c3bc91608aa52a2d8324fc645c75fac5e4f7452`  
> **Agente responsável:** AGENTE 15  
> **Tipo:** setup global de ambiente JSDOM para Jest  
> **Linhas textuais:** 60  
> **Posições documentais:** 61, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/mocks/dom-environment.js` complementa o ambiente `jsdom` usado pelos testes Jest com APIs que o JSDOM não fornece integralmente ou cujo comportamento real de navegador não é adequado para testes determinísticos.

O arquivo não representa a implementação de produção da extensão. Ele é **infraestrutura de teste**: instala codecs de texto no escopo global e mocks de `scrollTo`, Canvas, `requestAnimationFrame`, `cancelAnimationFrame`, `IntersectionObserver` e `ResizeObserver`.

A distinção é importante para a força da evidência: uma suíte verde que carrega este setup prova que o ambiente artificial foi utilizável, mas não prova que um navegador real implemente essas APIs da mesma forma.

## 2. Onde o arquivo é carregado

`jest.config.js` inclui este arquivo em `setupFilesAfterEnv` de cinco projetos:

- `content-scripts` — JSDOM;
- `popup` — JSDOM;
- `reader` — JSDOM;
- `shared-ui` — JSDOM;
- `integration` — JSDOM.

Ele não é configurado para os projetos `background`, `gtc` ou `manifest`, que usam ambiente Node.

Isso significa que o setup é executado **depois que o ambiente Jest de cada arquivo de teste já existe**, mas antes dos testes daquele arquivo. O guard `typeof window !== 'undefined'` protege a seção específica de navegador caso o arquivo seja carregado em um contexto sem `window`.

## 3. Contrato dos codecs de texto

Linhas 7–9 importam `TextEncoder` e `TextDecoder` do built-in Node `util` e os publicam em `global`.

O objetivo é disponibilizar codecs para módulos/testes executados em JSDOM sem depender de a versão do ambiente fornecer essas globals nativamente.

O arquivo não:

- modifica `window.TextEncoder` explicitamente;
- cria wrappers próprios;
- altera semântica de encoding/decoding;
- verifica se já existiam implementações globais antes de substituí-las.

Nenhum teste focal do próprio setup foi localizado verificando identidade ou round-trip desses codecs.

## 4. Mock de scroll

Linha 14 substitui `window.scrollTo` por `jest.fn()`.

O contrato desse mock é minimalista:

- aceita chamadas sem lançar pelo comportamento do mock Jest;
- registra argumentos/chamadas;
- não altera posição de scroll;
- não despacha eventos;
- não modela layout.

Portanto testes que apenas precisam evitar o erro “not implemented” podem rodar, mas um teste que dependa de geometria/scroll real precisa fornecer comportamento adicional.

## 5. Mock de Canvas

### Guard de instalação

Linha 17 só instala os mocks se:

1. `window.HTMLCanvasElement` existir; e
2. `HTMLCanvasElement.prototype.getContext` não carregar a marca `__mangaTranslatorMock`.

A marca é colocada no próprio `jest.fn` criado na linha 25. Isso reduz reinstalação acidental da mesma camada dentro do mesmo ambiente.

### Contexto padrão

O `getContext` mockado sempre retorna o mesmo objeto `defaultCanvasContext` contendo:

- `drawImage: jest.fn()`;
- `getImageData()` que lança `DOMException` com nome `SecurityError` e mensagem `Canvas pixels unavailable in test environment.`.

Assim, desenho é aceito e observável por chamadas, mas leitura de pixels é deliberadamente indisponível.

### toDataURL

`HTMLCanvasElement.prototype.toDataURL` é substituído por `jest.fn()` que retorna sempre:

`data:image/png;base64,TEST_CANVAS`

Há evidência direta desse contrato em `tests/unit/content-manga/extraction-and-handlers-real.test.js`:

- o caso “envia IMAGE_READY_FROM_NEW_TAB imediatamente quando a imagem ja esta carregada” exige que a mensagem entregue contenha exatamente `src: 'data:image/png;base64,TEST_CANVAS'`;
- o caso “REQUEST_IMAGE_DATA devolve base64 direto quando o canvas funciona” exige exatamente `srcData: 'data:image/png;base64,TEST_CANVAS'`.

Esses testes passam no run CI observado, portanto o retorno padrão de `toDataURL` é efetivamente consumido pela implementação real testada.

### Limite semântico

O mock não produz pixels reais. Uma assertion contra `TEST_CANVAS` prova o caminho de controle e a integração com a API mockada; não prova renderização, fidelidade gráfica, CORS real nem codificação PNG de Chromium.

## 6. Animation frame

Linhas 42–43 implementam:

- `requestAnimationFrame(cb)` como `setTimeout(..., 0)`;
- callback recebe `performance.now()`;
- o retorno é o identificador do timer;
- `cancelAnimationFrame(id)` delega a `clearTimeout(id)`.

Isso fornece assincronia de próximo tick suficiente para vários fluxos de DOM, mas não reproduz:

- sincronização com refresh de tela;
- throttling/background tabs;
- frame budget;
- timestamp do compositor;
- agrupamento real de callbacks por frame.

Alguns testes substituem esse mock novamente com comportamento específico. Por exemplo, `tests/unit/popup/resize-and-tabs.test.js` redefine `window.requestAnimationFrame` de forma síncrona no próprio setup do caso. Portanto a existência de testes de UI com rAF não deve ser interpretada automaticamente como prova direta desta implementação de linhas 42–43.

## 7. IntersectionObserver

Linhas 46–51 definem uma classe com métodos:

- `observe()`;
- `unobserve()`;
- `disconnect()`.

Todos são no-op. O construtor implícito não armazena callback, options ou targets; nenhum evento de interseção é emitido.

Esse mock serve principalmente para permitir que código que só verifica a presença da API possa ser carregado sem erro. Testes que precisam provar lógica de interseção substituem o mock:

- `tests/unit/reader/page-counter.test.js` instala `window.IntersectionObserver = jest.fn().mockImplementation(...)` e captura callbacks;
- `tests/integration/popup-translated-thumbnails.test.js` usa uma classe `FakeIntersectionObserver` com `trigger()` para provar lazy loading, e em outros casos remove a API para provar fallback.

Logo esses testes validam os consumidores, não os métodos no-op deste arquivo.

## 8. ResizeObserver

Linhas 54–59 seguem o mesmo padrão estrutural:

- classe local `ResizeObserver`;
- `observe`, `unobserve` e `disconnect` no-op;
- atribuição a `window.ResizeObserver`.

Não foi localizada assertion focal que instancie **esta classe do setup** e verifique seus métodos. Ela deve ser tratada como infraestrutura executada, não como comportamento diretamente provado.

## 9. Evidência automatizada observada

O GitHub Actions run **36577447500**, de 2026-09-29, executou o mesmo blob `9c3bc91608aa52a2d8324fc645c75fac5e4f7452`.

No mesmo run:

- job **Unit + Integration (20.x)** `109437162616` terminou verde;
- job **Unit + Integration (22.x)** `109437162754` terminou verde;
- ambos reportaram **109 suites, 851 testes, skipped=0, todo=0, 109/109 arquivos**;
- os logs mostram projetos JSDOM como `content-scripts`, `popup`, `reader`, `shared-ui` e `integration` passando;
- o job **Code Coverage** também terminou com sucesso.

Como `jest.config.js` injeta este setup nesses cinco projetos, há prova de execução real do arquivo como infraestrutura em uma matriz ampla. Isso não transforma automaticamente cada método mockado em propriedade testada.

## 10. Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| Jest carrega este arquivo em content-scripts/popup/reader/shared-ui/integration | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| mesmo blob participa dos jobs Node 20.x e 22.x | run 36577447500 + SHA reconfirmado | 🟨 EXECUTADO INDIRETAMENTE |
| projetos dependentes completam 851/851 testes no run observado | logs 109437162616 e 109437162754 | 🟨 EXECUTADO INDIRETAMENTE |
| `toDataURL()` retorna `data:image/png;base64,TEST_CANVAS` em fluxos reais de content_manga | assertions em `extraction-and-handlers-real.test.js` | ✅ PROVADO DIRETAMENTE |
| `TextEncoder/TextDecoder` são atribuídos e funcionam como contrato próprio do setup | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `scrollTo` é `jest.fn` funcional | setup é executado, mas sem assertion focal do contrato | 🟨 EXECUTADO INDIRETAMENTE |
| guard `__mangaTranslatorMock` evita reinstalação | sem teste de segunda execução/idempotência | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `drawImage` registra chamadas | sem assertion focal localizada sobre este mock padrão | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `getImageData` lança `SecurityError` | sem assertion focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| rAF agenda callback por `setTimeout(0)` e cancelAnimationFrame cancela | sem teste focal desta implementação | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| IntersectionObserver padrão expõe três métodos no-op | consumidores costumam sobrescrevê-lo; sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ResizeObserver padrão expõe três métodos no-op | sem teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| guard sem `window` evita instalação das APIs de navegador | configuração normal usa JSDOM; branch sem prova focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 11. Solicitação ao auditor

### 120-001 — TEST_REQUIRED — OPEN — NORMAL

**Encontrado:** `dom-environment.js` é infraestrutura compartilhada por cinco projetos Jest, mas não existe teste focal do próprio contrato do setup. A única propriedade encontrada com assertion direta é o valor fixo de `toDataURL`, exercitado por testes reais de `content_manga`.

**Arquivo auditado:** `tests/mocks/dom-environment.js`.

**Arquivo externo sugerido:** `tests/unit/test-infra/dom-environment.test.js` ou harness equivalente, se a arquitetura de testes aceitar um projeto dedicado.

**Evidência atual:** o mesmo blob é carregado por suites que passaram em Node 20.x/22.x; `TEST_CANVAS` tem assertions diretas em `extraction-and-handlers-real.test.js`.

**Evidência ausente:** assertions específicas para codecs, `scrollTo`, guard/idempotência do Canvas, `drawImage`, exceção `getImageData`, rAF/cancelamento, IntersectionObserver no-op, ResizeObserver no-op e branch sem `window`.

**Por que a evidência atual é insuficiente:** uma suite dependente pode continuar verde mesmo se uma primitive não usada por seus casos atuais regressar; execução do setup não prova cada contrato instalado.

**Ação esperada do auditor:** decidir se o setup merece uma suíte de contrato focal. Se sim, adicionar testes em mudança separada sem alterar esta Bíblia para fabricar evidência retroativa.

**Evidência esperada:** assertions diretas sobre globals/prototypes instalados, callback/cancelamento de rAF, erro de getImageData, valor de toDataURL, métodos dos observers e idempotência do guard.

**Possível regressão:** uma mudança em infraestrutura de teste pode quebrar ou distorcer futuros testes de DOM de forma difícil de diagnosticar.

**Impacto:** confiabilidade do ambiente Jest compartilhado.

**Severidade:** NORMAL.

## 12. Fonte integral auditada

```js
/**
 * Configura o ambiente JSDOM para mockar APIs que o jsdom não fornece por padrão.
 * Usado como setupFile no Jest para testes que envolvem DOM.
 */

// ── Codecs de texto (necessários para alguns módulos Node/JSDOM) ───
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// ── Mocks de APIs de navegador ─────────────────────────────────────
if (typeof window !== 'undefined') {
  // Scroll
  window.scrollTo = jest.fn();

  // Canvas
  if (window.HTMLCanvasElement && !window.HTMLCanvasElement.prototype.getContext?.__mangaTranslatorMock) {
    const defaultCanvasContext = {
      drawImage: jest.fn(),
      getImageData: () => {
        throw new DOMException('Canvas pixels unavailable in test environment.', 'SecurityError');
      },
    };

    const getContextMock = jest.fn(() => defaultCanvasContext);
    getContextMock.__mangaTranslatorMock = true;

    Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
      value: getContextMock,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', {
      value: jest.fn(() => 'data:image/png;base64,TEST_CANVAS'),
      configurable: true,
      writable: true,
    });
  }

  // Animation frame
  window.requestAnimationFrame  = jest.fn(cb => setTimeout(() => cb(performance.now()), 0));
  window.cancelAnimationFrame   = jest.fn(id => clearTimeout(id));

  // IntersectionObserver
  class IntersectionObserver {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  }
  window.IntersectionObserver = IntersectionObserver;

  // ResizeObserver
  class ResizeObserver {
    observe()    {}
    unobserve()  {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserver;
}

```

## 13. Cobertura linha a linha por faixas contíguas

Todas as 61 posições do blob estão cobertas.

| Linhas | Papel específico | Evidência |
|---:|---|---|
| 1–4 | comentário de propósito do setup JSDOM | estrutural/documental |
| 5 | separador | estrutural |
| 6 | cabeçalho editorial dos codecs | estrutural |
| 7 | importa TextEncoder/TextDecoder de `util` | 🟨 arquivo executado no CI |
| 8–9 | publica codecs em `global` | 🟨 executado; ⚠️ sem assertion focal |
| 10 | separador | estrutural |
| 11 | cabeçalho dos mocks de navegador | estrutural |
| 12 | só instala APIs de browser quando `window` existe | 🟨 caminho JSDOM executado; branch negativo ⚠️ |
| 13–14 | substitui `scrollTo` por spy Jest | 🟨 infraestrutura executada; sem assertion focal |
| 15 | separador | estrutural |
| 16–17 | inicia Canvas e impede reinstalação quando marcador já está presente | ⚠️ idempotência sem teste focal |
| 18–23 | contexto padrão: `drawImage` spy e `getImageData` lança SecurityError | ⚠️ sem assertion direta desses dois contratos |
| 24 | separador | estrutural |
| 25–26 | cria getContext mock e aplica marcador privado | 🟨 getContext é consumido; marcador sem prova focal |
| 27 | separador | estrutural |
| 28–32 | redefine prototype.getContext configurável/writable | 🟨 necessário aos testes passantes |
| 33 | separador | estrutural |
| 34–38 | redefine prototype.toDataURL com `TEST_CANVAS` | ✅ valor provado diretamente em content_manga |
| 39 | fecha guard Canvas | estrutural |
| 40 | separador | estrutural |
| 41–43 | instala rAF via timer zero e cancelamento via clearTimeout | ⚠️ sem teste focal desta implementação |
| 44 | separador | estrutural |
| 45–51 | define/instala IntersectionObserver com observe/unobserve/disconnect no-op | 🟨 disponível nas suites; métodos específicos ⚠️ |
| 52 | separador | estrutural |
| 53–59 | define/instala ResizeObserver com três métodos no-op | 🟨 disponível nas suites; métodos específicos ⚠️ |
| 60 | fecha guard `window` | estrutural |
| 61 | newline final | 🟦 integridade do blob |

## 14. Unidades semânticas

### U01 — linhas 1–9 — bootstrap global

Documenta o objetivo e injeta codecs Node no global de testes.

### U02 — linhas 11–14 — guard e scroll

Restringe mocks browser ao contexto com `window` e neutraliza `scrollTo`.

### U03 — linhas 16–39 — superfície Canvas

Cria um canvas determinístico e propositalmente incompleto: desenho sem efeito real, leitura de pixel bloqueada e serialização constante.

### U04 — linhas 41–43 — scheduler de frame simplificado

Mapeia frame para timer de zero milissegundos, suficiente para progressão assíncrona mas não equivalente ao navegador.

### U05 — linhas 45–51 — observer de interseção mínimo

Garante presença nominal da API sem modelar observação.

### U06 — linhas 53–59 — observer de resize mínimo

Fornece a superfície nominal necessária para consumidores não falharem por ausência da classe.

### U07 — linhas 60–61 — fechamento e integridade

Fecha o bloco condicionado a `window` e preserva o terminador final.

## 15. Trust boundaries e limites

Este arquivo é uma fronteira de simulação. Ao interpretar testes que o usam:

1. `TEST_CANVAS` não é uma imagem PNG validada; é um token Data URL determinístico;
2. `drawImage` não desenha pixels;
3. `getImageData` sempre falha;
4. rAF é um timer, não frame de renderização;
5. observers padrão nunca disparam callbacks;
6. `scrollTo` não muda viewport;
7. testes que sobrescrevem essas APIs passam a provar seu próprio fake local, não o fake deste arquivo;
8. sucesso no JSDOM não substitui evidência E2E de Chromium para APIs de browser reais.

## 16. Autoauditoria do AGENTE 15

- [x] reserva CREATE ONLY criada;
- [x] reserva relida e ownership confirmado;
- [x] `.state/120.json` criado depois da confirmação;
- [x] SHA do fonte reconfirmado antes da escrita;
- [x] fonte integral embutida;
- [x] 60 linhas textuais + newline = 61 posições cobertas;
- [x] `jest.config.js` cruzado para todos os consumidores de setup;
- [x] mesmo blob confirmado no run CI 36577447500;
- [x] jobs Node 20.x e 22.x confirmados com 109/109 suites e 851/851 testes;
- [x] assertions reais de `TEST_CANVAS` verificadas;
- [x] testes que sobrescrevem IntersectionObserver/rAF foram distinguidos da implementação deste setup;
- [x] lacunas não foram promovidas a prova;
- [x] necessidade externa registrada como audit_request;
- [x] nenhum arquivo externo foi modificado.

**Resultado:** Bíblia documentalmente concluída para o blob `9c3bc91608aa52a2d8324fc645c75fac5e4f7452`; a solicitação 120-001 permanece aberta para auditoria separada.

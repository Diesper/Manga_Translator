# Bíblia técnica — tests/unit/content-manga/audio-synthesis.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `f47b6cf91846bfcea634ce1177d7d857ad9cdb46`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** stub Jest de síntese de áudio  
> **Linhas textuais:** 35  
> **Posições documentais:** 36, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é um stub histórico de duas regressões mínimas de `playErrorSound`: a chamada não deve propagar exceção quando a criação do AudioContext falha nem quando nenhum factory explícito é fornecido no ambiente de teste.

A intenção está declarada no cabeçalho: preservar a cobertura mínima anterior à suíte `audio-synthesis-full.test.js`.

A ressalva central é que o teste **não executa `playErrorSound` de `extension/content/content_manga.js`**. Ele importa uma função extraída em `tests/helpers/extracted-functions.js`.

## 2. Cadeia executada e implementação real

```text
audio-synthesis.test.js
  -> repo-root.js
  -> tests/helpers/extracted-functions.js#playErrorSound
```

A implementação de produção está em `extension/content/content_manga.js` (linhas atuais 1140–1153) e não recebe factory.

O helper aceita `audioCtxFactory`; quando presente, chama o factory; quando ausente, usa `window.AudioContext || window.webkitAudioContext`; toda a síntese fica em `try/catch`.

A produção instancia diretamente `new (window.AudioContext || window.webkitAudioContext)()` e também envolve construção/síntese em `try/catch`. A sequência de dois osciladores sawtooth, 300/150 Hz, gains e tempos é estruturalmente equivalente no snapshot auditado, mas a injeção de factory é exclusiva do helper.

## 3. Inclusão no runner

`jest.config.js` inclui `tests/unit/content-manga/**/*.test.js` no projeto `content-scripts`, em `jsdom`. O arquivo não contém `.skip`, `.only` nem `test.todo`.

O import de `fs` na linha 17 não é usado.

## 4. Cenários

### T01 — factory que lança

Linhas 26–29 criam um factory que lança `AudioContext not allowed` e exigem que `playErrorSound(failFactory)` não propague a exceção.

Isso prova diretamente o `catch` do **helper**. A função real não possui parâmetro de factory.

### T02 — sem factory

Linhas 31–34 chamam `playErrorSound()` e exigem `not.toThrow()`. No ambiente esperado sem AudioContext, a construção falha dentro do helper e é absorvida pelo `catch`.

Também aqui a implementação exercitada é o helper, não `content_manga.js`.

## 5. Relação com a suíte completa

`audio-synthesis-full.test.js`, citada por este stub, também importa `playErrorSound` de `tests/helpers/extracted-functions.js`. Além disso, define localmente um `playSuccessSound` espelho.

Assim, a cobertura detalhada da suíte full deve ser classificada como prova dos helpers/mirrors que ela executa, não automaticamente como prova da implementação real do content script.

## 6. Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| arquivo pertence ao projeto content-scripts | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| sem skip/only/todo | fonte + gate de política | 🟦 GATE ESTÁTICO ESPECÍFICO |
| helper engole exceção de factory | linhas 27–28 | ✅ PROVADO DIRETAMENTE — helper |
| helper sem factory não propaga erro | linha 33 | ✅ PROVADO DIRETAMENTE — helper |
| produção real engole falha de AudioContext | código real possui catch, mas este teste não o executa | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| produção usa dois pulsos 300/150 | implementação observada, sem assertion deste stub | ⚠️ SEM PROVA NESTE ARQUIVO |
| helper permanece idêntico à produção | não há gate anti-drift | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Solicitações ao auditor

### 192-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** o stub testa `tests/helpers/extracted-functions.js#playErrorSound`, não a função real de `extension/content/content_manga.js`.

**Evidência atual:** duas assertions diretas provam apenas o helper.

**Evidência ausente:** execução do runtime real sob AudioContext inexistente/constructor que lança.

**Ação solicitada:** em alteração separada, invocar legitimamente a implementação real ou o fluxo real que chama `playErrorSound`, controlando `window.AudioContext`/webkit fallback sem copiar a função.

**Evidência esperada:** teste que falhe se o `catch` real for removido/quebrado.

**Possível regressão:** erro de áudio pode escapar e interromper o fluxo de erro da UI.

**Impacto:** robustez do content script.

**Severidade:** HIGH.

### 192-002 — TEST_AUTHENTICITY — OPEN

**Encontrado:** `audio-synthesis-full.test.js`, apresentado como suíte completa, também usa o helper para `playErrorSound` e um `playSuccessSound` local.

**Evidência atual:** a suíte full possui assertions detalhadas, porém sobre helper/mirror.

**Evidência ausente:** prova de que as rotinas reais executam os mesmos parâmetros e fallbacks.

**Ação solicitada:** revisar a suíte full separadamente e migrar a cobertura relevante para implementação real ou módulo compartilhado canônico.

**Evidência esperada:** ausência de duplicação semântica test-only para o comportamento alegadamente coberto.

**Possível regressão:** frequências, envelopes, número de osciladores ou fallback real podem divergir enquanto testes permanecem verdes.

**Impacto:** confiabilidade da cobertura de áudio.

**Severidade:** HIGH.

## 8. Fonte integral auditada

```js
/**
 * audio-synthesis.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Versão mínima do teste de síntese de áudio.
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM audio-synthesis-full.test.js?
 * Este stub cobre o caso de regressão básico: "playErrorSound não deve
 * lançar exceção quando AudioContext não está disponível". Foi o primeiro
 * teste escrito (v3.0). O arquivo full (v3.1) expande para 20+ testes,
 * mas este stub é mantido como registro histórico da cobertura mínima
 * que foi o ponto de partida.
 *
 * VEJA: audio-synthesis-full.test.js para a suíte completa.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { playErrorSound } = require(path.join(ROOT, 'tests/helpers/extracted-functions.js'));

describe('playErrorSound() — Teste Básico (stub v3.0)', () => {
    test('não lança exceção quando AudioContext falha (factory que lança)', () => {
        const failFactory = () => { throw new Error('AudioContext not allowed'); };
        expect(() => playErrorSound(failFactory)).not.toThrow();
    });

    test('não lança exceção sem factory (usa global)', () => {
        // Em ambiente Node/JSDOM sem AudioContext, deve falhar silenciosamente
        expect(() => playErrorSound()).not.toThrow();
    });
});
```

## 9. Mapa integral de linhas/posições

| Linhas | Papel | Prova |
|---:|---|---|
| 1–14 | histórico e escopo do stub | documental |
| 15 | separador | estrutural |
| 16 | importa `path` | usado |
| 17 | importa `fs` | não usado |
| 18–19 | comentário root finder | documental |
| 20–21 | importa finder e resolve ROOT | executado |
| 22 | separador | estrutural |
| 23 | importa `playErrorSound` do helper | autenticidade limitada |
| 24 | separador | estrutural |
| 25 | abre describe | estrutural |
| 26–29 | T01 factory que lança | ✅ helper |
| 30 | separador | estrutural |
| 31–34 | T02 sem factory | ✅ helper |
| 35 | fecha describe | estrutural |
| posição 36 | newline final | blob confirmado |

## 10. Invariantes e limites

O arquivo impõe somente que a função **importada do helper** não propague exceções nos dois cenários.

Não prova: implementação real, criação bem-sucedida de contexto, dois osciladores, sawtooth, frequências, envelopes, scheduling, webkit fallback real, cleanup do contexto ou som de sucesso.

## 11. Autoauditoria do AGENTE 17

- [x] reserva #192 criada via CREATE ONLY e relida;
- [x] state próprio criado;
- [x] SHA reconfirmado;
- [x] fonte integral incorporada;
- [x] 35 linhas textuais + newline = 36 posições;
- [x] helper, implementação real e suíte full comparados;
- [x] prova do helper separada de prova do runtime;
- [x] duas solicitações externas registradas;
- [x] nenhum código/teste/helper externo modificado.

**Resultado:** documentação concluída para o blob `f47b6cf91846bfcea634ce1177d7d857ad9cdb46`; o stub prova resiliência do helper extraído, não diretamente de `content_manga.js`.

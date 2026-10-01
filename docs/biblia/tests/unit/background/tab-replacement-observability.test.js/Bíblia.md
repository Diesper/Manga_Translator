# Bíblia técnica — tests/unit/background/tab-replacement-observability.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `b5aeb216f48ef28e471233aaa074c86a15561f01`  
> **Agente responsável:** AGENTE 2  
> **Tipo:** suíte Jest focal da semântica de substituição de abas no `ChromeTabsMock`  
> **Linhas textuais:** 36  
> **Posições documentais:** 37, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Este arquivo é uma suíte unitária curta que audita a infraestrutura de testes usada para representar `chrome.tabs.onReplaced`. Seu objeto focal não é a implementação produtiva de `extension/background.js`, e sim o helper `ChromeTabsMock._simulateReplacement` de `tests/mocks/chrome-api.mock.js`.

A distinção é essencial: o teste prova que o **mock** consegue representar uma troca de identidade de aba de forma observável e coerente para outras suítes. Ele não prova, sozinho, que o listener de produção de `background.js` reage corretamente ao evento.

O contrato validado é composto por quatro propriedades:

1. a aba antiga sai do mapa e a nova entra com o novo id;
2. atributos relevantes da aba, aqui URL e `active`, são preservados;
3. `onReplaced` é emitido exatamente uma vez com assinatura `(newTabId, oldTabId)`;
4. handlers de mensagem registrados no id antigo continuam atendendo mensagens no id novo.

## 2. Dependências e integração no runner

### 2.1 `tests/mocks/chrome-api.mock.js`

O mock auditado estava no SHA `c1d9a056b7777183bfd3f540c49811335f410425` durante esta investigação.

A implementação focal está em torno de `_simulateReplacement` e executa, em ordem:

- valida existência da aba antiga;
- rejeita substituição para o mesmo id;
- rejeita colisão quando o id novo já existe;
- clona a aba antiga alterando apenas `id`;
- remove a entrada antiga e grava a nova;
- move o array de handlers de mensagem do id antigo para o novo;
- percorre listeners de `onReplaced` com `(newTabId, oldTabId)`;
- retorna a nova aba.

O arquivo desta Bíblia cobre o caminho nominal dessa implementação, mas não cobre todos os guards.

### 2.2 `jest.config.js`

O projeto Jest `background` usa `testMatch: ['<rootDir>/tests/unit/background/**/*.test.js']`, portanto esta suíte pertence diretamente ao inventário unitário de background. O mesmo projeto instala `tests/mocks/chrome-api.mock.js` em `setupFilesAfterEnv`.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO para inclusão estrutural da suíte e do mock.

### 2.3 `package.json` e CI

`npm run test:unit:background` seleciona o projeto `background`; `npm run test:unit` também o inclui. O workflow `.github/workflows/ci.yml` executa `npm run test:ci` no job `unit-and-integration` para Node 20.x e 22.x.

Durante esta auditoria, o head observado possuía o workflow run **2875 / 36733799276** em estado `pending`. Por isso esse run não é usado como prova de sucesso. A força probatória desta Bíblia deriva das assertions presentes no arquivo e da inspeção da implementação real do mock, não de um resultado CI ainda inconclusivo.

## 3. Relação com o runtime produtivo

`extension/background.js` registra `chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => ...)`, produz o log `TAB_REPLACED` e chama `initializeTabIdentity().recordReplacement(addedTabId, removedTabId)`.

Esta suíte mantém a assinatura do mock compatível com essa API — `new` antes de `old` —, mas **não carrega o background real**, não observa `TAB_REPLACED` e não verifica a chamada a `recordReplacement`.

Consequentemente:

- ordem do evento **no mock**: ✅ PROVADO DIRETAMENTE;
- wiring do listener **no background real**: ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO localizado por esta auditoria.

## 4. Cenário `PR0-TAB`

O único teste cria uma aba Gemini inativa, instala um spy de `onReplaced` e registra um handler de mensagem no id original. Depois escolhe um `replacementId` explícito e invoca `_simulateReplacement`.

As assertions provam:

- retorno com o novo id;
- `tabs.get(oldId) === null`;
- `tabs.get(newId)` preservando id, URL e `active:false`;
- listener chamado uma única vez;
- listener chamado exatamente com `(replacementId, original.id)`;
- envio de mensagem ao id novo alcança o handler registrado antes no id antigo.

A última assertion é especialmente importante: ela não se limita a verificar mapas de tabs, mas exige que a migração do roteamento de mensagens seja funcional após a troca.

## 5. Matriz de evidência

| Contrato | Evidência existente | Classificação |
|---|---|---|
| a aba antiga é removida após replacement | `tabs.get(original.id) -> null` | ✅ PROVADO DIRETAMENTE |
| a nova aba usa `replacementId` | retorno + `tabs.get(replacementId)` | ✅ PROVADO DIRETAMENTE |
| URL é preservada | `url: original.url` | ✅ PROVADO DIRETAMENTE |
| estado `active:false` é preservado | `active: false` | ✅ PROVADO DIRETAMENTE |
| `onReplaced` emite uma vez | `toHaveBeenCalledTimes(1)` | ✅ PROVADO DIRETAMENTE |
| assinatura do evento é `(new, old)` | `toHaveBeenCalledWith(replacementId, original.id)` | ✅ PROVADO DIRETAMENTE |
| handler do old id atende no new id | `sendMessage(newId)` + handler chamado uma vez | ✅ PROVADO DIRETAMENTE |
| callback de `sendMessage` é chamado | callback é criado, mas não possui assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| payload `{action:'PING'}` chega intacto ao handler | handler só é contado; argumentos não são verificados | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| old id é removido também de `_messageHandlers` | comportamento existe no mock, mas não há assertion direta sobre ausência da chave antiga | 🟨 EXECUTADO INDIRETAMENTE |
| old tab ausente é rejeitado sem mutação | guard existe no mock | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `oldTabId === newTabId` é rejeitado | guard existe no mock | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| colisão com `newTabId` existente é rejeitada | guard existe no mock | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| argumento `newTabId` omitido usa `_nextTabId++` corretamente | caminho default não é exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| background real registra `TAB_REPLACED` e inicia rekey | apenas inspeção do source de `background.js`; esta suíte não o carrega | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Invariantes e casos-limite

### Invariantes provados

- depois do replacement nominal, o old id não identifica mais uma aba;
- o objeto novo preserva propriedades da aba antiga salvo o id;
- o evento é síncrono no helper e recebe `newTabId` antes de `oldTabId`;
- o handler registrado antes da troca continua alcançável pelo id novo.

### Casos-limite não provados

- replacement de tab inexistente;
- replacement para o próprio id;
- replacement para id já ocupado;
- alocação automática do novo id;
- comportamento quando existem múltiplos handlers;
- comportamento quando existem múltiplos listeners;
- remoção posterior de listener;
- callback e argumentos completos de `sendMessage`;
- limpeza explícita da chave antiga em `_messageHandlers`;
- wiring de produção de `chrome.tabs.onReplaced`.

## 7. Riscos

O risco principal é um **falso verde de infraestrutura**: a suíte pode continuar passando mesmo que branches de erro do mock deixem de proteger colisões ou se a tabela de handlers retenha uma entrada stale no id antigo. Isso pode mascarar problemas de isolamento entre testes e produzir comportamento diferente do Chrome real.

Há também um limite de escopo: a presença desta suíte pode ser interpretada incorretamente como prova do pipeline produtivo de rekey. Ela não é. O teste valida a fidelidade mínima do mock; a reação de `background.js` exige teste focal próprio.

## 8. Solicitações ao auditor

### 171-001 — TEST_REQUIRED — ACCEPTED — NORMAL

**Encontrado:** `ChromeTabsMock._simulateReplacement` possui três guards explícitos — old tab ausente, old/new iguais e target já existente — que não são exercitados por esta suíte.

**Evidência atual:** apenas o caminho nominal é executado.

**Evidência ausente:** assertions que exijam erro específico para cada guard e confirmem que tabs, handlers e listeners não sofrem mutação parcial.

**Arquivo relacionado:** `tests/unit/background/tab-replacement-observability.test.js`.

**Ação solicitada:** adicionar casos negativos usando a implementação real de `ChromeTabsMock`.

**Possível regressão:** colisão ou input inválido pode corromper o mapa do mock e contaminar testes seguintes sem que esta suíte falhe.

### 171-002 — TEST_REQUIRED — ACCEPTED — NORMAL

**Encontrado:** a suíte prova que o handler funciona no novo id, porém não prova diretamente a remoção da chave antiga de `_messageHandlers`, nem o caminho que omite `newTabId` e depende de `_nextTabId++`.

**Evidência atual:** `handler` é chamado uma vez após `sendMessage(replacementId, ...)`.

**Evidência ausente:** confirmar ausência do registro antigo, presença exclusiva no novo id e alocação automática sem colisão quando o segundo argumento é omitido.

**Arquivo relacionado:** `tests/unit/background/tab-replacement-observability.test.js`.

**Ação solicitada:** ampliar a suíte com assertions focais sobre cleanup de handlers e alocador default.

**Possível regressão:** retenção de handler stale pode gerar leak/duplicidade entre casos; alocação automática defeituosa pode criar colisões artificiais.

### 171-003 — INTEGRATION_TEST_REQUIRED — SUPERSEDED → 002-005 — HIGH

**Encontrado:** `extension/background.js` consome `chrome.tabs.onReplaced`, registra `TAB_REPLACED` e chama `recordReplacement(addedTabId, removedTabId)`, mas esta suíte testa somente o evento do mock.

**Evidência atual:** inspeção estática do background e prova direta de que o mock emite `(new, old)`.

**Evidência ausente:** carregar a implementação real de background, disparar uma substituição pelo mock e verificar o efeito observável do listener real, incluindo ordem dos ids e início do rekey/alias.

**Arquivo relacionado:** `tests/unit/background/tab-replacement-observability.test.js` (ou suíte de background equivalente, se a arquitetura de isolamento exigir).

**Ação solicitada:** adicionar teste de integração/unitário focal que use o background real, sem copiar a lógica do listener.

**Possível regressão:** o wiring produtivo pode ser removido, inverter ids ou deixar de iniciar a migração enquanto esta suíte continua verde.

## 9. Fonte integral auditada

```javascript
'use strict';

require('../../mocks/chrome-api.mock.js');
const { getTabsMock } = require('../../mocks/chrome-api.mock.js');

describe('ChromeTabsMock tab replacement observability', () => {
  test('PR0-TAB: _simulateReplacement transfere a aba e dispara onReplaced(new, old)', async () => {
    const tabs = getTabsMock();
    const original = await tabs.create({
      url: 'https://gemini.google.com/app?mangatranslator=true',
      active: false,
    });
    const listener = jest.fn();
    const handler = jest.fn();

    tabs.onReplaced.addListener(listener);
    tabs._registerMessageHandler(original.id, handler);

    const replacementId = original.id + 100;
    const replaced = tabs._simulateReplacement(original.id, replacementId);

    expect(replaced.id).toBe(replacementId);
    await expect(tabs.get(original.id)).resolves.toBeNull();
    await expect(tabs.get(replacementId)).resolves.toMatchObject({
      id: replacementId,
      url: original.url,
      active: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(replacementId, original.id);

    const callback = jest.fn();
    tabs.sendMessage(replacementId, { action: 'PING' }, callback);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

## 10. Auditoria linha a linha

### Posição 001

- **Código:** 'use strict';
- **Função:** Ativa strict mode para todo o módulo de teste; não é o comportamento focal, mas define a semântica JavaScript da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 002

- **Código:** *(linha vazia)*
- **Função:** Separa a diretiva de modo estrito dos imports, sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 003

- **Código:** require('../../mocks/chrome-api.mock.js');
- **Função:** Carrega explicitamente o mock de Chrome. O módulo inicializa `global.chrome` e registra hooks Jest; em execução pelo projeto `background` ele também já é `setupFilesAfterEnv`, então esta importação é redundante mas torna a dependência explícita.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO

### Posição 004

- **Código:** const { getTabsMock } = require('../../mocks/chrome-api.mock.js');
- **Função:** Obtém a fábrica/acessor do singleton `ChromeTabsMock` usado como objeto sob teste.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO

### Posição 005

- **Código:** *(linha vazia)*
- **Função:** Separa imports do bloco de especificação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 006

- **Código:** describe('ChromeTabsMock tab replacement observability', () => {
- **Função:** Agrupa o contrato focal de observabilidade de substituição de aba do mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 007

- **Código:** test('PR0-TAB: _simulateReplacement transfere a aba e dispara onReplaced(new, old)', async () => {
- **Função:** Declara o único caso da suíte: caminho nominal de `_simulateReplacement`, preservação da aba, ordem do evento e transferência do handler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 008

- **Código:** const tabs = getTabsMock();
- **Função:** Obtém a instância real do mock instalada em `global.chrome.tabs`; todas as assertions seguintes atuam nessa implementação real de teste.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 009

- **Código:** const original = await tabs.create({
- **Função:** Cria a aba de origem usando `ChromeTabsMock.create`, estabelecendo o estado que será substituído.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 010

- **Código:** url: 'https://gemini.google.com/app?mangatranslator=true',
- **Função:** Define uma URL Gemini representativa; sua preservação é verificada depois por comparação com `original.url`.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 011

- **Código:** active: false,
- **Função:** Força aba inativa para provar que a substituição não sobrescreve esse atributo; a linha 27 verifica `active: false`.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 012

- **Código:** });
- **Função:** Fecha a criação da aba original e recebe a Promise resolvida pelo mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 013

- **Código:** const listener = jest.fn();
- **Função:** Cria spy para medir emissão de `tabs.onReplaced`.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 014

- **Código:** const handler = jest.fn();
- **Função:** Cria spy de mensagem associado à aba antiga para verificar migração do registro de handlers.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 015

- **Código:** *(linha vazia)*
- **Função:** Separa preparação da aba da instalação dos observadores.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 016

- **Código:** tabs.onReplaced.addListener(listener);
- **Função:** Registra o listener no array interno `_onReplacedListeners`; as linhas 29–30 provam chamada única e ordem `(new, old)`.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 017

- **Código:** tabs._registerMessageHandler(original.id, handler);
- **Função:** Associa o handler ao `tabId` antigo; a linha 34 prova que ele continua acessível após o rekey para o novo id.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 018

- **Código:** *(linha vazia)*
- **Função:** Separa setup da ação focal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 019

- **Código:** const replacementId = original.id + 100;
- **Função:** Escolhe explicitamente um id novo diferente e previsível, evitando depender do alocador implícito `_nextTabId`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 020

- **Código:** const replaced = tabs._simulateReplacement(original.id, replacementId);
- **Função:** Executa a implementação real do helper do mock. No estado atual ela copia a aba, remove old id, instala new id, transfere handlers, emite `onReplaced(new, old)` e retorna a nova aba.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 021

- **Código:** *(linha vazia)*
- **Função:** Separa execução das assertions de estado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 022

- **Código:** expect(replaced.id).toBe(replacementId);
- **Função:** Prova que o objeto retornado é reidentificado com o id de substituição.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 023

- **Código:** await expect(tabs.get(original.id)).resolves.toBeNull();
- **Função:** Prova que a aba antiga deixou o mapa de tabs após a substituição.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 024

- **Código:** await expect(tabs.get(replacementId)).resolves.toMatchObject({
- **Função:** Abre assertion estrutural sobre a aba instalada no id novo.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 025

- **Código:** id: replacementId,
- **Função:** Prova que a chave consultada e o campo `id` da aba nova concordam.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 026

- **Código:** url: original.url,
- **Função:** Prova preservação da URL original através da substituição.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 027

- **Código:** active: false,
- **Função:** Prova preservação do estado inativo configurado na aba original.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 028

- **Código:** });
- **Função:** Fecha a assertion parcial; campos como `status` e `title` não são exigidos por este teste.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 029

- **Código:** expect(listener).toHaveBeenCalledTimes(1);
- **Função:** Prova que o evento de substituição é emitido exatamente uma vez no cenário nominal.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 030

- **Código:** expect(listener).toHaveBeenCalledWith(replacementId, original.id);
- **Função:** Prova a ordem semântica do mock: primeiro `newTabId`, depois `oldTabId`, igual à assinatura `chrome.tabs.onReplaced`.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 031

- **Código:** *(linha vazia)*
- **Função:** Separa prova do evento da prova de migração de handlers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 032

- **Código:** const callback = jest.fn();
- **Função:** Cria callback para `tabs.sendMessage`; sua invocação não é assertada, portanto ele apenas completa a chamada da API simulada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 033

- **Código:** tabs.sendMessage(replacementId, { action: 'PING' }, callback);
- **Função:** Envia mensagem ao novo id. Isso força consulta do mapa de handlers após a substituição; o payload e o callback não recebem assertions próprias.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 034

- **Código:** expect(handler).toHaveBeenCalledTimes(1);
- **Função:** Prova que o handler originalmente registrado no old id foi transferido para o new id e é acionável depois do replacement.
- **Evidência:** ✅ PROVADO DIRETAMENTE

### Posição 035

- **Código:** });
- **Função:** Fecha o caso `PR0-TAB`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 036

- **Código:** });
- **Função:** Fecha o `describe` da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

### Posição 037

- **Código:** *(newline final)*
- **Função:** Posição terminal vazia preservada porque o arquivo termina com LF; não possui semântica de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE

## 11. Autoauditoria documental

- SHA da fonte reconfirmado imediatamente antes da materialização: `b5aeb216f48ef28e471233aaa074c86a15561f01`.
- 36 linhas textuais + newline final = **37/37 posições documentadas**.
- A fonte integral acima é o conteúdo do blob auditado, sem reconstrução manual.
- Dependência focal `chrome-api.mock.js` foi lida no trecho real de `_simulateReplacement`.
- `jest.config.js`, `package.json`, workflow CI e consumidor produtivo `background.js` foram cruzados em modo somente leitura.
- Prova direta, gate estático, execução indireta e ausência de prova foram separados explicitamente.
- Nenhum código, teste, fixture, workflow ou configuração foi alterado para fabricar evidência.
- O workflow do head estava pendente durante a auditoria; nenhum resultado pendente foi promovido a evidência de sucesso.
- As lacunas externas foram persistidas como `audit_requests` e não impedem a conclusão documental desta Bíblia.

## 12. Conclusão

A suíte é pequena, mas exerce um contrato importante da infraestrutura: o mock de tabs representa o replacement nominal com reidentificação da aba, ordem correta de `onReplaced` e continuidade de mensagens. Esse comportamento está **provado diretamente** pelas assertions existentes.

Os guards do helper e o wiring do background real permanecem sem prova automatizada focal nesta investigação. A Bíblia documenta essa diferença sem atribuir à suíte uma cobertura que ela não possui.

> **Lifecycle pós-adversarial:** 171-001 e 171-002 estão ACCEPTED; 171-003 está SUPERSEDED por `002-005`, que concentra a lacuna de wiring real `chrome.tabs.onReplaced -> recordReplacement`.

# Bíblia técnica — `extension/manifest.json`

> **Estado:** CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA em 2026-09-29.  
> **Arquivo-fonte:** `extension/manifest.json`  
> **SHA do conteúdo auditado:** `841fe70c183350e4110bc8ff57ab69b157169c36`  
> **Linhas auditadas:** 75 linhas de conteúdo + newline final.  
> **Formato:** JSON — Manifest V3 de extensão Chromium.  
> **Escopo desta Bíblia:** somente este arquivo. Nenhum outro arquivo é considerado documentado por associação.

---

## 1. Papel arquitetural

`extension/manifest.json` é o contrato de instalação da extensão. O Chromium o lê **antes** de qualquer JavaScript da aplicação ser executado. Ele decide quais superfícies existem, quais arquivos podem iniciar automaticamente, quais privilégios o runtime recebe e em quais páginas cada content script pode ser injetado.

Isso torna este arquivo diferente de um módulo JavaScript comum:

- uma alteração aqui pode impedir a extensão inteira de carregar antes de existir qualquer log do projeto;
- permissões ausentes podem fazer APIs válidas falharem em runtime;
- permissões amplas demais aumentam superfície de privilégio e revisão;
- a ordem de `content_scripts[].js` é parte do contrato, porque arquivos posteriores dependem de símbolos inicializados pelos anteriores;
- `world` e `run_at` alteram **onde** e **quando** o código é executado, não apenas sua aparência declarativa;
- caminhos relativos são resolvidos dentro do pacote da extensão e, portanto, precisam acompanhar a estrutura física do repositório.

O Manifest não contém lógica de negócio, mas determina se a lógica de negócio consegue existir no navegador.

---

## 2. Fonte integral auditada

```json
{
  "manifest_version": 3,
  "name": "Manga Translator",
  "version": "6.5",
  "description": "Tradução de mangá usando Gemini com cache perceptual visual, armazenamento transacional em IndexedDB e controles de substituição automática.",
  "permissions": [
    "tabs",
    "scripting",
    "storage",
    "unlimitedStorage",
    "downloads",
    "windows",
    "alarms",
    "contextMenus"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "action": {
    "default_popup": "popup/popup.html"
  },
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "<all_urls>"
      ],
      "js": [
        "shared/gtc-fingerprint.js",
        "content/cm-gtc-client.js",
        "content/cm-dom-replace.js",
        "content/cm-chapter.js",
        "content/cm-auto-restore.js",
        "content/content_manga.js"
      ]
    },
    {
      "matches": [
        "https://gemini.google.com/*",
        "http://127.0.0.1/*"
      ],
      "js": [
        "content/inject.js"
      ],
      "world": "MAIN",
      "run_at": "document_start"
    },
    {
      "matches": [
        "https://gemini.google.com/*",
        "http://127.0.0.1/*"
      ],
      "js": [
        "content/gemini/selectors.js",
        "content/gemini/dom.js",
        "content/gemini/image-quarantine.js",
        "content/gemini/observer.js",
        "content/gemini/editor.js",
        "content/gemini/attachment.js",
        "content/gemini/temporary-chat.js",
        "content/gemini/result-extractor.js",
        "content/gemini/deletion.js",
        "content/gemini/job-runner.js",
        "content/content_gemini.js"
      ],
      "run_at": "document_idle"
    }
  ]
}
```

---

## 3. Dependências e consumidores deste arquivo

### 3.1 Consumidor primário: Chromium

O primeiro consumidor é o carregador de extensões Chromium. Ele interpreta chaves MV3, cria a action, registra a página de opções, inicializa o Service Worker e instala as regras declarativas de content scripts.

### 3.2 Consumidores do repositório

- `scripts/validation/validate-manifest.js` lê o JSON, exige campos básicos e exige `manifest_version === 3`.
- `scripts/release/sync-version.js` compara e sincroniza `manifest.version` com a versão derivada de `package.json`.
- `scripts/validation/verify-repository-structure.js` exige caminhos canônicos de popup, options e background e compara exatamente as listas `content_scripts[].js`.
- `tests/unit/manifest/surface-reduction.test.js` verifica a política de superfície exposta e exige `host_permissions === ['<all_urls>']`.
- `tests/e2e/translation-flow.spec.js` carrega a pasta `extension/` como extensão Chromium real, observa o Service Worker e executa o fluxo em `localhost`/mock Gemini. Isso fornece evidência runtime **indireta** de vários contratos do Manifest, mas não substitui assertions específicas de cada chave.

### 3.3 Regra de evidência desta Bíblia

Os rótulos abaixo são deliberadamente conservadores:

- **✅ PROVADO ESPECIFICAMENTE** — existe assertion/gate que compara diretamente este contrato.
- **🟦 GATE ESTÁTICO ESPECÍFICO** — um validador falha se este valor/caminho/lista mudar; prova o contrato de configuração, não necessariamente todo comportamento runtime.
- **🟨 EXECUTADO INDIRETAMENTE** — E2E/runtime depende do contrato, mas não existe assertion isolada provando a propriedade.
- **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizada prova suficientemente ligada ao valor/comportamento. Mera menção textual não conta.

---

# 4. Auditoria linha por linha

## Linha 1 — `{`

Abre o objeto raiz do Manifest. O Chromium exige que o arquivo seja JSON válido e que as propriedades MV3 estejam no objeto superior. Não é uma decisão de negócio isolada, mas é estruturalmente indispensável: trocar por array ou introduzir sintaxe JavaScript tornaria o arquivo inválido antes da extensão carregar.

**Evidência:** ✅ o arquivo é parseado com `JSON.parse` por `validate-manifest.js`, `sync-version.js` e testes; o carregamento E2E pelo Chromium também falharia se o JSON fosse inválido.

## Linha 2 — `"manifest_version": 3,`

Declara o esquema Manifest V3. Isso seleciona o modelo de Service Worker, políticas de segurança e semântica de APIs usadas pelo restante do projeto. Usar MV2 não seria uma mudança cosmética: o background atual está arquitetado como Service Worker MV3, com reidratação e persistência para sobreviver à suspensão.

**Evidência:** ✅ **PROVADO ESPECIFICAMENTE** por `scripts/validation/validate-manifest.js`, que encerra com erro se o valor não for exatamente `3`.

## Linha 3 — `"name": "Manga Translator",`

Define o nome público exibido pelo navegador. O campo é obrigatório e sua existência é validada. O texto exato também funciona como identidade humana do pacote, mas não participa do roteamento interno.

**Evidência:** 🟦 `validate-manifest.js` prova que `name` existe.  
**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor literal `"Manga Translator"`.** Alterar o texto para outro valor não é hoje barrado por assertion dedicada.

## Linha 4 — `"version": "6.5",`

É a versão aceita pelo Manifest Chromium. Neste projeto ela é derivada da fonte manual `package.json#version = 6.5.0`; patch zero é representado como `6.5`. A separação evita manter duas versões manualmente.

**Evidência:** ✅ **PROVADO ESPECIFICAMENTE em composição:** `version:check` usa `sync-version.js` para comparar o valor real do Manifest com a versão derivada; `tests/unit/background/version-sync.test.js` prova que `6.5.0` deriva `6.5`.

## Linha 5 — `"description": "...",`

Fornece a descrição pública do produto. Resume Gemini, cache perceptual, IndexedDB e substituição automática. Ela não habilita esses recursos; apenas descreve-os ao navegador/usuário.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.** Não há assertion que compare a descrição ou garanta que ela permaneça semanticamente sincronizada às funcionalidades.

## Linha 6 — `"permissions": [`

Inicia a lista de permissões de API. `validate-manifest.js` exige que a propriedade exista, mas não prova seu conteúdo. A lista precisa permanecer mínima o suficiente para reduzir privilégio e ampla o bastante para suportar o runtime.

**Evidência:** 🟦 existência do campo é validada.  
**⚠️ O conjunto completo não possui assertion exata dedicada.**

## Linha 7 — `"tabs",`

Autoriza operações relacionadas a abas que o Service Worker usa para localizar, criar, atualizar e coordenar páginas de mangá/Gemini. Remover a permissão pode quebrar fluxos de orquestração mesmo que mocks unitários continuem verdes, porque mocks não reproduzem enforcement de permissão do Chromium.

**Evidência:** 🟨 fluxos E2E usam extensão real e manipulação de abas.  
**⚠️ SEM assertion específica que exija `permissions` conter `tabs`.**

## Linha 8 — `"scripting",`

Autoriza a API `chrome.scripting`, necessária quando o projeto injeta/coordena código fora do content-script puramente declarativo. É uma permissão privilegiada; removê-la pode falhar somente em caminhos que realmente chamem a API.

**Evidência:** 🟨 há runtime da extensão e código que usa APIs Chromium.  
**⚠️ SEM teste específico do item `scripting` no Manifest.**

## Linha 9 — `"storage",`

Autoriza `chrome.storage`. O projeto usa storage para configuração, estado durável, logs e coordenação entre contextos. O E2E chama `chrome.storage.local.clear/set` no Service Worker real, o que torna esta permissão operacionalmente relevante.

**Evidência:** 🟨 `translation-flow.spec.js` usa `chrome.storage.local` no contexto real da extensão.  
**⚠️ Não existe assertion isolada verificando que o Manifest contém a string `storage`.**

## Linha 10 — `"unlimitedStorage",`

Solicita quota ampliada para persistência. Faz sentido porque páginas, traduções/cache e metadados podem crescer além de preferências pequenas. Removê-la pode não quebrar testes curtos, mas pode alterar comportamento sob volume real.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.** Não há teste de quota que demonstre a necessidade nem assertion que preserve esta permissão.

## Linha 11 — `"downloads",`

Autoriza a API de downloads usada nos fluxos de salvar imagens/capítulos/exportações. Testes unitários exercitam lógica de downloads com mocks, mas mocks não verificam a permissão declarada.

**Evidência:** 🟨 comportamento de download é testado em módulos/background.  
**⚠️ SEM assertion do Manifest exigindo `downloads`.**

## Linha 12 — `"windows",`

Autoriza operações de janela. O projeto possui fluxos que trabalham com ativação/foco e abas/janelas. Retirar o privilégio pode atingir caminhos específicos sem ser detectado por testes mockados.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO da presença de `windows`.**

## Linha 13 — `"alarms",`

Autoriza `chrome.alarms`, importante para watchdogs e trabalho persistente compatível com a suspensão do Service Worker MV3. Usar apenas timers em memória seria pior porque eles não sobrevivem às mesmas condições de lifecycle.

**Evidência:** 🟨 existem testes de lifecycle/watchdog e uso real de `chrome.alarms`, porém executados com mocks para a maior parte do comportamento.  
**⚠️ SEM assertion específica da permissão `alarms` no Manifest.**

## Linha 14 — `"contextMenus"`

Autoriza o menu de contexto nativo usado pela tradução de uma imagem via clique direito. A implementação tem testes unitários dedicados ao comportamento do menu, mas a permissão em si não é comparada.

**Evidência:** 🟨 `tests/unit/background/single-image-context-menu.test.js` prova lógica associada ao menu.  
**⚠️ SEM assertion específica que falhe se `contextMenus` for removido do Manifest.**

## Linha 15 — `],`

Fecha `permissions`. A vírgula permite a propriedade seguinte. Alterar delimitadores quebraria o parse JSON.

**Evidência:** ✅ validade sintática é exercitada por `JSON.parse` e pelo carregamento Chromium.

## Linha 16 — `"host_permissions": [`

Inicia as permissões de host. Esse domínio de permissão é separado das permissões de API e define onde a extensão pode obter privilégios de host necessários ao seu propósito.

**Evidência:** ✅ o conteúdo completo desta lista é comparado no teste de Manifest das linhas 17–18.

## Linha 17 — `"<all_urls>"`

Autoriza hosts arbitrários. Isso é deliberado porque leitores de mangá podem existir em qualquer domínio; limitar a uma lista fixa impediria o produto de funcionar genericamente. O custo é uma superfície ampla, então a redução de recursos expostos e o escopo dos scripts Gemini se tornam particularmente importantes.

**Evidência:** ✅ **PROVADO ESPECIFICAMENTE** por `tests/unit/manifest/surface-reduction.test.js`, que exige exatamente `['<all_urls>']`.

## Linha 18 — `],`

Fecha `host_permissions`. Aqui a estrutura e o conjunto de um único item fazem parte da equality assertion do teste.

**Evidência:** ✅ coberta pela comparação exata de toda a lista.

## Linha 19 — `"action": {`

Declara a action da extensão — a superfície acionada pelo botão/ícone do navegador. Neste projeto ela encaminha para o popup.

**Evidência:** 🟦 o gate estrutural valida o `default_popup` interno. A existência do objeto é necessária para esse acesso.

## Linha 20 — `"default_popup": "popup/popup.html"`

Liga a action à página canônica do popup após a reestruturação. Manter o caminho aqui evita voltar ao antigo layout plano e garante que o bundle instalado abra a UI correta.

**Evidência:** 🟦 **GATE ESTÁTICO ESPECÍFICO** em `verify-repository-structure.js`: qualquer valor diferente de `popup/popup.html` gera erro.

## Linha 21 — `},`

Fecha `action`.

**Evidência:** ✅ parse JSON/Manifest; sem comportamento independente além da estrutura.

## Linha 22 — `"options_ui": {`

Declara a página de opções e suas características de abertura.

**Evidência:** 🟦 o caminho `page` é validado; o objeto é necessário para o contrato.

## Linha 23 — `"page": "options/options.html",`

Aponta para a UI canônica de configuração após a reorganização da extensão.

**Evidência:** 🟦 **GATE ESTÁTICO ESPECÍFICO** em `verify-repository-structure.js`, que exige exatamente `options/options.html`.

## Linha 24 — `"open_in_tab": true`

Pede que a página de opções abra em uma aba, não em uma superfície embutida/alternativa. Isso afeta experiência e espaço disponível à UI.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.** Nenhum teste localizado exige `true` nem valida a forma de abertura produzida pelo Manifest.

## Linha 25 — `},`

Fecha `options_ui`.

**Evidência:** ✅ sintaxe/parse; sem assertion funcional isolada.

## Linha 26 — `"background": {`

Inicia o contrato do background MV3.

**Evidência:** 🟦 o campo interno `service_worker` é validado e o E2E observa um Service Worker real.

## Linha 27 — `"service_worker": "background.js"`

Define `extension/background.js` como entrypoint do Service Worker. O projeto deliberadamente mantém esse arquivo na raiz da extensão como bootstrap estável, enquanto implementação modular fica em `background/`.

**Evidência:** 🟦 **GATE ESTÁTICO ESPECÍFICO** exige exatamente `background.js`.  
**Evidência runtime adicional:** 🟨 o E2E espera e usa o Service Worker carregado da extensão real.

## Linha 28 — `},`

Fecha `background`.

**Evidência:** ✅ parse/instalação real; sem comportamento isolado.

## Linha 29 — `"content_scripts": [`

Inicia os três grupos de scripts declarativos. A separação é arquitetural: página de mangá genérica, script MAIN antecipado do Gemini e automação Gemini isolada em `document_idle`.

**Evidência:** 🟦 o gate estrutural compara exatamente as três listas `js`, inclusive quantidade e ordem.  
**⚠️ O gate não compara todos os campos `matches/world/run_at`.**

## Linha 30 — primeiro objeto `{`

Abre o grupo de scripts de página de mangá, destinado a hosts arbitrários.

**Evidência:** 🟨 estrutura é necessária para o E2E carregar o content script em localhost; lista JS é validada estaticamente.

## Linha 31 — `"matches": [`

Inicia os padrões de URL do grupo de mangá.

**⚠️ SEM assertion específica para esta chave neste grupo.**

## Linha 32 — `"<all_urls>"`

Faz o content script de detecção/tradução estar disponível em leitores de mangá hospedados em qualquer site. Isso é coerente com `host_permissions` amplo, mas são contratos diferentes: um concede host access; o outro agenda injeção declarativa.

**Evidência:** 🟨 `translation-flow.spec.js` abre `http://localhost:3999/manga-page.html` e espera o botão do content script, provando runtime em pelo menos esse host.  
**⚠️ Não existe assertion que compare literalmente `content_scripts[0].matches` com `['<all_urls>']`.**

## Linha 33 — `],`

Fecha os matches do primeiro grupo.

**Evidência:** ✅ sintaxe; conteúdo apenas indiretamente exercitado.

## Linha 34 — `"js": [`

Inicia a cadeia ordenada de módulos injetados na página de mangá. A ordem é relevante porque o orquestrador final consome capacidades definidas anteriormente.

**Evidência:** 🟦 o gate compara a lista completa e a ordem exata.

## Linha 35 — `"shared/gtc-fingerprint.js",`

Carrega primeiro os algoritmos compartilhados de fingerprint necessários ao cliente GTC e ao fluxo de reconhecimento/cache.

**Evidência:** 🟦 o caminho e posição são exigidos pela equality do gate estrutural.  
A funcionalidade interna do arquivo terá sua própria Bíblia; esta linha prova apenas wiring.

## Linha 36 — `"content/cm-gtc-client.js",`

Instala o cliente de cache/tradução global depois do fingerprint compartilhado.

**Evidência:** 🟦 caminho/ordem exigidos pelo gate. O E2E fornece execução indireta do pipeline, não assertion deste item isolado.

## Linha 37 — `"content/cm-dom-replace.js",`

Disponibiliza a camada de descoberta/substituição de imagens no DOM.

**Evidência:** 🟦 caminho/ordem exigidos pelo gate; 🟨 E2E verifica substituição final de imagens.

## Linha 38 — `"content/cm-chapter.js",`

Carrega identidade e persistência de capítulo antes do orquestrador principal.

**Evidência:** 🟦 caminho/ordem exigidos pelo gate; comportamento interno pertence à Bíblia desse módulo.

## Linha 39 — `"content/cm-auto-restore.js",`

Carrega restauração automática de traduções antes do entrypoint de conteúdo.

**Evidência:** 🟦 caminho/ordem exigidos pelo gate; testes próprios do módulo existem, mas não são prova de que o Manifest necessariamente o injeta.

## Linha 40 — `"content/content_manga.js"`

Carrega por último o orquestrador da página de mangá, depois das dependências que ele espera encontrar.

**Evidência:** 🟦 caminho/posição exigidos pelo gate; 🟨 E2E observa UI e tradução originadas do content script real.

## Linha 41 — `]`

Fecha a lista JavaScript do primeiro grupo.

**Evidência:** 🟦 a equality do array no gate cobre sua composição integral.

## Linha 42 — `},`

Fecha o primeiro descriptor de content script.

**Evidência:** ✅ estrutura parseável; runtime E2E indireto.

## Linha 43 — segundo objeto `{`

Abre o grupo especial de `inject.js`. Ele é separado do automation content script porque precisa rodar no **MAIN world** e muito cedo.

**Evidência:** 🟨 o fluxo E2E carrega a extensão real; os atributos exatos deste descriptor não possuem teste completo.

## Linha 44 — `"matches": [`

Inicia hosts onde o script MAIN é permitido: Gemini real e servidor mock local.

**⚠️ SEM assertion específica da lista inteira.**

## Linha 45 — `"https://gemini.google.com/*",`

Inclui a origem real do Gemini.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do padrão literal.** Testes unitários do `inject.js` não demonstram que o Manifest o aplica exatamente a esse host.

## Linha 46 — `"http://127.0.0.1/*"`

Inclui o mock local utilizado pelos E2E para simular Gemini de forma controlada.

**Evidência:** 🟨 o E2E usa `127.0.0.1:3999` no fluxo real e depende dessa permissão de match para injeção automática.  
Ainda assim não há assertion isolada da string do Manifest.

## Linha 47 — `],`

Fecha `matches` do script MAIN.

**Evidência:** sintática + runtime indireto.

## Linha 48 — `"js": [`

Inicia a lista JS deste descriptor, que deve conter somente `inject.js`.

**Evidência:** 🟦 o gate exige que o segundo `content_scripts[].js` seja exatamente `['content/inject.js']`.

## Linha 49 — `"content/inject.js"`

Injeta o script de contexto MAIN. Separá-lo evita colocar toda a automação Gemini no mundo da página e limita o que precisa atravessar a fronteira de isolamento.

**Evidência:** 🟦 caminho/posição provados pelo gate; testes de `inject.js` validam comportamentos internos, mas não substituem a prova do wiring.

## Linha 50 — `],`

Fecha o array do segundo grupo.

**Evidência:** 🟦 composição exata do array está sob gate.

## Linha 51 — `"world": "MAIN",`

Faz `inject.js` executar no mundo JavaScript da página, necessário para interferir/observar primitives da própria página que o isolated world não compartilha diretamente.

Usar o mundo padrão isolado aqui seria semanticamente diferente e poderia tornar o anti-throttling/ponte ineficaz.

**Evidência:** 🟨 comportamento do `inject.js` possui testes; E2E executa extensão real.  
**⚠️ SEM assertion específica exigindo `world === 'MAIN'` no Manifest.**

## Linha 52 — `"run_at": "document_start"`

Agenda `inject.js` no início do documento. Isso é importante para instrumentações que precisam existir antes de a aplicação Gemini inicializar e capturar referências originais.

Mudar para `document_idle` pode criar corrida: a página pode inicializar timers/APIs antes do patch.

**Evidência:** 🟨 o fluxo real funciona no E2E.  
**⚠️ SEM teste que altere/inspecione `run_at` e prove especificamente `document_start`.**

## Linha 53 — `},`

Fecha o descriptor MAIN.

**Evidência:** sintática; comportamento conjunto exercitado indiretamente.

## Linha 54 — terceiro objeto `{`

Abre o content script isolado da automação Gemini. Diferente do grupo anterior, aqui vivem seletores, observadores, editor, anexos, extração e job runner.

**Evidência:** 🟦 lista JS deste descriptor é comparada pelo gate; runtime E2E a exercita.

## Linha 55 — `"matches": [`

Inicia a mesma dupla de origens Gemini real/mock.

**⚠️ SEM assertion específica da chave/lista.**

## Linha 56 — `"https://gemini.google.com/*",`

Autoriza injeção da automação isolada no Gemini real.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do padrão literal.**

## Linha 57 — `"http://127.0.0.1/*"`

Autoriza o mock Gemini local para E2E.

**Evidência:** 🟨 o E2E usa esse host e depende do content script para completar o fluxo, portanto existe boa evidência runtime indireta.  
Não existe equality assertion isolada da linha.

## Linha 58 — `],`

Fecha `matches`.

**Evidência:** sintática + E2E indireto.

## Linha 59 — `"js": [`

Inicia a lista ordenada de módulos Gemini. A sequência funciona como bootstrap manual: utilitários fundamentais vêm antes do `job-runner` e do entrypoint final.

**Evidência:** 🟦 equality exata no gate estrutural.

## Linha 60 — `"content/gemini/selectors.js",`

Define primeiro os seletores compartilhados que os demais módulos usam para localizar a UI variável do Gemini.

**Evidência:** 🟦 caminho e posição exigidos pelo gate.

## Linha 61 — `"content/gemini/dom.js",`

Adiciona helpers de DOM em seguida, construídos sobre a estratégia de seletores.

**Evidência:** 🟦 gate de wiring; testes internos do módulo serão tratados na Bíblia própria.

## Linha 62 — `"content/gemini/image-quarantine.js",`

Carrega classificação/quarentena de imagens antes do observer/extractor, evitando aceitar cedo demais assets que não representam o resultado final.

**Evidência:** 🟦 wiring exato; há testes unitários próprios do módulo, mas eles não provam isoladamente o Manifest.

## Linha 63 — `"content/gemini/observer.js",`

Instala infraestrutura de observação do DOM dinâmico.

**Evidência:** 🟦 wiring exato; testes do observer cobrem comportamento interno.

## Linha 64 — `"content/gemini/editor.js",`

Disponibiliza interação com o editor/prompt.

**Evidência:** 🟦 wiring exato; comportamento tem testes dedicados em `editor-submit.test.js`.

## Linha 65 — `"content/gemini/attachment.js",`

Disponibiliza anexação da imagem de origem.

**Evidência:** 🟦 wiring exato; há `attachment.test.js`, mas a relação Manifest→injeção é garantida estaticamente pelo gate, não por aquele teste.

## Linha 66 — `"content/gemini/temporary-chat.js",`

Carrega automação de Temporary Chat antes de runner.

**Evidência:** 🟦 wiring exato; há testes específicos do módulo.

## Linha 67 — `"content/gemini/result-extractor.js",`

Disponibiliza extração do resultado gerado.

**Evidência:** 🟦 wiring exato; testes de result extractor validam lógica interna.

## Linha 68 — `"content/gemini/deletion.js",`

Disponibiliza limpeza/deleção de conversas/estado antes da orquestração final.

**Evidência:** 🟦 wiring exato; testes próprios existem.

## Linha 69 — `"content/gemini/job-runner.js",`

Carrega o executor de jobs depois de seus módulos auxiliares.

**Evidência:** 🟦 wiring exato; há suíte extensa do runner.

## Linha 70 — `"content/content_gemini.js"`

Carrega por último o bootstrap/orquestrador do content script Gemini, quando as APIs auxiliares já foram definidas.

**Evidência:** 🟦 caminho/ordem exigidos pelo gate; 🟨 E2E depende do fluxo real do content script.

## Linha 71 — `],`

Fecha a lista de módulos Gemini.

**Evidência:** 🟦 lista inteira comparada pelo gate.

## Linha 72 — `"run_at": "document_idle"`

Agenda a automação isolada quando o documento já atingiu um estado apropriado para interação inicial. Isso reduz corrida com construção básica do DOM enquanto o `inject.js` MAIN, que precisa antecipar a página, já entrou em `document_start`.

**Evidência:** 🟨 E2E comprova o fluxo com a configuração atual.  
**⚠️ SEM assertion específica exigindo `document_idle`.**

## Linha 73 — `}`

Fecha o terceiro descriptor.

**Evidência:** sintática; runtime indireto.

## Linha 74 — `]`

Fecha `content_scripts`.

**Evidência:** 🟦 a existência dos três arrays JS e sua ordem são verificadas pelo gate; demais atributos não são todos comparados.

## Linha 75 — `}`

Fecha o objeto raiz do Manifest.

**Evidência:** ✅ JSON parseado por validadores/testes e Manifest carregado pelo Chromium no E2E.

## Linha 76 — newline final

O arquivo termina com newline. Não cria propriedade nem comportamento runtime, mas preserva convenção POSIX/editor e evita diffs ruidosos em ferramentas que esperam linha terminada.

**Evidência:** ℹ️ não requer teste funcional.

---

# 5. Matriz de contratos e evidência

| Contrato | Evidência mais forte encontrada | Classificação |
|---|---|---|
| JSON parseável | `JSON.parse` em validadores + carregamento Chromium E2E | ✅ específico para validade |
| Manifest V3 | `validate-manifest.js` exige `=== 3` | ✅ específico |
| Nome existe | `validate-manifest.js` | 🟦 gate parcial |
| Nome literal | nenhuma equality dedicada | ⚠️ sem prova |
| Versão sincronizada | `sync-version.js --check` + `version-sync.test.js` | ✅ composição específica |
| Descrição | nenhuma assertion | ⚠️ sem prova |
| `permissions` existe | `validate-manifest.js` | 🟦 parcial |
| cada permissão individual | runtime/mocks variáveis, sem equality do Manifest | ⚠️/🟨 |
| `host_permissions = ['<all_urls>']` | `surface-reduction.test.js` | ✅ específico |
| popup canônico | `verify-repository-structure.js` | 🟦 específico |
| options page canônica | `verify-repository-structure.js` | 🟦 específico |
| `open_in_tab: true` | nenhuma assertion | ⚠️ sem prova |
| Service Worker path | `verify-repository-structure.js` + E2E observa worker | 🟦 + 🟨 |
| três listas JS de content scripts | equality completa no gate estrutural | 🟦 específico |
| primeiro `matches: <all_urls>` | E2E em localhost, sem equality | 🟨 indireto |
| hosts Gemini/127 | E2E usa 127; sem equality do Manifest | 🟨 parcial |
| `world: MAIN` | fluxo atual funciona; sem assertion | ⚠️/🟨 |
| `document_start` | fluxo atual funciona; sem assertion | ⚠️/🟨 |
| `document_idle` | fluxo atual funciona; sem assertion | ⚠️/🟨 |
| ausência de recursos web expostos críticos | `surface-reduction.test.js` | ✅ específico |

---

# 6. Lacunas de testes encontradas

Estas lacunas são parte obrigatória da documentação; não são convertidas artificialmente em “verde”:

1. **Permissões individuais não têm contrato declarativo testado.** O projeto testa comportamentos que usam várias APIs, mas não existe uma assertion do conjunto esperado de `permissions`. Uma regressão que removesse `alarms` ou adicionasse um privilégio desnecessário poderia escapar de testes unitários mockados.
2. **`open_in_tab` não é protegido.**
3. **Os `matches` dos três descriptors não são comparados integralmente.**
4. **`world: MAIN` não é protegido por teste/gate específico.**
5. **`run_at: document_start` e `document_idle` não são protegidos especificamente.**
6. **A descrição pública não possui sincronização/teste semântico.**
7. **O valor literal do nome não possui assertion; apenas presença do campo é exigida.**

Essas lacunas não impedem documentar o arquivo, mas impedem afirmar que 100% de sua configuração possui teste probatório.

---

# 7. Por que a estrutura atual é coerente

O Manifest separa três preocupações que seriam piores se fossem fundidas:

1. **Página de mangá em qualquer host** — recebe somente a pilha necessária ao reconhecimento/substituição.
2. **Gemini MAIN/document_start** — recebe apenas `inject.js`, minimizando código privilegiado no mundo da página e antecipando inicialização.
3. **Gemini isolated/document_idle** — recebe a automação modular completa quando o DOM já pode ser trabalhado.

Colocar todos os scripts em `<all_urls>` seria pior porque a automação específica do Gemini passaria a executar em páginas irrelevantes, aumentando custo, colisões de DOM e superfície de comportamento. Colocar tudo em MAIN seria pior porque perderia isolamento desnecessariamente. Colocar tudo em `document_idle` poderia ser tarde demais para patches que precisam ocorrer antes da aplicação alvo capturar APIs originais.

---

# 8. Invariantes que futuras alterações precisam preservar

1. O Manifest continua válido como JSON e MV3.
2. `version` continua derivada da versão canônica do package.
3. Popup/options/background continuam apontando para os paths canônicos atuais.
4. O primeiro content script continua limitado à pilha de mangá necessária, em ordem válida.
5. `inject.js` continua separado e no contexto/tempo necessários ao seu papel.
6. A automação Gemini continua restrita aos hosts previstos, não a `<all_urls>`.
7. Dependências dos módulos Gemini continuam antes de `job-runner.js` e `content_gemini.js`.
8. Permissões não devem ser adicionadas/removidas sem mapear consumidores reais e atualizar prova automatizada.
9. Qualquer mudança de `matches`, `world` ou `run_at` deve ganhar teste/gate específico, porque hoje são áreas documentadas com prova incompleta.

---

# 9. Resultado da auditoria deste arquivo

- Fonte reproduzida integralmente: **SIM**.
- Todas as linhas comentadas: **SIM**.
- Explicações específicas ao projeto, em vez de template sintático: **SIM**.
- Dependências/consumidores descritos: **SIM**.
- Alternativas perigosas e motivos arquiteturais descritos: **SIM**.
- Evidência de testes distinguida entre direta, gate e indireta: **SIM**.
- Lacunas de teste explicitamente marcadas: **SIM**.
- Foi inferido “testado” apenas por coincidência de símbolo: **NÃO**.
- Arquivo apto a ser marcado `CONCLUÍDO` no rastreador: **SIM**.

**Próximo arquivo somente após atualizar o rastreador:** `extension/background.js`.

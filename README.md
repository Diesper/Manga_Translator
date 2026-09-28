# 📖 Manga Translator

> Extensão para navegadores Chromium (Manifest V3) para tradução automática, contínua e em alta resolução de mangás e quadrinhos na web utilizando o Google Gemini. A versão do produto tem uma única fonte de verdade em `package.json` e é sincronizada automaticamente com o Manifest e os metadados de teste.

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![CI](https://github.com/Diesper/Manga_Translator/actions/workflows/ci.yml/badge.svg)](https://github.com/Diesper/Manga_Translator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ Principais Funcionalidades

- **Automação com Gemini em segundo plano:** editor estável, anexo carregado antes do prompt, resultado com autoria de modelo, extração autenticada com fallbacks e exclusão verificada nos modos normal/minimizado. O runner não solicita ativação física da aba/janela nas retentativas.
- **Cache Perceptual Visual (GTC Fingerprint):** Identificação de imagens por assinatura perceptual dHash/aHash, impedindo retraduções de imagens já processadas mesmo com URLs dinâmicas ou CDN com tokens expiráveis.
- **Armazenamento Transacional (StorageManager + IndexedDB):** Persistência atômica com eliminação automática de assets órfãos e sem o problema de *read-modify-write* em acessos concorrentes.
- **Ciclo de Vida Durável (Manifest V3):** Reconciliação automática de abas e estado persistente resistente ao descarregamento (*unload*) do Service Worker do Chrome.
- **Leitor Embutido (Reader Mode):** Interface dedicada para visualização sequencial ou em página dupla dos mangás traduzidos, com opção de download local em lote.
- **Controle de Concorrência:** Fila assíncrona inteligente com limite de páginas simultâneas configurável para evitar sobrecarga ou bloqueio.
- **Filtro dimensional configurável:** Defina a largura e a altura mínimas das imagens elegíveis, com campos numéricos, controles deslizantes sincronizados, prévia proporcional e restauração rápida do padrão `300 × 400 px`.

---

## 🚀 Como Instalar no Navegador

Como a extensão está em formato de código aberto, você pode carregá-la diretamente em qualquer navegador baseado em Chromium (**Google Chrome**, **Microsoft Edge**, **Brave**, **Opera**):

1. Clone ou baixe este repositório no seu computador.
2. Abra a página de extensões no seu navegador:
   - **Google Chrome:** `chrome://extensions`
   - **Microsoft Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
3. No canto superior direito, ative o interruptor **Modo do desenvolvedor** (*Developer mode*).
4. Clique no botão **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta [`extension/`](extension/) deste projeto.
6. Pronto! O ícone do **MangaTranslator** aparecerá na sua barra de extensões.

---

## 📂 Estrutura do Repositório

```text
├── extension/                 # Código-fonte da extensão (Manifest V3)
│   ├── manifest.json          # Manifesto da extensão
│   ├── background.js          # Bootstrap do Service Worker + wiring dos módulos
│   ├── background/            # Router, estado, lifecycle, watchdog, reconciliação e actions
│   ├── content_manga.js       # Content script injetado nas páginas de mangá
│   ├── content_gemini.js      # Bootstrap/claim/keepalive/handlers do worker Gemini
│   ├── gemini/                # DOM, Observer, editor, attachment, result, deletion e job-runner
│   ├── gtc-fingerprint.js     # Hashing perceptual e extração de assinaturas
│   ├── gtc-indexeddb.js       # Camada de banco de dados visual IndexedDB
│   ├── storage-manager.js     # Gerenciamento atômico de blobs e transações
│   ├── popup.html / popup.js  # Janela de controle da extensão
│   ├── options.html / .js     # Painel de preferências e configurações
│   └── reader.html / reader.js# Modo leitor integrado
├── tests/                     # Suíte de testes automatizados
│   ├── smoke/                 # Testes de fumaça rápidos (ciclo de vida, concorrência)
│   ├── unit/                  # Testes unitários Jest (GTC, background, content)
│   ├── integration/           # Testes de integração de fluxo IPC
│   ├── visual-v3/             # Testes visuais de consistência e fingerprint
│   └── e2e/                   # Testes de ponta a ponta com Playwright
├── docs/                      # Documentação técnica de arquitetura
├── scripts/                   # Automação de versionamento e manutenção
├── .github/workflows/         # CI e publicação de releases
└── package.json               # Fonte única da versão do produto + scripts
```

---

## 🔢 Versionamento

A versão do produto é definida **uma única vez** no `package.json` raiz. Os demais metadados são derivados dela:

- `extension/manifest.json` recebe a versão Chromium correspondente;
- `tests/package.json` e os metadados raiz de `tests/package-lock.json` recebem a versão SemVer completa;
- a UI de opções lê `chrome.runtime.getManifest().version`, sem número hardcoded;
- o workflow de publicação deriva tag, pasta, ZIP e nome da documentação automaticamente;
- a documentação canônica no repositório usa o caminho estável `docs/Documentação.md`.

Depois de alterar apenas `package.json`, execute:

```bash
npm run version:sync
npm run version:check
```

O CI também executa `version:check` e falha se os metadados divergirem.

---

## 🧪 Executando os Testes

A **raiz do repositório é a interface oficial para humanos, CI auxiliares e agentes**. Não é necessário descobrir ou entrar manualmente em `tests/`.

As dependências de teste continuam pertencendo ao pacote `tests/` e são instaladas de forma reprodutível usando `tests/package-lock.json`. A raiz apenas delega para essa implementação, evitando uma segunda configuração de Jest ou Playwright.

### Preparação inicial

Depois de clonar o repositório, na raiz:

```bash
npm run setup
```

Esse comando executa a instalação determinística do pacote de testes com `npm ci` e instala o Chromium esperado pelo Playwright.

Comandos de preparação mais específicos:

```bash
npm run setup:deps   # somente npm ci em tests/
npm run setup:e2e    # somente instalação do Chromium do Playwright
```

> No GitHub Actions Linux, o E2E continua usando a preparação própria da CI com dependências de sistema e `xvfb-run`. O comando local da raiz não substitui a configuração especializada da CI.

### Interface padronizada da raiz

```bash
npm run test:unit
npm run test:integration
npm run test:smoke
npm run test:visual
npm run test:e2e
npm run test:coverage
npm run test:all
```

Significado dos comandos:

- `test:unit`: executa somente `tests/unit/` pelo Jest oficial de `tests/package.json`;
- `test:integration`: executa somente `tests/integration/`;
- `test:smoke`: executa o runner oficial `tests/smoke/run-smoke.js`;
- `test:visual`: executa a suíte perceptual `tests/visual-v3/`;
- `test:e2e`: executa `tests/run-e2e.js`, que por sua vez chama o Playwright com `tests/playwright.config.js`;
- `test:coverage`: gera coverage pelo runner auditável da CI e depois executa o verificador de integridade/thresholds;
- `test:all`: executa Smoke → Jest com inventário CI → Visual → Coverage → E2E, sem mascarar falhas.

A cadeia E2E oficial permanece:

```text
raiz: npm run test:e2e
        ↓
npm --prefix tests run test:e2e
        ↓
tests/run-e2e.js
        ↓
tests/playwright.config.js
        ↓
Playwright + extensão real + servidor mock
```

### Compatibilidade com comandos antigos

Os runners existentes não foram removidos. `npm test` e `npm run test:fast` continuam executando o agregador histórico de Jest + Visual por meio do pacote `tests/`. Os wrappers Windows `run.bat`, `run.ps1`, `run-smoke.*` e `test-all.*` também foram preservados.

A diferença é que os nomes específicos da raiz agora têm semântica exata: `test:unit` não inclui integração e `test:e2e` não executa Jest/Visual antes do Playwright.

### CI e regressões de Service Worker

A pipeline em `.github/workflows/ci.yml` trata **Smoke, Visual, Jest, Coverage e E2E como gates funcionais independentes**. Uma falha em Jest não impede o Playwright de rodar, então uma única execução expõe regressões de várias camadas ao mesmo tempo.

O job final **CI Gate** exige sucesso dos gates obrigatórios. Os diagnósticos pesados de worker/leak continuam obrigatórios em `push` para `main` e em execução manual, conforme o contrato atual da CI.

Além do código de saída normal:
- Jest compara todos os arquivos `.test.js` existentes em `tests/unit` e `tests/integration` com o inventário realmente descoberto pelo runner, rejeita `skip`/`todo` e protege um baseline mínimo;
- Playwright proíbe `test.only` na CI, rejeita testes `skipped` e uma queda silenciosa no inventário E2E;
- o runner visual falha se houver teste pulado ou se o total cair abaixo do baseline;
- Smoke falha se o conjunto esperado de arquivos não for descoberto;
- Coverage usa `tests/jest.coverage.config.js` com provider V8 sobre `extension/**/*.js`; `verify-coverage.js` exige inventário completo, LCOV/summary válidos, percentuais não-zero e thresholds;
- `tests/ci/verify-ci-contract.js` protege a configuração da CI;
- `tests/ci/verify-root-interface.js` protege a nova interface da raiz e impede que os wrappers deixem de delegar para o pacote `tests/`.

A auditoria estrutural completa e as decisões de compatibilidade estão documentadas em [`ESTRUTURA_FORA_DO_PADRAO.md`](ESTRUTURA_FORA_DO_PADRAO.md).

---

## 📚 Documentação Técnica

A arquitetura vigente, contratos IPC/storage, lifecycle MV3, cache perceptual, Gemini RPA, Reader, compatibilidade, versionamento e critérios de manutenção estão consolidados na documentação canônica de caminho estável:

- [`docs/Documentação.md`](docs/Documentação.md): arquitetura canônica.
- [`docs/DOCUMENTACAO_VERSAO_FUNCIONAL.md`](docs/DOCUMENTACAO_VERSAO_FUNCIONAL.md): revisão funcional 2, fluxo, prazos e manutenção.
- [`docs/MELHORIAS_EXTRACAO_E_PRAZO.md`](docs/MELHORIAS_EXTRACAO_E_PRAZO.md): extração autenticada e watchdog.
- [`docs/VALIDACAO_REVISAO_2.json`](docs/VALIDACAO_REVISAO_2.json): 21 resultados manuais, sete por modo, quatro lotes completos e 21 renovações confirmadas. A aprovação manual não presume resultado do CI deste PR.

---

## 🛡️ Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE) para mais detalhes.

# 📖 Manga Translator

> Extensão Chromium Manifest V3 para tradução automática de mangás e quadrinhos usando Google Gemini.

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![CI](https://github.com/Diesper/Manga_Translator/actions/workflows/ci.yml/badge.svg)](https://github.com/Diesper/Manga_Translator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Requisitos

- Node.js 18 ou superior.
- npm.
- Chromium para os testes E2E.
- Para carregar a extensão manualmente, Chrome/Edge/Brave/Opera ou outro navegador Chromium compatível.

## Instalação para desenvolvimento

```bash
git clone https://github.com/Diesper/Manga_Translator.git
cd Manga_Translator
npm ci
```

A raiz do repositório é o **único projeto Node/npm oficial**. Não existe um segundo workspace em `tests/`.

## Carregar a extensão no navegador

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension/`.

> `extension/` e `extension/manifest.json` são caminhos estáveis do projeto e não devem ser movidos.

## Estrutura do repositório

```text
/
├── package.json
├── package-lock.json
├── jest.config.js
├── playwright.config.js
├── README.md
├── LICENSE
├── extension/                 # Código distribuído da extensão MV3
│   ├── manifest.json          # Mantido na raiz da extensão
│   ├── background.js          # Service Worker entrypoint estável
│   ├── background/            # Estado, lifecycle, actions e router
│   ├── content/               # Content scripts de mangá + Gemini
│   │   └── gemini/            # Módulos do pipeline Gemini
│   ├── shared/                # GTC, storage e UI compartilhada
│   ├── popup/                 # popup.html + popup.js
│   ├── options/               # options.html + options.js
│   └── reader/                # reader.html + reader.js
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── smoke/
│   ├── visual/
│   ├── e2e/
│   ├── fixtures/
│   ├── helpers/
│   ├── mocks/
│   └── setup/
├── scripts/
│   ├── ci/
│   │   └── data/
│   ├── validation/
│   ├── maintenance/
│   └── release/
├── docs/
│   ├── Documentação.md
│   ├── ARQUITETURA_DO_REPOSITORIO.md
│   ├── PLANO_REESTRUTURACAO.md
│   └── historico/
└── .github/workflows/
```

## Comandos oficiais

Todos os comandos são executados **na raiz**.

```bash
npm ci
npm test
npm run test:unit
npm run test:integration
npm run test:smoke
npm run test:visual
npm run test:e2e
npm run test:coverage
npm run test:coverage:verify
npm run test:ci
npm run validate
npm run validate:structure
npm run lint
```

Comandos especializados:

```bash
npm run test:e2e:group -- fast
npm run test:e2e:plan
npm run test:images
npm run test:diagnose-workers
npm run test:diagnose-background-leak
npm run version:check
npm run version:sync
```

Não é necessário usar `cd tests`, `npm --prefix tests`, BAT/PS1 wrappers ou runners legados.

## Testes e gates

- **Jest:** configuração canônica em `/jest.config.js`; projetos internos separam unitários e integração.
- **Smoke:** `tests/smoke/`.
- **Visual:** `tests/visual/`.
- **Playwright:** configuração canônica em `/playwright.config.js`; E2E em `tests/e2e/`; artefatos de execução em `/test-results/`.
- **Fixtures:** `tests/fixtures/`; `tests/fixtures/manga-images.js` é a fonte única dos PNGs E2E e `tests/setup/create-test-images.js` apenas os materializa quando necessário.
- **Coverage:** gerado em `/coverage/` e verificado por `scripts/validation/verify-coverage.js`.
- **Baseline:** `scripts/ci/data/test-baseline.json`.
- **Matriz de regressão:** `scripts/ci/data/regression-matrix.json`.
- **Contrato da CI:** `scripts/validation/verify-ci-contract.js`.
- **Contrato estrutural:** `scripts/validation/verify-repository-structure.js` impede a volta da arquitetura legada.

O workflow `.github/workflows/ci.yml` executa npm a partir da raiz, mantém os cinco grupos E2E e preserva o gate agregado. Os diagnósticos pesados continuam condicionados a `workflow_dispatch` ou push na `main`.

## Versionamento

A versão manual existe somente em `package.json#version`.

```bash
npm run version:sync
npm run version:check
```

`scripts/release/sync-version.js` mantém em sincronia:

- `extension/manifest.json#version`;
- `package-lock.json#version`;
- `package-lock.json#packages[""].version`;
- os contratos de documentação/release.

O workflow de publicação usa `scripts/release/sync-version.js --print-env`.

## Arquitetura da extensão

A extensão continua com os mesmos entrypoints MV3. Esta reestruturação muda **tooling, testes, fixtures, documentação e caminhos de desenvolvimento**, não a lógica funcional de tradução.

Principais áreas:

- `extension/background.js` + `extension/background/`: Service Worker, estado, lifecycle, watchdog e actions.
- `extension/content/content_manga.js` + `extension/cm-*.js`: descoberta/aplicação de imagens.
- `extension/content/content_gemini.js` + `extension/content/gemini/`: automação do Gemini.
- `extension/gtc-*.js` e `extension/shared/storage-manager.js`: cache/persistência.
- popup, opções, reader e UI compartilhada.

## Documentação

- [Documentação técnica canônica](docs/Documentação.md)
- [Arquitetura do repositório](docs/ARQUITETURA_DO_REPOSITORIO.md)
- [Plano e registro da reestruturação](docs/PLANO_REESTRUTURACAO.md)
- [Histórico](docs/historico/)

## Licença

MIT. Consulte [LICENSE](LICENSE).

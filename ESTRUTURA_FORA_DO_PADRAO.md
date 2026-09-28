# Auditoria estrutural do Manga_Translator

> Auditoria realizada em 2026-09-28 sobre o repositório **Diesper/Manga_Translator**.
>
> Base analisada: `main` em `8d470f4ac173f8fb96abe4b14bd1d2bf41faaf32`.
> Implementação desta tarefa: branch `chore/root-execution-interface-audit`.

## 1. Ambiente analisado

| Item | Resultado |
|---|---|
| Repositório | `Diesper/Manga_Translator` |
| Branch-base | `main` |
| Commit-base | `8d470f4ac173f8fb96abe4b14bd1d2bf41faaf32` |
| Data | 2026-09-28 |
| Node disponível no executor de auditoria | `v22.16.0` |
| npm disponível no executor de auditoria | `10.9.2` |
| Node declarado em `tests/package.json` | `>=18.0.0` |
| Node usado pela CI | `20.x` e `22.x` para Jest; `20.x` nos demais gates |
| Árvore GitHub analisada | 268 arquivos + 29 diretórios relevantes; resposta `truncated=false` |

### Validação equivalente à ETAPA 1

A identidade do repositório, branch e SHA foi confirmada diretamente pela API GitHub conectada. O sandbox desta sessão não consegue resolver `github.com` por DNS para executar um clone Git local, portanto `pwd`, `git rev-parse --show-toplevel` e `git status --short` não puderam ser executados contra uma cópia clonada do repositório.

Isso **não foi tratado silenciosamente**: a auditoria continuou somente depois de confirmar via GitHub que o alvo era exatamente `Diesper/Manga_Translator` e que o HEAD de `main` era o SHA acima. As alterações foram feitas em uma branch criada diretamente a partir desse SHA.

## 2. Estrutura atual

Árvore resumida relevante antes desta tarefa:

```text
Manga_Translator/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── publish.yml
│       └── recover-cancelled-ci.yml
├── docs/
│   ├── Documentação.md
│   ├── DOCUMENTACAO_VERSAO_FUNCIONAL.md
│   ├── DOCUMENTACAO_v5.1.1_ATUALIZACAO.md
│   ├── E2E_5_SHARDS_PR48.md
│   ├── REGRESSOES_PR47.md
│   └── ...
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── background/
│   ├── gemini/
│   ├── content_manga.js
│   ├── content_gemini.js
│   ├── popup.*
│   ├── options.*
│   └── reader.*
├── scripts/
│   └── sync-version.js
├── tests/
│   ├── ci/
│   ├── e2e/
│   ├── helpers/
│   ├── integration/
│   ├── mocks/
│   ├── smoke/
│   ├── unit/
│   ├── visual-v3/
│   ├── jest.config.js
│   ├── jest.coverage.config.js
│   ├── jest.background-diagnostic.config.js
│   ├── playwright.config.js
│   ├── package.json
│   ├── package-lock.json
│   ├── run-all-tests.js
│   └── run-e2e.js
├── package.json
├── README.md
├── projeto.md
├── status.md
├── run.bat / run.ps1
├── run-jest.bat
├── run-smoke.bat / run-smoke.ps1
└── test-all.bat / test-all.ps1
```

Não existem no SHA analisado: `yarn.lock`, `pnpm-lock.yaml`, `npm-shrinkwrap.json`, configuração ESLint/Prettier, `tsconfig*`, `jsconfig*`, Dockerfile ou docker-compose. Para um projeto JavaScript puro de extensão Chromium isso não é, por si só, um erro.

## 3. Arquivos e diretórios fora do padrão

| Item | Localização atual | Padrão comum | Classificação | Risco | Recomendação |
|---|---|---|---|---|---|
| Dois `package.json` com papéis diferentes | `/package.json`, `/tests/package.json` | Um pacote npm raiz ou workspaces explícitos | INCOMUM MAS VÁLIDO | Médio para ergonomia | Manter por compatibilidade; usar raiz como fachada e `tests/` como pacote real de tooling |
| Lockfile somente no pacote de testes | `tests/package-lock.json` | Lockfile junto ao pacote que possui dependências | CORRETO | Baixo | Preservar; setup deve usar `npm ci` nesse diretório |
| Ausência de lockfile raiz | raiz | Muitos agentes tentam `npm ci` na raiz | POTENCIALMENTE PROBLEMÁTICO | Médio | Documentar `npm run setup`; avaliar workspace/root lock apenas em migração futura |
| Jest dentro de `tests/` | `tests/jest.config.js` | Config na raiz em projetos de pacote único | INCOMUM MAS VÁLIDO | Baixo | Preservar porque o pacote npm de testes também está em `tests/` |
| Coverage com `rootDir` diferente do Jest normal | `tests/jest.coverage.config.js` | Uma config única | INCOMUM MAS VÁLIDO | Médio | Preservar; o remapeamento é intencional para instrumentar `extension/**/*.js` |
| Playwright dentro de `tests/` | `tests/playwright.config.js` | Config raiz ou junto ao pacote de testes | CORRETO | Baixo | Preservar |
| `extension/` em vez de `src/` | `extension/` | Muitos projetos usam `src/` | CORRETO | Baixo | Preservar; é a pasta carregável diretamente pelo Chromium |
| `visual-v3/` contém também teste “v4” | `tests/visual-v3/` | Nome refletindo a geração vigente | LEGADO | Baixo | Renomear somente em migração planejada, pois há referências em scripts/docs |
| Muitos wrappers BAT/PowerShell duplicados | raiz e `tests/` | Um entrypoint multiplataforma | DUPLICADO | Baixo/Médio | Preservar por compatibilidade; recomendar npm da raiz como interface principal |
| `run-all-tests.js` histórico usa `--forceExit` | `tests/run-all-tests.js` | Runner CI sem force-exit | POTENCIALMENTE PROBLEMÁTICO | Médio | Não usado pelo gate Jest CI-grade; deprecar/remover `--forceExit` somente após auditoria específica |
| Comentários de contagem antigos no runner | `tests/run-all-tests.js` | Contagens derivadas do baseline | LEGADO | Baixo | Evitar números hardcoded em comentários futuros |
| Documentos versionados/temporários coexistem com docs canônica | `docs/`, `projeto.md`, `status.md` | Uma docs canônica + ADRs | MELHORÁVEL | Baixo | Arquivar gradualmente sem apagar histórico útil |
| `host_permissions: ["<all_urls>"]` | `extension/manifest.json` | Permissões mínimas possíveis | POTENCIALMENTE PROBLEMÁTICO | Segurança/escopo, não estrutura de teste | Tratar em auditoria de permissões separada; não alterar nesta tarefa |
| E2E local e CI usam topologias diferentes | runner local completo vs 5 shards na CI | Mesmo runner, estratégia diferente | INCOMUM MAS VÁLIDO | Baixo | Preservar; ambos chegam a `run-e2e.js`/Playwright |
| E2E usa `headless:false` + `--headless=new` | `tests/playwright.config.js` | Normalmente uma única configuração headless | INCOMUM MAS VÁLIDO | Baixo | Intencional para extensão Chromium; não simplificar sem prova |
| `reuseExistingServer: true` em porta 3999 | Playwright | Servidor dedicado por execução | MELHORÁVEL | Baixo/Médio | Futuramente validar identidade/health do servidor antes de reutilizar |
| Helpers/testes possuem localizadores de raiz repetidos | vários arquivos em `tests/` | Helper único compartilhado | DUPLICADO | Médio de manutenção | Consolidar futuramente, sem mudar nesta tarefa |
| Fallbacks de alguns localizadores usam `process.cwd()` | vários testes/E2E | Resolver sempre a partir de arquivo/raiz descoberta | MELHORÁVEL | Baixo no layout atual | Remover fallback dependente de CWD numa refatoração dedicada |

## 4. Arquitetura npm

O repositório funciona como uma **arquitetura híbrida intencional**, não como dois aplicativos npm independentes completos.

### Pacote raiz — `/package.json`

Responsabilidades encontradas:

- fonte única da versão do produto (`6.5.0`);
- scripts de sincronização da versão;
- fachada/orquestração para testes;
- nenhuma `dependency` ou `devDependency`.

Antes desta tarefa, a raiz já chamava runners em `tests/`, mas alguns nomes não correspondiam exatamente ao escopo real:
- `test:unit` chamava `run-all-tests.js --unit`, que executava todo o Jest, incluindo integração;
- `test:e2e` chamava `run-all-tests.js --e2e`, que executava Jest + Visual + E2E.

### Pacote de testes — `/tests/package.json`

É o **pacote npm real de tooling**:

- Jest 29;
- jsdom;
- fake-indexeddb;
- Playwright;
- scripts de unit, integration, smoke, visual, E2E, coverage e diagnósticos;
- `engines.node >=18.0.0`;
- lockfile correspondente em `tests/package-lock.json`.

### Instalação antes da tarefa

A instalação reprodutível exigia conhecimento implícito da arquitetura:

```bash
cd tests
npm ci
```

e, para E2E, instalação do Chromium via Playwright.

### Instalação após a tarefa

A interface recomendada passa a ser:

```bash
npm run setup
```

que delega para:

```text
raiz
  -> npm --prefix tests ci
  -> npm --prefix tests run test:e2e:setup
  -> playwright install chromium
```

Importante: `npm ci` executado **diretamente na raiz** continua não sendo o comando correto porque não existe lockfile raiz. Corrigir isso exigiria migrar para workspace/root lock, mudança maior deliberadamente não feita.

## 5. Problemas relacionados ao diretório de execução

### Proteções já corretas

- `tests/run-all-tests.js` usa `cwd: __dirname` ao spawnar runners.
- `tests/run-e2e.js` usa `cwd: __dirname`.
- `tests/playwright.config.js` usa `__dirname` para extensão e servidor mock.
- `scripts/sync-version.js` deriva a raiz de `__dirname`.
- wrappers BAT usam `%~dp0`.
- wrappers PowerShell usam `$PSScriptRoot`.

Esses padrões tornam os principais runners independentes do CWD do chamador.

### Sensibilidades encontradas

A busca encontrou 32 arquivos com `process.cwd()`. A maior parte implementa um algoritmo “subir diretórios até encontrar `extension/manifest.json`” e usa CWD apenas como fallback final.

Também há três specs E2E com fallback do tipo `path.join(process.cwd(), 'extension')`. No fluxo oficial isso não é atingido porque a raiz é encontrada pela árvore; ainda assim, o fallback é conceitualmente sensível ao CWD e merece consolidação futura.

Existem 63 arquivos com referências relativas a `../extension`. Elas são majoritariamente coerentes porque o pacote de testes vive em `tests/`, mas reforçam que mover `tests/` ou `extension/` seria uma alteração de alto impacto.

## 6. Scripts duplicados ou pouco claros

### Runners encontrados

- `run.bat`
- `run.ps1`
- `run-jest.bat`
- `run-smoke.bat`
- `run-smoke.ps1`
- `test-all.bat`
- `test-all.ps1`
- `tests/run.bat`
- `tests/run.ps1`
- `tests/run-smoke.bat`
- `tests/test-all.bat`
- `tests/test-all.ps1`
- `tests/run-all-tests.js`
- `tests/run-e2e.js`
- `tests/ci/run-jest-ci.js`
- `tests/ci/run-e2e-group.js`
- `tests/smoke/run-smoke.js`
- `tests/visual-v3/run-all.js`

### Classificação

- BAT/PowerShell raiz e `tests/`: **DUPLICADO/LEGADO**, porém funcional e robusto quanto ao caminho.
- `tests/run-all-tests.js`: agregador histórico local, **LEGADO**, ainda útil para `npm test`/fast.
- `tests/ci/run-jest-ci.js`: runner oficial CI-grade para Jest, **CORRETO**.
- `tests/run-e2e.js`: launcher oficial local/CI do Playwright, **CORRETO**.
- `tests/ci/run-e2e-group.js`: wrapper de sharding explícito da CI, **CORRETO**.

Nada foi deletado.

## 7. Jest

Config principal: `tests/jest.config.js`.

Características:

- oito projetos lógicos (background, gtc, content-scripts, popup, reader, manifest, shared-ui, integration);
- `rootDir` efetivo em `tests/`;
- paths coerentes com o pacote de testes;
- mocks separados;
- coverage clássico ainda declarado na config base.

A CI não chama simplesmente `jest`: usa `tests/ci/run-jest-ci.js`, que:

- descobre todos os `.test.js` em unit/integration;
- compara inventário esperado x executado;
- exige baseline mínimo;
- rejeita skipped e TODO;
- rejeita worker Jest encerrado à força;
- não usa `--forceExit`.

A nova raiz delega:
- `test:unit` -> script unit do pacote de testes;
- `test:integration` -> script integration;
- `test:ci` -> runner CI-grade;
- `test:all` -> usa `test:ci`, não o agregador histórico com `--forceExit`.

## 8. Playwright

Config oficial: `tests/playwright.config.js`.

Cadeia local:

```text
npm run test:e2e (raiz)
 -> npm --prefix tests run test:e2e
 -> node tests/run-e2e.js
 -> Playwright CLI --config tests/playwright.config.js
 -> tests/e2e/
```

Pontos confirmados:

- extensão real carregada de `extension/`;
- Chromium;
- servidor mock em `tests/e2e/fixtures/gemini-mock-server.js`;
- imagens de fixture geradas por script Node;
- `forbidOnly` em CI;
- retries 0 em CI;
- baseline E2E protegido;
- CI distribui 21 testes em cinco grupos explícitos;
- blobs são mesclados e o gate global valida o inventário;
- Linux CI usa `xvfb-run` e instala Chromium com dependências.

A raiz não cria segunda config Playwright. O novo setup apenas expõe a instalação do Chromium por meio do pacote `tests/`.

## 9. GitHub Actions

`.github/workflows/ci.yml` usa `working-directory: tests` nos jobs funcionais. Isso é coerente com o lockfile e as dependências estarem em `tests/`.

A CI e a interface local não são idênticas em topologia:

- local `test:e2e`: suíte E2E completa;
- CI: cinco grupos E2E + merge de blob reports;
- local `test:all`: fluxo funcional completo;
- CI: adiciona syntax check, manifest validation, version integrity e diagnósticos pesados pós-merge/main.

Isso é **INCOMUM MAS VÁLIDO**: não existem duas implementações de Playwright, apenas duas estratégias de orquestração sobre os mesmos runners/configs.

Nesta tarefa a CI recebeu somente um novo check leve:

```bash
node tests/ci/verify-root-interface.js
```

Nenhum gate funcional foi removido, rebaixado ou tornado não-bloqueante.

## 10. Problemas que podem afetar agentes de IA

### `npm ci` na raiz

Antes e depois desta tarefa, `npm ci` diretamente na raiz não é a instalação correta porque não existe lockfile raiz.

**Risco:** agentes que assumem “qualquer projeto Node tem lockfile na raiz” falham antes de descobrir `tests/package-lock.json`.

**Mitigação implementada:** `npm run setup` documentado na raiz.

### `npm test` na raiz

Funciona, mas preserva o agregador histórico Jest + Visual por compatibilidade.

**Mitigação:** README destaca comandos específicos para agentes.

### `npx playwright test` na raiz

É um comando inadequado neste layout:
- Playwright é dependência de `tests/`;
- a config oficial está em `tests/playwright.config.js`;
- fixtures e CWD foram desenhados para o pacote `tests/`.

**Mitigação:** `npm run test:e2e`.

### Comandos anteriormente ambíguos

`test:unit` e `test:e2e` da raiz tinham escopo maior do que o nome sugeria.

**Mitigação:** agora delegam diretamente para os scripts específicos de `tests/package.json`.

### Arena / Claude Code / Codex

A interface recomendada passa a ser descoberta diretamente em `/package.json`:

```bash
npm run setup
npm run test:unit
npm run test:integration
npm run test:smoke
npm run test:visual
npm run test:e2e
npm run test:coverage
npm run test:all
```

Não é necessário inferir o segundo package.json para uso normal.

## 11. Melhorias implementadas nesta tarefa

1. Padronização dos scripts da raiz para delegar ao pacote `tests/`.
2. Adição de `npm run setup` usando `npm ci` no lockfile existente.
3. Adição de `setup:deps` e `setup:e2e`.
4. Correção semântica dos wrappers `test:unit`, `test:integration` e `test:e2e`.
5. Adição de wrappers de coverage com geração + verificação.
6. `test:all` local passa a usar o runner Jest CI-grade, Smoke, Visual, Coverage e E2E.
7. Preservação de `npm test`/`test:fast` como compatibilidade com o agregador histórico.
8. Adição de `tests/package.json#test:e2e:setup`.
9. Criação de `tests/ci/verify-root-interface.js`.
10. Inclusão desse contrato no job `ci-contract`.
11. Proteção no próprio `verify-ci-contract.js` para exigir que o novo contrato continue na CI.
12. Atualização do README para tornar a raiz o ponto de entrada recomendado.
13. Criação deste relatório.

## 12. Melhorias recomendadas, mas NÃO implementadas

- Migrar para npm workspaces e um lockfile raiz, **somente** após validar impacto em CI, release e ferramentas.
- Consolidar os vários helpers que implementam descoberta da raiz.
- Remover fallbacks baseados em `process.cwd()` onde a raiz já pode ser derivada deterministicamente.
- Auditar e eventualmente remover `--forceExit` do agregador histórico `tests/run-all-tests.js`.
- Consolidar/deprecar wrappers BAT/PowerShell duplicados após período de compatibilidade.
- Renomear `visual-v3/` para um nome neutro quando não houver mais consumidores de caminho antigo.
- Revisar `<all_urls>` em uma auditoria de segurança/permissões separada.
- Considerar um `npm run doctor` somente se Arena/sandboxes continuarem apresentando problemas ambientais após a nova fachada.
- Validar identidade do serviço antes de reutilizar a porta 3999 no Playwright.
- Arquivar documentação histórica/temporária para reduzir ruído sem apagar rastreabilidade.

## 13. Estrutura recomendada de longo prazo

Uma evolução possível, **não implementada agora**, seria:

```text
Manga_Translator/
├── package.json                 # pacote privado/workspace + comandos canônicos
├── package-lock.json            # lockfile único, se a migração for aprovada
├── extension/                   # artefato carregável MV3 (permanece)
├── tests/                       # workspace de testes ou diretório de suítes
│   ├── unit/
│   ├── integration/
│   ├── smoke/
│   ├── visual/
│   ├── e2e/
│   ├── helpers/
│   └── ci/
├── scripts/
├── docs/
└── .github/workflows/
```

A prioridade não deve ser “parecer padrão”, e sim manter uma interface simples e determinística sem quebrar caminhos maduros.

---

## Cadeias oficiais após esta tarefa

### Unit

```text
raiz: npm run test:unit
 -> npm --prefix tests run test:unit
 -> Jest tests/unit
```

### Integration

```text
raiz: npm run test:integration
 -> npm --prefix tests run test:integration
 -> Jest tests/integration
```

### Smoke

```text
raiz: npm run test:smoke
 -> npm --prefix tests run test:smoke
 -> tests/smoke/run-smoke.js
```

### Visual

```text
raiz: npm run test:visual
 -> npm --prefix tests run test:visual-v3
 -> tests/visual-v3/run-all.js
```

### Coverage

```text
raiz: npm run test:coverage
 -> tests/ci/run-jest-ci.js --coverage
 -> tests/ci/verify-coverage.js
```

### E2E

```text
raiz: npm run test:e2e
 -> npm --prefix tests run test:e2e
 -> tests/run-e2e.js
 -> tests/playwright.config.js
 -> Chromium + extensão real + mock server
```

### Tudo

```text
raiz: npm run test:all
 -> Smoke
 -> Jest CI-grade (unit + integration + inventário)
 -> Visual
 -> Coverage + verificação
 -> E2E
```

## Observação de validação

O sandbox da auditoria não possui acesso DNS a GitHub/NPM para clonar e instalar as dependências localmente. Por isso, os resultados funcionais finais desta branch devem ser lidos do GitHub Actions, que é o ambiente autorizado que possui checkout, `npm ci`, Chromium, dependências Linux e Xvfb. O contrato estático da nova fachada roda antes de dependências e impede regressões óbvias de path/delegação.

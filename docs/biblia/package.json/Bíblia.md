# Bíblia técnica — package.json

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE  
> **SHA auditado:** `33e0b91d1a6f1790124b700d2ce331f80d2b7095`  
> **Agente responsável pela auditoria:** Agente L  
> **Tipo:** manifesto npm canônico da raiz / orquestrador de tooling  
> **Linhas textuais:** **55**  
> **Posições documentais:** **56**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`package.json` é a fachada operacional do repositório Node e a **fonte canônica da versão do produto**. Ele não é carregado pela extensão Chromium em runtime, mas controla como desenvolvimento, CI, testes, coverage, diagnósticos, validações e release são acionados.

Há três responsabilidades distintas no mesmo arquivo:

1. **metadados do projeto** — nome, versão, descrição, privacidade, engine e licença;
2. **orquestração** — aliases npm que conectam Jest, Playwright, smoke, visual e validadores;
3. **toolchain** — dependências de desenvolvimento necessárias para executar esses comandos.

A versão `6.5.0` tem relevância arquitetural maior que um metadado npm comum: `scripts/release/sync-version.js` a lê como fonte única, deriva a versão compatível do Manifest, a tag `v6.5.0`, o basename de release e o nome do artefato documental, e compara os valores derivados com `extension/manifest.json` e `package-lock.json`.

## 2. Consumidores e dependências

### Consumidores diretos

- npm/npm CLI: lê `scripts`, `devDependencies`, `engines`, `private` e metadados;
- `scripts/release/sync-version.js`: lê `package.json#version`;
- `scripts/ci/run-jest-ci.js`: lê `scripts.test:unit` e `scripts.test:integration` e compara com a partição canônica;
- `scripts/validation/verify-ci-contract.js`: lê diversos scripts e exige comandos exatos para gates críticos;
- `scripts/validation/verify-test-policy.js`: percorre **todos** os scripts e rejeita escape hatches;
- `tests/visual/run-all.js`: lê `package.json#version` para derivar a versão de produto;
- `.github/workflows/ci.yml` e `.github/workflows/publish.yml`: executam aliases npm definidos aqui;
- `package-lock.json`: materializa nome, versão, dependências de desenvolvimento e engine da raiz.

### Dependências chamadas pelos scripts

Os aliases referenciam `jest.config.js`, `playwright.config.js`, runners sob `tests/`, scripts CI/maintenance/release/validation e os binários fornecidos por Jest/Playwright. Portanto, renomear um desses caminhos exige atualizar este manifesto e, quando aplicável, os gates que protegem a string exata.

## 3. Topologia de testes e validação

### Jest

`test:unit` seleciona sete projetos: `background`, `gtc`, `content-scripts`, `popup`, `reader`, `manifest` e `shared-ui`. `test:integration` seleciona somente `integration`.

`run-jest-ci.js` não trata esses nomes como documentação: usa Jest `--listTests --selectProjects`, compara união/interseção dos inventários e rejeita divergência entre os scripts do package e a lista canônica. Essa é evidência forte de que as linhas 9 e 16 fazem parte do contrato testável, não apenas conveniência local.

### E2E

O fluxo E2E normal e o fluxo por grupos executam `test:images` em hooks `pre...`. O runner agrupado e o verificador do plano têm comandos exatos protegidos por `verify-ci-contract.js`. A execução de Playwright direta, fora de `npm run test:e2e*`, não dispara automaticamente esses hooks.

### Coverage

`test:coverage` usa o mesmo runner Jest com `--coverage`; esse runner injeta `COVERAGE_MODE=1`. `jest.config.js` então ativa V8 e reporters. `test:coverage:verify` é uma etapa separada e bloqueante: gerar coverage não equivale a aprová-lo.

### Política e infraestrutura

`validate:test-policy`, `test:test-policy:infra`, `validate:publish`, `test:ci-contract:infra`, `test:coverage:infra` e o agregado `validate` formam uma camada de testes dos próprios gates. O self-test da política cria deliberadamente um `package.json` com `jest --forceExit` e exige rejeição.

## 4. Versionamento e release

A versão manual existe aqui como SemVer numérico. O sincronizador exige `MAJOR.MINOR.PATCH` sem prefixo `v`, prerelease ou zeros à esquerda e limita cada componente ao intervalo 0–65535.

Para `6.5.0`:

- package: `6.5.0`;
- Manifest/display: `6.5` (patch zero é omitido na versão derivada);
- tag: `v6.5.0`;
- release basename: `Manga-Translator-v6.5`;
- documentação: `Documentação_V6.5.md`.

O workflow de publicação executa `npm run version:check` antes de derivar metadados. Assim, a alteração de versão deve passar pelo fluxo de sincronização; editar só esta linha e publicar diretamente tende a falhar no check por divergência de Manifest/lockfile.

## 5. Dependências de desenvolvimento

| Dependência | Uso observado | Observação |
|---|---|---|
| `@playwright/test` | config e specs E2E | o range é `^1.44.0`; o lock determina a versão instalada por `npm ci` |
| `fake-indexeddb` | unit, smoke e integração de persistência | substitui IndexedDB em memória no ambiente Node/jsdom |
| `jest` | runner unit/integration/coverage | versão major deve permanecer compatível com config/CLI atuais |
| `jest-environment-jsdom` | projetos Jest DOM | necessário porque o ambiente jsdom é pacote separado no Jest moderno |

O `package-lock.json` atual replica esses quatro ranges e `node >=18.0.0`. A CI usa `npm ci`, portanto a instalação concreta é controlada pelo lockfile; os carets deste arquivo definem a faixa permitida quando o lock for regenerado.

## 6. Assíncrono, erros, efeitos colaterais e segurança

`package.json` não possui lógica assíncrona própria. Os efeitos surgem dos comandos:

- `npm test`, `test:all` e `validate` usam encadeamento `&&`, propagando falha por exit code;
- `test:e2e` pode abrir Chromium e consumir fixtures;
- `mock:server` inicia um processo servidor e requer encerramento externo;
- `version:sync` **escreve** Manifest e lockfile;
- `version:check` é leitura/verificação e sinaliza divergência com exit code não zero;
- diagnósticos podem escrever artefatos de inspeção.

Segurança: este arquivo é trust boundary de supply chain de desenvolvimento. Alterar um script pode trocar o programa executado por desenvolvedores/CI; alterar dependências pode mudar código instalado por `npm ci` após mudança coerente do lockfile. `private: true` reduz risco de publicação npm acidental, mas não substitui revisão de scripts/dependências.

Manifest V3: o arquivo não declara permissões de extensão nem service worker; sua relação com MV3 é **indireta**, por scripts que validam/empacotam `extension/manifest.json`.

## 7. Evidência automatizada

| Contrato | Evidência | Classificação |
|---|---|---|
| `test:unit` exato | `run-jest-ci.js` e `verify-ci-contract.js` comparam string canônica | ✅ PROVADO DIRETAMENTE |
| `test:integration` exclusivo | mesmos dois gates | ✅ PROVADO DIRETAMENTE |
| runner `test:ci` | `verify-ci-contract.js` exige caminho exato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| coverage gerar/verificar/self-test | contrato exige três scripts exatos e etapas bloqueantes | 🟦 GATE ESTÁTICO ESPECÍFICO |
| hooks E2E + runner de grupos + plano | contrato exige strings exatas | 🟦 GATE ESTÁTICO ESPECÍFICO |
| anti-skip rejeita `--forceExit` em script npm | self-test cria package mutante e espera falha | ✅ PROVADO DIRETAMENTE/NEGATIVAMENTE |
| versão `6.5.0` derivada | `version-sync.test.js` cobre derivação e formatos inválidos; `version:check` lê o package real | ✅/🟨 PROVA DE FUNÇÃO + EXECUÇÃO DO ARQUIVO REAL |
| dependência `fake-indexeddb` | suítes importam pacote diretamente | ✅ CONSUMO DIRETO EM TESTE |
| Node mínimo 18 | CI roda 20/22 | 🟨 COBERTURA ACIMA DO PISO, não prova fronteira 18 |
| scripts focais/diagnósticos/watch | sem gate exato localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Análise crítica

1. **`test:all` não executa `validate`.** O nome pode sugerir “tudo”, mas contratos estruturais, publish, policy self-tests e verificadores de infraestrutura ficam fora dessa cadeia. O fluxo de aceitação deve tratar `npm run validate` como gate separado.
2. **Há duplicação nominal da lista Jest unitária.** `package.json`, `run-jest-ci.js` e `jest.config.js` carregam nomes relacionados. Os gates detectam drift importante, mas manutenção ainda exige alterar mais de um ponto.
3. **Vários atalhos não são contratualmente protegidos.** `test:unit:gtc/background/content/popup/reader/inject`, `test:watch` e diagnósticos podem quebrar sem um self-test específico.
4. **`version:sync` tem efeito de escrita.** Não deve ser confundido com `version:check`; rodar sync automaticamente em CI poderia “consertar” checkout inconsistente em vez de reprová-lo.
5. **Ranges com caret não são a versão instalada.** Segurança/reprodutibilidade dependem de commitar e usar o lockfile; `npm ci` é a peça que fixa a árvore concreta.
6. **O piso Node 18 não é testado na borda.** A matriz 20/22 mostra compatibilidade com versões mais novas, não prova Node 18.0.0.
7. **`private: true` não protege release da extensão.** Ele evita publicação npm comum, enquanto publish do zip segue workflow próprio.
8. **Hooks `pretest:e2e*` podem ser contornados.** Quem executa `npx playwright test` diretamente não recebe a preparação automática de imagens.
9. **`mock:server` é processo utilitário persistente.** Scripts agregados não o incluem, o que evita hang; documentação de uso deve deixar lifecycle explícito.
10. **Licença não possui gate de consistência.** `package.json`, README e `LICENSE` hoje dizem MIT, mas mudança unilateral não seria detectada pelos gates encontrados.

## 9. Lacunas de teste

1. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `private: true`.
2. Falta gate garantindo `name` igual ao pacote raiz do lockfile.
3. Falta teste de consistência automática entre `license` e `LICENSE`.
4. Falta execução explícita na CI do limite mínimo Node 18; matriz atual começa em 20.
5. Falta proteção dos aliases `test:unit:*` especializados.
6. Falta gate do texto exato de `test:watch` e `test:open-handles`.
7. Falta teste focal dos aliases de diagnóstico.
8. Falta gate que esclareça formalmente que `test:all` e `validate` são complementares.
9. Falta teste focal do range de cada `devDependency`; o lockfile dá reprodutibilidade, não intenção de range.
10. Falta gate específico do alias `mock:server`.
11. Falta teste que prove o comportamento de hooks `pretest:e2e*` quando acionados via npm, embora o contrato proteja seus valores.
12. Falta verificação explícita de que `description` permaneça informativa e não seja reutilizada como dado operacional.

## 10. Invariantes

1. Deve existir exatamente um `package.json` canônico na raiz; o gate estrutural já rejeita packages legados em `tests/`.
2. `package.json#version` continua sendo a fonte manual única e precisa respeitar SemVer numérico aceito por `sync-version.js`.
3. Manifest e duas posições de versão do lockfile devem permanecer sincronizados com a versão raiz.
4. `test:unit` deve selecionar exatamente os sete projetos unitários reconhecidos pelo runner/config.
5. `test:integration` deve selecionar exclusivamente `integration`.
6. Scripts críticos protegidos por `verify-ci-contract.js` não podem mudar sem alteração consciente do contrato e seus self-tests.
7. Nenhum script npm pode introduzir `--forceExit`, `--passWithNoTests` ou `|| true` sem violar a política atual.
8. E2E normal e por grupo devem preparar fixtures via `test:images`.
9. Coverage precisa passar tanto pela coleta quanto pelo verificador externo.
10. O package não deve virar canal npm de publicação enquanto a distribuição oficial for o artefato de extensão; `private: true` expressa essa intenção.
11. Dependências de tooling permanecem em `devDependencies`, não na extensão empacotada.
12. O lockfile deve continuar sendo usado por `npm ci` para reprodutibilidade.
13. Node suportado declarado não deve ser mais novo que a menor versão coberta pelo processo de aceitação sem decisão explícita.
14. Licença declarada deve permanecer coerente com `LICENSE`.
15. O SHA desta Bíblia só é válido enquanto `package.json` for `33e0b91d1a6f1790124b700d2ce331f80d2b7095`.

## 11. Fonte integral

```json
{
  "name": "manga-translator",
  "version": "6.5.0",
  "description": "Manga Translator - extensão Chromium para tradução automática de mangás e quadrinhos usando Google Gemini",
  "private": true,
  "scripts": {
    "test": "npm run test:ci && npm run test:smoke && npm run test:visual",
    "test:all": "npm run test && npm run test:e2e && npm run test:coverage && npm run test:coverage:verify",
    "test:unit": "jest --config jest.config.js --selectProjects background gtc content-scripts popup reader manifest shared-ui",
    "test:unit:gtc": "jest --config jest.config.js --selectProjects gtc",
    "test:unit:background": "jest --config jest.config.js --selectProjects background",
    "test:unit:content": "jest --config jest.config.js --selectProjects content-scripts",
    "test:unit:popup": "jest --config jest.config.js --selectProjects popup",
    "test:unit:reader": "jest --config jest.config.js --selectProjects reader",
    "test:unit:inject": "jest --config jest.config.js --selectProjects content-scripts --testPathPattern=tests/unit/inject",
    "test:integration": "jest --config jest.config.js --selectProjects integration",
    "test:smoke": "node tests/smoke/run-smoke.js",
    "test:visual": "node tests/visual/run-all.js",
    "pretest:e2e": "npm run test:images",
    "test:e2e": "playwright test --config=playwright.config.js",
    "pretest:e2e:group": "npm run test:images",
    "test:e2e:group": "node scripts/ci/run-e2e-group.js",
    "test:e2e:plan": "node scripts/validation/verify-e2e-shard-plan.js",
    "test:images": "node tests/setup/create-test-images.js",
    "mock:server": "node tests/fixtures/gemini-mock-server.js",
    "test:ci": "node scripts/ci/run-jest-ci.js",
    "test:coverage": "node scripts/ci/run-jest-ci.js --coverage",
    "test:coverage:verify": "node scripts/validation/verify-coverage.js",
    "test:coverage:infra": "node scripts/validation/verify-coverage-selftest.js",
    "test:watch": "jest --config jest.config.js --watch --selectProjects background gtc content-scripts popup reader manifest shared-ui",
    "test:open-handles": "jest --config jest.config.js --detectOpenHandles --runInBand",
    "test:diagnose-workers": "node scripts/maintenance/diagnose-jest-workers.js",
    "test:diagnose-background-leak": "node scripts/maintenance/diagnose-background-leak.js",
    "version:sync": "node scripts/release/sync-version.js",
    "version:check": "node scripts/release/sync-version.js --check",
    "validate:manifest": "node scripts/validation/validate-manifest.js",
    "lint": "node scripts/validation/check-js-syntax.js",
    "validate": "npm run version:check && npm run validate:manifest && npm run lint && npm run validate:structure && npm run validate:test-policy && npm run test:test-policy:infra && npm run validate:publish && node scripts/validation/verify-ci-contract.js && npm run test:ci-contract:infra && npm run test:coverage:infra && node scripts/validation/playwright-gate-reporter-selftest.js && node scripts/validation/verify-jest-worker-warning-selftest.js && npm run test:e2e:plan",
    "validate:structure": "node scripts/validation/verify-repository-structure.js",
    "test:ci-contract:infra": "node scripts/validation/verify-ci-contract-selftest.js",
    "validate:test-policy": "node scripts/validation/verify-test-policy.js",
    "test:test-policy:infra": "node scripts/validation/verify-test-policy-selftest.js",
    "validate:publish": "node scripts/validation/verify-publish-contract.js"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "fake-indexeddb": "^6.2.5",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "MIT"
}
```

## 12. Cobertura linha a linha

### Linha 1

**Fonte:** `{`

**O que faz:** Delimita o objeto JSON raiz que o npm, os scripts de validação e ferramentas Node carregam.

**Como / por que:** A sintaxe de objeto único mantém todos os metadados canônicos no mesmo manifesto.

**Risco de alternativa ingênua:** Fragmentar metadados em arquivos paralelos recriaria múltiplas fontes de verdade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `npm ci`/Node precisam conseguir analisar o JSON; não há assertion focal para esta chave estrutural.

### Linha 2

**Fonte:** `  "name": "manga-translator",`

**O que faz:** Define o nome npm interno `manga-translator`.

**Como / por que:** O nome é replicado no `package-lock.json` raiz, permitindo que lockfile e manifesto descrevam o mesmo pacote.

**Risco de alternativa ingênua:** Renomear apenas um dos dois produziria drift de metadados e dificultaria rastreio de artefatos.

**Evidência automatizada:** 🟨 EVIDÊNCIA DE SUPORTE — o lockfile contém o mesmo nome; não foi localizado gate que rejeite especificamente divergência de `name`.

### Linha 3

**Fonte:** `  "version": "6.5.0",`

**O que faz:** Declara `6.5.0` como versão SemVer canônica do produto.

**Como / por que:** `scripts/release/sync-version.js` lê exatamente `package.json#version`, deriva versão de Manifest, tag, nome do zip e nome do documento; `version:check` compara derivados com Manifest e lockfile.

**Risco de alternativa ingênua:** Hardcode de versão em múltiplos pontos faria release, Manifest e lockfile divergirem silenciosamente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE NO FLUXO DE VERSÃO — `version:check` lê este campo; `version-sync.test.js` prova a derivação de `6.5.0`, formatos com patch e rejeições SemVer.

### Linha 4

**Fonte:** `  "description": "Manga Translator - extensão Chromium para tradução automática de mangás e quadrinhos usando Google Gemini",`

**O que faz:** Descreve o propósito do pacote como extensão Chromium para tradução de mangás/quadrinhos com Gemini.

**Como / por que:** É metadado humano/npm; não altera runtime da extensão.

**Risco de alternativa ingênua:** Usar a descrição como chave lógica seria frágil porque texto editorial pode mudar sem semântica de execução.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi encontrado consumidor operacional desta descrição.

### Linha 5

**Fonte:** `  "private": true,`

**O que faz:** Marca o pacote como privado para impedir publicação npm acidental por fluxo comum de `npm publish`.

**Como / por que:** A flag atua no tooling npm, enquanto a distribuição real é feita pelo workflow que empacota a extensão.

**Risco de alternativa ingênua:** Omitir `private` aumentaria o risco de publicar por engano um pacote que não é o canal de release do produto.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum gate focal encontrado para `private: true`.

### Linha 6

**Fonte:** `  "scripts": {`

**O que faz:** Abre o mapa de comandos npm usado como fachada operacional do repositório.

**Como / por que:** Os nomes abaixo centralizam Jest, Playwright, smoke, visual, versionamento, diagnósticos e validações.

**Risco de alternativa ingênua:** Invocar caminhos internos manualmente em documentação/CI espalharia contratos e facilitaria drift.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — CI e documentação chamam vários scripts deste mapa; a existência do objeto inteiro não tem assertion isolada.

### Linha 7

**Fonte:** `    "test": "npm run test:ci && npm run test:smoke && npm run test:visual",`

**O que faz:** Define o comando padrão `npm test` como Jest auditado seguido por smoke e visual, com `&&` fail-fast.

**Como / por que:** Cada etapa só inicia se a anterior retornar zero; `test:ci` aplica inventário/skip checks antes de smoke e visual.

**Risco de alternativa ingênua:** Usar `;` ou mascaramento permitiria que falhas anteriores fossem ignoradas.

**Evidência automatizada:** 🟦 GATE ESTÁTICO DE CONTEXTO — `verify-ci-contract.js` exige `npm test` no fresh developer flow e `verify-test-policy.js` proíbe `|| true`; o texto exato completo não é fixado por gate.

### Linha 8

**Fonte:** `    "test:all": "npm run test && npm run test:e2e && npm run test:coverage && npm run test:coverage:verify",`

**O que faz:** Define `test:all` como `npm test` + E2E + geração de coverage + verificação de coverage.

**Como / por que:** A cadeia agrega suites funcionais e integridade de cobertura, mas mantém `validate` separado.

**Risco de alternativa ingênua:** Chamar isso de validação total do repositório seria enganoso: contratos estruturais/publish/policy vivem em `validate`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a composição exata; a CI protege separadamente várias etapas componentes.

### Linha 9

**Fonte:** `    "test:unit": "jest --config jest.config.js --selectProjects background gtc content-scripts popup reader manifest shared-ui",`

**O que faz:** Seleciona exatamente os sete projetos Jest unitários canônicos.

**Como / por que:** A lista coincide com `run-jest-ci.js` e os `displayName` de `jest.config.js`.

**Risco de alternativa ingênua:** Adicionar/remover um projeto só aqui poderia omitir testes ou quebrar seleção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — `run-jest-ci.js` calcula a string esperada e falha se `package.json#test:unit` divergir; `verify-ci-contract.js` repete o gate exato.

### Linha 10

**Fonte:** `    "test:unit:gtc": "jest --config jest.config.js --selectProjects gtc",`

**O que faz:** Oferece atalho focado para o projeto Jest `gtc`.

**Como / por que:** Reusa a configuração canônica e restringe `--selectProjects` ao domínio GTC.

**Risco de alternativa ingênua:** Criar config Jest separada para GTC duplicaria ambiente, globs e setup.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o projeto `gtc` existe em `jest.config.js`, mas não foi localizado gate do texto exato deste atalho.

### Linha 11

**Fonte:** `    "test:unit:background": "jest --config jest.config.js --selectProjects background",`

**O que faz:** Oferece atalho unitário do projeto `background`.

**Como / por que:** Usa o mesmo `jest.config.js`, preservando ambiente Node e mocks definidos no projeto.

**Risco de alternativa ingênua:** Um runner alternativo poderia escapar da topologia auditada do Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — projeto existente; sem assertion focal deste script especializado.

### Linha 12

**Fonte:** `    "test:unit:content": "jest --config jest.config.js --selectProjects content-scripts",`

**O que faz:** Oferece atalho para o projeto `content-scripts`.

**Como / por que:** A seleção cobre os globs content-manga, content-gemini e inject configurados no projeto.

**Risco de alternativa ingênua:** Apontar diretamente a diretórios sem `--selectProjects` poderia perder setup jsdom/Chrome comum.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — configuração do projeto é real; o alias npm não tem gate próprio localizado.

### Linha 13

**Fonte:** `    "test:unit:popup": "jest --config jest.config.js --selectProjects popup",`

**O que faz:** Oferece atalho para o projeto `popup`.

**Como / por que:** Mantém jsdom e mocks do projeto canônico via `jest.config.js`.

**Risco de alternativa ingênua:** Config paralela aumentaria risco de comportamento diferente entre execução focal e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — sem teste focal do alias.

### Linha 14

**Fonte:** `    "test:unit:reader": "jest --config jest.config.js --selectProjects reader",`

**O que faz:** Oferece atalho para o projeto `reader`.

**Como / por que:** Seleciona o `displayName` reader sem redefinir globs ou ambiente.

**Risco de alternativa ingênua:** Duplicar opções de Jest no script faria manutenção divergir do config.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — sem gate específico do alias.

### Linha 15

**Fonte:** `    "test:unit:inject": "jest --config jest.config.js --selectProjects content-scripts --testPathPattern=tests/unit/inject",`

**O que faz:** Executa apenas testes de `tests/unit/inject` dentro do projeto `content-scripts`.

**Como / por que:** Combina `--selectProjects content-scripts` com filtro de caminho, preservando o setup do projeto e estreitando o inventário.

**Risco de alternativa ingênua:** Rodar o caminho fora do projeto poderia alterar ambiente; um padrão de caminho obsoleto também pode quebrar em upgrade de Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado gate que execute/proteja este alias exato.

### Linha 16

**Fonte:** `    "test:integration": "jest --config jest.config.js --selectProjects integration",`

**O que faz:** Seleciona exclusivamente o projeto Jest `integration`.

**Como / por que:** O comando é a contraparte da partição unitária usada por `run-jest-ci.js`.

**Risco de alternativa ingênua:** Misturar unitários e integração aqui destruiria a separação que o gate de inventário mede.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — `run-jest-ci.js` e `verify-ci-contract.js` exigem exatamente esta string.

### Linha 17

**Fonte:** `    "test:smoke": "node tests/smoke/run-smoke.js",`

**O que faz:** Encaminha `test:smoke` para `tests/smoke/run-smoke.js`.

**Como / por que:** Mantém a suíte smoke fora do Jest e com runner Node próprio.

**Risco de alternativa ingênua:** Executar arquivos smoke ad hoc poderia alterar ordem/inventário definido pelo runner.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI chama `npm run test:smoke`; não foi localizado gate que fixe o caminho exato do runner no package.

### Linha 18

**Fonte:** `    "test:visual": "node tests/visual/run-all.js",`

**O que faz:** Encaminha `test:visual` para `tests/visual/run-all.js`.

**Como / por que:** O runner visual lê inclusive `package.json#version` para derivar versão de produto usada pelos testes.

**Risco de alternativa ingênua:** Separar versão visual da raiz reintroduziria hardcode de versão.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — CI executa o script e o runner consome `package.json#version`; sem assertion focal da entrada npm.

### Linha 19

**Fonte:** `    "pretest:e2e": "npm run test:images",`

**O que faz:** Usa o hook npm `pretest:e2e` para gerar fixtures antes do E2E normal.

**Como / por que:** O npm executa automaticamente o `pre...` quando `npm run test:e2e` é chamado.

**Risco de alternativa ingênua:** Sem preparação, E2E pode depender de PNGs inexistentes/obsoletos; chamar Playwright diretamente também contorna o hook.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente `npm run test:images` neste hook.

### Linha 20

**Fonte:** `    "test:e2e": "playwright test --config=playwright.config.js",`

**O que faz:** Executa Playwright com a configuração raiz canônica.

**Como / por que:** A CLI carrega `playwright.config.js`, que por sua vez importa `@playwright/test` e define política de CI/reporter/browser.

**Risco de alternativa ingênua:** Usar config implícita ou secundária poderia mudar retries, workers, reporter e modo de browser.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — jobs E2E usam o comando; a CI contract exige presença de `npm run test:e2e`, mas não fixa toda esta string.

### Linha 21

**Fonte:** `    "pretest:e2e:group": "npm run test:images",`

**O que faz:** Replica a preparação de fixtures para execuções E2E por grupo.

**Como / por que:** O hook `pretest:e2e:group` é acionado automaticamente antes do runner de grupo.

**Risco de alternativa ingênua:** Sem paridade com o E2E normal, shards poderiam falhar por fixture ausente enquanto execução local passa.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente `npm run test:images`.

### Linha 22

**Fonte:** `    "test:e2e:group": "node scripts/ci/run-e2e-group.js",`

**O que faz:** Encaminha grupos E2E para `scripts/ci/run-e2e-group.js`.

**Como / por que:** O runner lê plano de shards e aplica workers/grupo de modo explícito.

**Risco de alternativa ingênua:** Executar Playwright com sharding automático recolocaria a lógica que o contrato da CI proíbe.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente este runner e verifica que ele aplica workers do plano.

### Linha 23

**Fonte:** `    "test:e2e:plan": "node scripts/validation/verify-e2e-shard-plan.js",`

**O que faz:** Expõe o verificador do plano E2E.

**Como / por que:** `verify-e2e-shard-plan.js` valida a cobertura/inventário dos grupos antes do merge dos blob reports.

**Risco de alternativa ingênua:** Mesclar resultados sem validar plano pode esconder spec omitida ou duplicada.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige este comando exato e que o gate E2E execute `test:e2e:plan`.

### Linha 24

**Fonte:** `    "test:images": "node tests/setup/create-test-images.js",`

**O que faz:** Gera as imagens/fixtures de teste pela fonte canônica.

**Como / por que:** Os hooks E2E das linhas 19 e 21 dependem deste alias.

**Risco de alternativa ingênua:** Gerar fixtures por caminhos diferentes em cada workflow causaria drift de dados de teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — hooks e CI dependem dele; o gate fixa os hooks, mas não possui assertion isolada sobre a string deste alias.

### Linha 25

**Fonte:** `    "mock:server": "node tests/fixtures/gemini-mock-server.js",`

**O que faz:** Inicia o servidor mock de Gemini usado para cenários que precisam de endpoint local.

**Como / por que:** É um comando utilitário/long-running, não parte das cadeias `test` ou `validate`.

**Risco de alternativa ingênua:** Incluir servidor persistente sem lifecycle controlado em agregados poderia bloquear a execução.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum gate focal deste alias foi localizado.

### Linha 26

**Fonte:** `    "test:ci": "node scripts/ci/run-jest-ci.js",`

**O que faz:** Encaminha Jest de CI ao runner auditável `scripts/ci/run-jest-ci.js`.

**Como / por que:** O runner executa Jest, mede inventário, skipped/TODO/falhas e valida a partição unit/integration.

**Risco de alternativa ingênua:** Chamar `jest` cru na CI perderia essas verificações adicionais.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — `verify-ci-contract.js` exige a string exata; a CI chama `npm run test:ci`.

### Linha 27

**Fonte:** `    "test:coverage": "node scripts/ci/run-jest-ci.js --coverage",`

**O que faz:** Ativa coverage no mesmo runner Jest auditável por `--coverage`.

**Como / por que:** O runner adiciona `--coverage`, limita workers e injeta `COVERAGE_MODE=1`, fazendo `jest.config.js` ativar V8/reporters.

**Risco de alternativa ingênua:** Um runner separado de coverage poderia executar inventário diferente do teste normal.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente esta string.

### Linha 28

**Fonte:** `    "test:coverage:verify": "node scripts/validation/verify-coverage.js",`

**O que faz:** Executa o verificador de integridade/thresholds do relatório de coverage.

**Como / por que:** Separa coleta (`test:coverage`) de aprovação do relatório (`verify-coverage.js`).

**Risco de alternativa ingênua:** Confiar apenas no exit code do Jest não aplica necessariamente a política externa de coverage.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente o verificador e etapas bloqueantes na CI.

### Linha 29

**Fonte:** `    "test:coverage:infra": "node scripts/validation/verify-coverage-selftest.js",`

**O que faz:** Executa o self-test do verificador de coverage.

**Como / por que:** O self-test protege a própria infraestrutura de validação contra regressões que aceitariam relatórios inválidos.

**Risco de alternativa ingênua:** Sem teste negativo do gate, um verificador quebrado poderia produzir verde falso.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige este comando exato e a CI o executa.

### Linha 30

**Fonte:** `    "test:watch": "jest --config jest.config.js --watch --selectProjects background gtc content-scripts popup reader manifest shared-ui",`

**O que faz:** Executa os projetos unitários em modo watch para desenvolvimento local.

**Como / por que:** Reusa exatamente a lista unitária principal, mas adiciona `--watch`.

**Risco de alternativa ingênua:** Watch em CI seria interativo e não terminaria; manter o mesmo conjunto reduz diferenças locais.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há gate focal do alias ou igualdade com `test:unit`.

### Linha 31

**Fonte:** `    "test:open-handles": "jest --config jest.config.js --detectOpenHandles --runInBand",`

**O que faz:** Executa Jest serialmente com `--detectOpenHandles` para diagnóstico de recursos não encerrados.

**Como / por que:** `--runInBand` reduz concorrência e ajuda atribuir handles ao teste causador.

**Risco de alternativa ingênua:** Usar `--forceExit` esconderia leaks; a política do repositório proíbe esse escape hatch.

**Evidência automatizada:** 🟨 CONTRATO DE DIAGNÓSTICO — `verify-test-policy.js` proíbe `--forceExit`, mas não há teste focal desta composição.

### Linha 32

**Fonte:** `    "test:diagnose-workers": "node scripts/maintenance/diagnose-jest-workers.js",`

**O que faz:** Encaminha diagnóstico de workers Jest ao script de manutenção.

**Como / por que:** Esse diagnóstico gera evidência sobre processos/workers e grava resultados na infraestrutura esperada.

**Risco de alternativa ingênua:** Misturar diagnóstico com runner de aprovação poderia transformar telemetria em critério implícito e frágil.

**Evidência automatizada:** 🟦 GATE PARCIAL — `verify-ci-contract.js` inspeciona o script de diagnóstico e seu diretório de saída, mas não fixa este alias npm.

### Linha 33

**Fonte:** `    "test:diagnose-background-leak": "node scripts/maintenance/diagnose-background-leak.js",`

**O que faz:** Encaminha diagnóstico específico de leak do background.

**Como / por que:** Mantém investigação de leak separada da execução normal.

**Risco de alternativa ingênua:** Executá-lo sempre na suíte aumentaria custo e poderia confundir diagnóstico com teste funcional.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este alias.

### Linha 34

**Fonte:** `    "version:sync": "node scripts/release/sync-version.js",`

**O que faz:** Sincroniza metadados derivados a partir de `package.json#version`.

**Como / por que:** Sem `--check`, `sync-version.js` pode reescrever versão do Manifest e do lockfile para alinhar com a fonte canônica.

**Risco de alternativa ingênua:** Editar todos os arquivos manualmente amplia chance de versão divergente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no módulo de sync — funções de sincronização/derivação são exercitadas; o comando em si é também documentado como fluxo de release.

### Linha 35

**Fonte:** `    "version:check": "node scripts/release/sync-version.js --check",`

**O que faz:** Verifica, sem intenção de sincronizar silenciosamente, que Manifest/lockfile e artefatos derivados continuam coerentes com a versão raiz.

**Como / por que:** Passa `--check`; diferenças definem exit code 1.

**Risco de alternativa ingênua:** Sincronizar automaticamente dentro da CI esconderia que o commit chegou inconsistente.

**Evidência automatizada:** 🟦/🟨 GATE OPERACIONAL — CI e publish executam `npm run version:check`; `verify-ci-contract.js` e `verify-publish-contract.js` exigem sua presença.

### Linha 36

**Fonte:** `    "validate:manifest": "node scripts/validation/validate-manifest.js",`

**O que faz:** Valida o `extension/manifest.json` pelo script canônico.

**Como / por que:** Mantém validação de Manifest como etapa nomeada e reutilizável.

**Risco de alternativa ingênua:** Validação embutida apenas no workflow seria menos reutilizável localmente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — CI chama o alias; sem gate do texto exato do caminho encontrado.

### Linha 37

**Fonte:** `    "lint": "node scripts/validation/check-js-syntax.js",`

**O que faz:** Define `lint` como verificação de sintaxe JavaScript do repositório.

**Como / por que:** O projeto usa um checker Node dedicado em vez de declarar ESLint aqui.

**Risco de alternativa ingênua:** Chamar essa etapa de lint sem entender o script poderia sugerir regras estilísticas que ele não necessariamente aplica.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — CI chama `npm run lint`; não há assertion focal do alias exato.

### Linha 38

**Fonte:** `    "validate": "npm run version:check && npm run validate:manifest && npm run lint && npm run validate:structure && npm run validate:test-policy && npm run test:test-policy:infra && npm run validate:publish && node scripts/validation/verify-ci-contract.js && npm run test:ci-contract:infra && npm run test:coverage:infra && node scripts/validation/playwright-gate-reporter-selftest.js && node scripts/validation/verify-jest-worker-warning-selftest.js && npm run test:e2e:plan",`

**O que faz:** Compõe o gate `validate` com versão, Manifest, sintaxe, estrutura, política anti-skip, self-tests, publicação, contrato CI, coverage infra, reporter E2E, warning de worker e plano E2E.

**Como / por que:** Usa `&&`, portanto a primeira violação interrompe o agregado; mistura aliases npm e scripts Node diretos.

**Risco de alternativa ingênua:** Remover uma etapa pode abrir buraco de governança; por outro lado, duplicar a CI inteira aqui criaria duas orquestrações a sincronizar.

**Evidência automatizada:** 🟨 EVIDÊNCIA DE SUPORTE — vários componentes são protegidos individualmente por `verify-ci-contract.js`; não foi localizado gate que fixe a string agregada inteira.

### Linha 39

**Fonte:** `    "validate:structure": "node scripts/validation/verify-repository-structure.js",`

**O que faz:** Expõe o gate estrutural do repositório.

**Como / por que:** `verify-repository-structure.js` valida unicidade de configs/package, caminhos legados, Bíblias e invariantes de coordenação.

**Risco de alternativa ingênua:** Sem esse alias, o script ainda existe, mas o fluxo local fica menos descobrível.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `validate` o chama; a CI também executa o script diretamente.

### Linha 40

**Fonte:** `    "test:ci-contract:infra": "node scripts/validation/verify-ci-contract-selftest.js",`

**O que faz:** Executa o self-test negativo do contrato da CI.

**Como / por que:** O self-test cria sandboxes, enfraquece configurações e exige que `verify-ci-contract.js` falhe pelo motivo esperado.

**Risco de alternativa ingênua:** Um contrato sem self-test pode deixar de detectar regressões e continuar verde.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente este alias.

### Linha 41

**Fonte:** `    "validate:test-policy": "node scripts/validation/verify-test-policy.js",`

**O que faz:** Executa a política anti-skip/escape-hatch.

**Como / por que:** O verificador lê todos os `package.json#scripts` e rejeita `--forceExit`, `--passWithNoTests` e `|| true`, além de políticas em testes/workflow.

**Risco de alternativa ingênua:** Sem esse gate, comandos poderiam mascarar falhas ou pular testes.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente este alias; a CI o executa.

### Linha 42

**Fonte:** `    "test:test-policy:infra": "node scripts/validation/verify-test-policy-selftest.js",`

**O que faz:** Executa o self-test da política anti-skip.

**Como / por que:** O self-test prova baseline válida e mutações como `jest --forceExit`, `test.skip` e workflow com `|| true`.

**Risco de alternativa ingênua:** Validar apenas o texto do verificador não demonstra que ele realmente rejeita violações.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/NEGATIVAMENTE — `verify-test-policy-selftest.js` cria `package.json` mutante e exige falha por `--forceExit`; `verify-ci-contract.js` fixa este alias.

### Linha 43

**Fonte:** `    "validate:publish": "node scripts/validation/verify-publish-contract.js"`

**O que faz:** Executa o contrato de publicação.

**Como / por que:** O verificador confere workflow de publish, caminhos canônicos e ausência de workspace legado.

**Risco de alternativa ingênua:** Sem gate, release poderia voltar a copiar arquivos errados ou depender de caminhos removidos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige exatamente este alias e a presença do gate no workflow.

### Linha 44

**Fonte:** `  },`

**O que faz:** Fecha o objeto `scripts` sem adicionar comandos fora da fachada npm.

**Como / por que:** A vírgula conecta o próximo bloco `devDependencies` no objeto raiz.

**Risco de alternativa ingênua:** Erro de pontuação invalidaria o JSON inteiro; mover scripts para outro objeto os tornaria invisíveis ao npm.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parsing por npm/Node cobre sintaxe, sem assertion focal da linha.

### Linha 45

**Fonte:** `  "devDependencies": {`

**O que faz:** Abre `devDependencies`, indicando que ferramentas abaixo são necessárias para desenvolvimento/testes e não como dependências runtime empacotadas da extensão.

**Como / por que:** A extensão é distribuída a partir de `extension/`, enquanto tooling Node fica na raiz.

**Risco de alternativa ingênua:** Colocar tooling como dependência runtime sugeriria necessidade de instalação no browser e ampliaria árvore conceitual de produção.

**Evidência automatizada:** 🟨 EVIDÊNCIA DE SUPORTE — lockfile materializa o mesmo bloco; sem gate específico da classificação dev.

### Linha 46

**Fonte:** `    "@playwright/test": "^1.44.0",`

**O que faz:** Declara `@playwright/test` com faixa compatível `^1.44.0`.

**Como / por que:** `playwright.config.js` e specs E2E importam o pacote; o lock atual resolve uma versão concreta dentro da faixa.

**Risco de alternativa ingênua:** Sem a dependência, CLI/config/specs E2E não carregam; faixa com caret também permite upgrades minor/patch no próximo lock refresh.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — E2E/CI exercem Playwright e o lockfile registra a dependência; não há teste focal do range `^1.44.0`.

### Linha 47

**Fonte:** `    "fake-indexeddb": "^6.2.5",`

**O que faz:** Declara `fake-indexeddb` para testes de persistência IndexedDB sem browser real.

**Como / por que:** Smoke, unit GTC e integrações importam `fake-indexeddb`/`fake-indexeddb/auto`.

**Risco de alternativa ingênua:** Mocks caseiros divergentes de IndexedDB poderiam mascarar comportamento transacional.

**Evidência automatizada:** ✅ PROVADO PELO CONSUMO DIRETO EM TESTES — múltiplas suítes requerem o pacote; o range exato não tem gate focal.

### Linha 48

**Fonte:** `    "jest": "^29.7.0",`

**O que faz:** Declara Jest 29.7 como test runner da matriz unit/integration.

**Como / por que:** Scripts `jest ...` e `run-jest-ci.js` dependem do binário instalado; `jest.config.js` define os projetos.

**Risco de alternativa ingênua:** Sem Jest os comandos centrais falham; mudar major pode alterar CLI/config semantics.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — toda suíte Jest e CI depende dele; o range exato não é protegido por assertion focal.

### Linha 49

**Fonte:** `    "jest-environment-jsdom": "^29.7.0"`

**O que faz:** Declara o ambiente jsdom separado exigido pelo Jest 29.

**Como / por que:** Projetos content/popup/reader/shared-ui/integration usam `testEnvironment: 'jsdom'`, que em Jest moderno requer pacote próprio.

**Risco de alternativa ingênua:** Omiti-lo faria projetos DOM falharem ao resolver ambiente; versão desalinhada com Jest pode causar incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — projetos jsdom rodam na CI; sem gate do range exato.

### Linha 50

**Fonte:** `  },`

**O que faz:** Fecha `devDependencies` e mantém o próximo bloco no objeto raiz.

**Como / por que:** Conserva dependências de tooling separadas de engines/licença.

**Risco de alternativa ingênua:** Pontuação incorreta invalida parsing; mover `engines` para dentro de devDependencies mudaria semântica.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo parser JSON/npm.

### Linha 51

**Fonte:** `  "engines": {`

**O que faz:** Abre a restrição declarativa de engines.

**Como / por que:** Separa compatibilidade de runtime Node dos ranges de dependências.

**Risco de alternativa ingênua:** Misturar requisito Node com scripts não permite ao npm/tooling expor compatibilidade do pacote.

**Evidência automatizada:** 🟨 EVIDÊNCIA DE SUPORTE — o lockfile repete engines; não há gate focal do bloco.

### Linha 52

**Fonte:** `    "node": ">=18.0.0"`

**O que faz:** Declara Node mínimo `>=18.0.0`.

**Como / por que:** A CI roda Node 20.x e 22.x, portanto está acima do piso; npm pode avisar/rejeitar conforme configuração quando engine não é satisfeita.

**Risco de alternativa ingênua:** Um piso mais baixo poderia prometer suporte não testado; um piso mais alto que a CI seria incoerente.

**Evidência automatizada:** 🟨 TESTADO POR POPULAÇÃO MAIS NOVA — CI cobre Node 20/22, mas ⚠️ não prova especificamente Node 18.0.0 nem a fronteira mínima.

### Linha 53

**Fonte:** `  },`

**O que faz:** Fecha o objeto `engines`.

**Como / por que:** Retorna ao nível raiz antes da licença.

**Risco de alternativa ingênua:** Encapsulamento errado faria `license` ser interpretada como engine inexistente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo parser e tooling.

### Linha 54

**Fonte:** `  "license": "MIT"`

**O que faz:** Declara licença MIT, coerente com o arquivo `LICENSE` e badge do README.

**Como / por que:** É metadado de distribuição; não modifica execução de testes ou extensão.

**Risco de alternativa ingênua:** Divergir de `LICENSE` criaria ambiguidade jurídica/documental mesmo sem quebrar a build.

**Evidência automatizada:** 🟨 EVIDÊNCIA DOCUMENTAL — `LICENSE` e README também declaram MIT; nenhum gate focal de consistência foi localizado.

### Linha 55

**Fonte:** `}`

**O que faz:** Fecha o objeto raiz do manifesto npm.

**Como / por que:** Completa JSON válido com todos os blocos no mesmo documento.

**Risco de alternativa ingênua:** Objeto incompleto impediria `npm ci` e qualquer consumidor JSON de carregar o projeto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — npm/Node analisam o arquivo em fluxos normais.

### Linha 56

**Fonte:** `␤ [newline final LF]`

**O que faz:** Representa a posição vazia criada pelo newline final LF após a chave de fechamento.

**Como / por que:** O arquivo termina com LF, mantendo convenção POSIX e fazendo `source.split('\n').length` contar 56 posições para o gate das Bíblias.

**Risco de alternativa ingênua:** Omitir esta posição na documentação reprovaria a cobertura estrutural apesar de haver só 55 linhas textuais.

**Evidência automatizada:** 🟦 GATE ESTRUTURAL ESPECÍFICO — `verify-repository-structure.js` calcula posições com `split('\n')` e exige 56 headings sequenciais.

# Bíblia técnica — `package.json`

> **Schema da Bíblia:** 2
> **Índice:** 63
> **Fonte:** `package.json`
> **SHA auditado:** `51bbd80a5a8a6c49385ce7aa4ec10afc79c7aa48`
> **Posições da fonte:** 59
> **Autoauditoria:** READY_FOR_AUDIT

## 1. Papel arquitetural

`package.json` é a fachada operacional Node/npm do repositório. Centraliza versão do projeto, comandos canônicos de validação/teste, dependências de desenvolvimento e o piso de Node declarado.

Neste SHA, a cadeia `validate` também incorpora a infraestrutura documental do PR #66: validação estrutural canônica, verificação determinística de STATUS/CHECKLIST e self-tests do validador das Bíblias.

## 2. Dependências, consumidores e wiring

- GitHub Actions invoca scripts npm deste arquivo em CI.
- `jest.config.js` fornece os projetos selecionados pelos aliases `test:unit:*`.
- `playwright.config.js` é usado por `test:e2e`.
- `scripts/validation/verify-repository-structure.js`, `bible-coordination.js`, `generate-bible-projections.js` e seus self-tests compõem os gates documentais adicionados neste recovery.
- `scripts/release/sync-version.js` usa a versão raiz como fonte canônica para sincronização de release.

## 3. Fluxos e contratos relevantes

- `test` executa Jest canônico + smoke + visual.
- `test:all` acrescenta E2E e coverage, mas continua separado de `validate`; a request `063-001` preserva essa ambiguidade de naming.
- `validate` encadeia version/manifest/syntax/structure/projeções/self-tests/policy/publish/CI contract/coverage infra/E2E plan.
- `validate:bible-projections` é modo check; `write:bible-projections` é modo write determinístico.
- `engines.node` permanece `>=18.0.0`; `063-002` continua aceito porque a matriz funcional observada não exercita o piso 18.

## 4. Invariantes

1. Deve existir um único `package.json` canônico na raiz.
2. Scripts canônicos não devem depender do diretório `tests/` como package separado.
3. `validate:bible-projections` não deve modificar arquivos; o modo de escrita é explicitamente separado.
4. Alterar versão exige manter integridade com manifest/lock/docs/workflows via `version:check`.
5. Alias especializado só deve ser tratado como contrato quando explicitamente protegido/documentado; `063-003` permanece aberto para essa decisão.

## 5. Matriz de evidência

| Afirmação | Evidência | Classificação | Limite |
|---|---|---|---|
| scripts principais apontam para tooling real | caminhos literais deste arquivo + CI | GATE_ESTATICO | existência do comando não prova todos os branches runtime |
| projetos Jest especializados são selecionáveis | `jest.config.js` + aliases | EXECUCAO_INDIRETA | nem todo alias possui self-test focal |
| projeções das Bíblias têm check/write separados | scripts 45–46 | PROVA_DIRETA documental | ainda depende do gerador/validator passarem na CI |
| Node >=18 é promessa declarada | `engines` | GATE_ESTATICO | CI 20/22 não prova Node 18 |

## 6. Lacunas e solicitações ao auditor

- `063-001` — ACCEPTED: esclarecer contrato entre `test:all` e `validate`.
- `063-002` — ACCEPTED: alinhar `engines >=18` com runtime mínimo realmente testado.
- `063-003` — ACCEPTED: decidir quais aliases especializados são interface CLI suportada.

Essas requests são externas e não bloqueiam a fidelidade desta Bíblia, desde que não sejam tratadas como prova inexistente.

## 7. Fonte integral exata

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
    "validate": "npm run version:check && npm run validate:manifest && npm run lint && npm run validate:structure && npm run validate:bible-projections && npm run test:bible-coordination:infra && npm run validate:test-policy && npm run test:test-policy:infra && npm run validate:publish && node scripts/validation/verify-ci-contract.js && npm run test:ci-contract:infra && npm run test:coverage:infra && node scripts/validation/playwright-gate-reporter-selftest.js && node scripts/validation/verify-jest-worker-warning-selftest.js && npm run test:e2e:plan",
    "validate:structure": "node scripts/validation/verify-repository-structure.js",
    "test:ci-contract:infra": "node scripts/validation/verify-ci-contract-selftest.js",
    "validate:test-policy": "node scripts/validation/verify-test-policy.js",
    "test:test-policy:infra": "node scripts/validation/verify-test-policy-selftest.js",
    "validate:publish": "node scripts/validation/verify-publish-contract.js",
    "test:bible-coordination:infra": "node scripts/validation/verify-bible-coordination-selftest.js",
    "validate:bible-projections": "node scripts/validation/generate-bible-projections.js",
    "write:bible-projections": "node scripts/validation/generate-bible-projections.js --write"
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

## 8. Cobertura documental por posições/faixas

### Posições 1–5 — identidade, versão e privacidade

Define nome, versão canônica, descrição e `private: true`.

### Posições 6–47 — interface npm e gates

Contém todos os comandos de teste, diagnóstico, release e validação. As posições 38–46 concentram a cadeia de validação e os gates documentais adicionados neste recovery.

### Posições 48–53 — dependências de desenvolvimento

Declara Playwright, fake-indexeddb, Jest e jsdom environment; versões são ranges npm e não vendorizam dependências.

### Posições 54–56 — contrato de runtime Node

Declara `node >=18.0.0`; a lacuna de teste do piso permanece em `063-002`.

### Posições 57–58 — licença e fechamento JSON

Registra MIT e fecha o objeto raiz.

### Posição 59 — newline final

Posição vazia terminal criada pelo LF final do blob.

## 9. Casos-limite, riscos, segurança e performance

- Um alias npm quebrado pode não aparecer se não for usado pela CI principal.
- `test:all` não substitui `validate`.
- Dependências sem pin exato podem evoluir dentro do range; lockfile permanece o mecanismo reprodutível.
- O piso Node declarado deve permanecer coerente com APIs usadas por scripts.

## 10. Autoauditoria documental

- [x] SHA atualizado para o blob atual.
- [x] fonte integral copiada do source atual.
- [x] 59/59 posições cobertas sem gap/overlap.
- [x] requests 063-001..003 preservadas no state.
- [x] nenhum claim transforma execução indireta em prova direta.

**Autoauditoria:** READY_FOR_AUDIT.

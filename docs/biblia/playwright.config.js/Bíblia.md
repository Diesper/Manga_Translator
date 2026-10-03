# Bíblia técnica — playwright.config.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `6a27b774a0009db800a70969eaad18716fb5f565`  
> **Agente responsável pela auditoria:** AGENTE 1  
> **Tipo:** configuração Playwright/E2E canônica da raiz  
> **Linhas textuais:** **55**  
> **Posições documentais:** **56**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`playwright.config.js` é a configuração canônica do Playwright Test na raiz do Manga Translator. Ela controla descoberta E2E, paralelismo, workers, retries, proteção contra `test.only`, reporters, metadados de projeto, defaults de browser e o processo HTTP mock usado pelos cenários MV3.

Os consumers principais são `package.json#test:e2e`, `scripts/ci/run-e2e-group.js` e `scripts/validation/verify-e2e-shard-plan.js`. O primeiro chama a CLI com este arquivo; o segundo filtra grupos por tag e injeta workers; o terceiro executa o Playwright real em `--list` para provar que o plano cobre o inventário.

Na CI, cinco grupos (`fifo`, `attachment`, `medium-a`, `medium-b`, `fast`) produzem blob reports. O job agregado baixa exatamente cinco blobs e usa `scripts/ci/playwright-merge.config.js` para aplicar o reporter de gate após a junção.

## 2. Dependências e consumers

- `@playwright/test`: fornece `defineConfig`, `devices` e a CLI que interpreta este arquivo.
- Node `path`: constrói caminhos portáveis para `extension/` e o mock server.
- `scripts/ci/playwright-gate-reporter.js`: política de baseline, skipped, flaky e falhas.
- `scripts/ci/data/e2e-shard-plan.json`: cinco grupos, workers 1/3/2/2/3 e 21 testes no baseline.
- `scripts/ci/run-e2e-group.js`: injeta `MANGA_E2E_SHARD=1` e `MANGA_E2E_WORKERS`.
- `scripts/validation/verify-e2e-shard-plan.js`: executa este config real e verifica união/interseção do inventário.
- `scripts/validation/verify-ci-contract.js` e self-test: protegem propriedades críticas deste arquivo.
- `.github/workflows/ci.yml`: instala Chromium, executa shards com Xvfb, publica blobs e mescla resultados.
- `tests/fixtures/gemini-mock-server.js`: servidor local na porta 3999.
- `tests/e2e/translation-flow.spec.js`, `cache-and-storage.spec.js` e `reader-offline.spec.js`: corpus E2E atual.

## 3. Distinção crítica — runner versus browser real da extensão

Os três specs atuais importam `chromium` e criam `chromium.launchPersistentContext(...)` manualmente. Por isso, `channel`, `launchOptions`, `headless`, `viewport`, `screenshot`, `video` e o preset `Desktop Chrome` do bloco `use` **não são automaticamente aplicados aos contexts persistentes que hospedam a extensão**.

Os specs repetem flags de extensão, sandbox e a lógica de `--headless=new`. `reader-offline.spec.js` define viewport manualmente. Busca no corpus E2E não encontrou `recordVideo`, chamada de `screenshot` nem `trace`, então não há prova de que a política de mídia deste config produza artefatos para esses contexts.

`testDir`, workers, retries, `forbidOnly`, reporters, metadata de projeto e `webServer` continuam sendo interpretados pelo Playwright Test; a distinção apenas impede atribuir ao `use` um efeito que os contexts manuais não herdam.

## 4. WebServer e lifecycle

`webServer` inicia `tests/fixtures/gemini-mock-server.js` com `process.execPath`. O mock declara `PORT = 3999` e fornece `/health`, Gemini mock, manga page e imagens.

Existe divergência documental: o mock comenta que `/health` é usado por `playwright.config.js`, mas este config informa somente `port: 3999`. A prontidão é baseada na porta. Com `reuseExistingServer: true`, outro processo já ouvindo em 3999 pode ser reutilizado localmente.

## 5. Segurança e trust boundaries

- `--no-sandbox` e `--disable-setuid-sandbox` reduzem isolamento e devem ficar restritos ao ambiente de teste controlado.
- A extensão MV3 real é carregada de `extension/`, então permissões e service worker reais participam do E2E.
- O mock é local e permissivo por desenho de teste; seu CORS não representa política de produção.
- Variáveis de ambiente controlam concorrência/retries e podem alterar CPU, memória e duração.
- Reporters são código do repositório executado pela CI e integram o boundary de confiança do gate.

## 6. Evidência automatizada

| Propriedade | Evidência | Classificação |
|---|---|---|
| inventário real/grupos | `verify-e2e-shard-plan.js` executa Playwright com este config e exige união exata | ✅ PROVADO DIRETAMENTE |
| `fullyParallel` | literal obrigatório no contrato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| retries CI = 0 | literal obrigatório no contrato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `forbidOnly` | contrato + self-test que enfraquece o literal | 🟦 GATE ESTÁTICO ESPECÍFICO |
| reporter de gate | contrato exige o caminho | 🟦 GATE ESTÁTICO ESPECÍFICO |
| política do reporter | self-test exercita skipped/flaky/baseline/status final | ✅ PROVADO DIRETAMENTE — do reporter |
| workers do plano | contrato exige `MANGA_E2E_WORKERS: String(group.workers)` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| blobs dos shards | workflow publica e exige cinco antes do merge | 🟨 EXECUTADO INDIRETAMENTE |
| config raiz canônico | gate estrutural exige raiz e proíbe `tests/playwright.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| parsing workers/retries | sem teste focal de bordas | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| timeout/outputDir | sem assertion específica | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `use.*` no browser real | specs lançam contexts próprios | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| screenshot/video atuais | sem `recordVideo`/screenshot nos specs | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `/health` no startup | config usa porta, não URL health | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Análise crítica

1. **Workers fracionários:** `0.5` passa no `> 0` e `Math.floor(0.5)` produz `0`.
2. **Sem teto de workers:** valores enormes como `1e3` são aceitos.
3. **`CI=false` textual ativa modo CI:** toda string não vazia vira verdadeira.
4. **Config de browser duplicada:** persistent contexts reais repetem flags em três specs.
5. **Mídia de falha pode ser ilusória:** screenshot/video de `use` não configuram os contexts manuais.
6. **Comentário stale do `/health`:** o endpoint existe, mas o config espera só a porta.
7. **`reuseExistingServer` aceita listener errado:** um serviço estranho em 3999 pode ser reaproveitado.
8. **Porta 3999 duplicada:** config, mock e specs conhecem o mesmo número.
9. **Headless em duas camadas:** `headless:false` coexistindo com `--headless=new` depende de precedência/compatibilidade e ainda é duplicado.
10. **Sandbox desabilitado:** reduz defesa em profundidade do Chromium.
11. **Retries locais sem gate anti-flaky:** fora de CI o reporter é `list`.
12. **Nome `extension-tests` sem proteção focal:** o inventário é recalculado, não fixa o literal.
13. **Timeout/outputDir sem self-test:** drifts seriam percebidos apenas indiretamente.

## 8. Casos-limite

- `MANGA_E2E_WORKERS=0.5` pode gerar workers 0.
- `MANGA_E2E_WORKERS=Infinity` cai no fallback 1.
- `MANGA_E2E_WORKERS=1e3` aceita 1000.
- `MANGA_E2E_WORKERS=abc` cai no fallback 1.
- `MANGA_E2E_RETRIES=2.9` vira 2 localmente.
- `MANGA_E2E_RETRIES=-1` vira 0.
- `CI=false` textual ativa política CI.
- `MANGA_E2E_SHARD=true` não ativa shard; só `1` ativa.
- serviço não relacionado em 3999 pode ser reutilizado.
- contexts persistentes não recebem automaticamente mídia/config do `use`.

## 9. Invariantes

1. O config canônico deve permanecer na raiz enquanto package/CI apontarem para ele.
2. `tests/playwright.config.js` não deve reaparecer.
3. O inventário E2E deve ser integralmente coberto pelos cinco grupos sem duplicatas.
4. CI não deve ganhar retries positivos sem decisão explícita sobre anti-flaky.
5. `test.only` deve continuar bloqueado em CI.
6. Workers de shard devem vir do plano, não do workflow.
7. Shards devem produzir reports mescláveis antes do gate global.
8. Baseline/skips/flaky não devem ser reduzidos a mero exit code.
9. O mock deve continuar autocontido para `npm run test:e2e`.
10. Porta, health e identidade do mock devem permanecer coerentes.
11. Paths de extensão/fixtures precisam permanecer portáveis.
12. Flags que reduzem sandbox não podem migrar para browsing de produção.
13. A relação entre `use` e persistent contexts deve ficar explícita.
14. Se mídia de falha for requisito, contexts manuais precisam configurá-la de fato.
15. Workers normalizados jamais devem resultar em zero/negativo.
16. Alterar paralelismo exige reavaliar plano e suítes `serial`.
17. Esta Bíblia só permanece válida no SHA `6a27b774a0009db800a70969eaad18716fb5f565`.

## 10. Lacunas de teste

1. Falta teste de workers fracionários, especialmente 0.5.
2. Falta teste de workers NaN/Infinity/negativo/zero/muito alto.
3. Falta teste de `CI=false`, vazio e ausente.
4. Falta teste de normalização de retries locais.
5. Falta gate focal do timeout 60000.
6. Falta gate ligando `outputDir` ao upload `test-results/`.
7. Falta prova de que opções do browser canônico chegam ao browser real; hoje contexts são manuais.
8. Falta teste de screenshot/vídeo em falha real dos contexts persistentes.
9. Falta usar/assertar `/health` para identificar o mock.
10. Falta cenário com serviço errado ocupando 3999.
11. Falta gate do nome `extension-tests`, se for contrato.
12. Falta fonte única/gate cruzado da porta 3999.
13. Falta teste ponta a ponta show/stealth.
14. Falta proteção contra drift das flags duplicadas config/specs.

## 11. Fonte integral auditada

```javascript
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const isCi = !!process.env.CI;
const isShardRun = process.env.MANGA_E2E_SHARD === '1';
const requestedWorkers = Number(process.env.MANGA_E2E_WORKERS || 1);
const ciWorkers = Number.isFinite(requestedWorkers) && requestedWorkers > 0
  ? Math.floor(requestedWorkers)
  : 1;
const requestedRetries = Number(process.env.MANGA_E2E_RETRIES || 0);
const localRetries = Number.isFinite(requestedRetries) && requestedRetries >= 0
  ? Math.floor(requestedRetries)
  : 0;

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  timeout: 60000,
  fullyParallel: true,
  workers: isCi ? ciWorkers : undefined,
  retries: isCi ? 0 : localRetries,
  forbidOnly: isCi,
  reporter: isCi
    ? (isShardRun
      ? [['line'], ['blob']]
      : [['line'], ['./scripts/ci/playwright-gate-reporter.js']])
    : [['list']],
  use: {
    channel: 'chromium',
    launchOptions: {
      args: [
        '--headless=new',
        `--disable-extensions-except=${path.join(__dirname, 'extension')}`,
        `--load-extension=${path.join(__dirname, 'extension')}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'extension-tests',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `"${process.execPath}" "${path.join(__dirname, 'tests/fixtures/gemini-mock-server.js')}"`,
    port: 3999,
    reuseExistingServer: true,
  },
});
```

## 12. Cobertura linha a linha

### Linha 1

**Fonte:** `const { defineConfig, devices } = require('@playwright/test');`

**O que faz:** Importa `defineConfig` e `devices` do pacote oficial `@playwright/test`.

**Como faz:** O Node avalia o arquivo como CommonJS antes de o Playwright construir sua configuração; estas dependências ficam disponíveis às expressões seguintes.

**Por que foi implementado dessa forma:** A configuração usa APIs oficiais do Playwright e caminhos do Node, mantendo o ponto canônico da raiz portável entre Windows e Linux.

**Por que uma implementação ingênua seria pior:** Duplicar helpers ou montar caminhos manualmente aumentaria drift e problemas com separadores, espaços no caminho e versões da ferramenta.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 2

**Fonte:** `const path = require('path');`

**O que faz:** Importa o módulo nativo `path` do Node.

**Como faz:** O Node avalia o arquivo como CommonJS antes de o Playwright construir sua configuração; estas dependências ficam disponíveis às expressões seguintes.

**Por que foi implementado dessa forma:** A configuração usa APIs oficiais do Playwright e caminhos do Node, mantendo o ponto canônico da raiz portável entre Windows e Linux.

**Por que uma implementação ingênua seria pior:** Duplicar helpers ou montar caminhos manualmente aumentaria drift e problemas com separadores, espaços no caminho e versões da ferramenta.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 3

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia entre imports e política derivada do ambiente.

**Como faz:** Não cria binding nem side effect; apenas separa blocos semânticos no texto fonte.

**Por que foi implementado dessa forma:** A separação torna uma configuração curta mais auditável e reduz confusão entre derivação de ambiente e aplicação de opções.

**Por que uma implementação ingênua seria pior:** Remover a linha não mudaria runtime, mas compactação excessiva dificulta revisão e manutenção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 4

**Fonte:** `const isCi = !!process.env.CI;`

**O que faz:** Transforma a presença de `process.env.CI` em um booleano chamado `isCi`.

**Como faz:** O duplo `!` converte qualquer string não vazia de `process.env.CI` em `true`; portanto até `CI=false` textual ativa o modo CI.

**Por que foi implementado dessa forma:** GitHub Actions define `CI=true`, então a convenção funciona no caminho oficial e concentra decisões numa única flag.

**Por que uma implementação ingênua seria pior:** Espalhar testes independentes de CI produziria combinações inconsistentes; a semântica atual, porém, precisa de teste para strings enganosas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 5

**Fonte:** `const isShardRun = process.env.MANGA_E2E_SHARD === '1';`

**O que faz:** Marca a execução como shard somente quando `MANGA_E2E_SHARD` é exatamente a string `1`.

**Como faz:** A igualdade estrita compara a variável textual a `1`; `true` e `0` não ativam o branch de shard.

**Por que foi implementado dessa forma:** Shards precisam produzir blob reports para merge, enquanto uma execução CI normal pode aplicar o gate diretamente.

**Por que uma implementação ingênua seria pior:** Usar truthiness trataria valores indevidos como shard; não distinguir shard faria cada subconjunto ser julgado contra o baseline global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 6

**Fonte:** `const requestedWorkers = Number(process.env.MANGA_E2E_WORKERS || 1);`

**O que faz:** Lê `MANGA_E2E_WORKERS`, aplica default 1 e converte o resultado com `Number`.

**Como faz:** A variável é convertida para número, validada por finitude/positividade e depois arredondada; entradas inválidas caem no fallback serial.

**Por que foi implementado dessa forma:** O runner injeta workers vindos do plano, controlando concorrência por grupo sem hardcode no workflow.

**Por que uma implementação ingênua seria pior:** Delegar strings ao Playwright ou duplicar números no YAML aumentaria erros; a ordem atual ainda contém o edge case `0.5 -> 0`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 7

**Fonte:** `const ciWorkers = Number.isFinite(requestedWorkers) && requestedWorkers > 0`

**O que faz:** Inicia a validação de workers exigindo número finito e estritamente positivo.

**Como faz:** A variável é convertida para número, validada por finitude/positividade e depois arredondada; entradas inválidas caem no fallback serial.

**Por que foi implementado dessa forma:** O runner injeta workers vindos do plano, controlando concorrência por grupo sem hardcode no workflow.

**Por que uma implementação ingênua seria pior:** Delegar strings ao Playwright ou duplicar números no YAML aumentaria erros; a ordem atual ainda contém o edge case `0.5 -> 0`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 8

**Fonte:** `  ? Math.floor(requestedWorkers)`

**O que faz:** No ramo válido, arredonda workers para baixo com `Math.floor`.

**Como faz:** A variável é convertida para número, validada por finitude/positividade e depois arredondada; entradas inválidas caem no fallback serial.

**Por que foi implementado dessa forma:** O runner injeta workers vindos do plano, controlando concorrência por grupo sem hardcode no workflow.

**Por que uma implementação ingênua seria pior:** Delegar strings ao Playwright ou duplicar números no YAML aumentaria erros; a ordem atual ainda contém o edge case `0.5 -> 0`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 9

**Fonte:** `  : 1;`

**O que faz:** No ramo inválido, fixa o fallback de workers em 1.

**Como faz:** A variável é convertida para número, validada por finitude/positividade e depois arredondada; entradas inválidas caem no fallback serial.

**Por que foi implementado dessa forma:** O runner injeta workers vindos do plano, controlando concorrência por grupo sem hardcode no workflow.

**Por que uma implementação ingênua seria pior:** Delegar strings ao Playwright ou duplicar números no YAML aumentaria erros; a ordem atual ainda contém o edge case `0.5 -> 0`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 10

**Fonte:** `const requestedRetries = Number(process.env.MANGA_E2E_RETRIES || 0);`

**O que faz:** Lê `MANGA_E2E_RETRIES`, aplica default 0 e converte o valor para número.

**Como faz:** Retries locais passam por coerção numérica, teste de finitude/não-negatividade e `Math.floor`; o fallback é zero.

**Por que foi implementado dessa forma:** Desenvolvimento local pode optar por repetição, mas a linha 21 desliga retries em CI para expor flakiness.

**Por que uma implementação ingênua seria pior:** Retry positivo obrigatório poderia mascarar falha inicial; aceitar negativos ou NaN produziria configuração inválida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 11

**Fonte:** `const localRetries = Number.isFinite(requestedRetries) && requestedRetries >= 0`

**O que faz:** Inicia a validação de retries exigindo valor finito e não negativo.

**Como faz:** Retries locais passam por coerção numérica, teste de finitude/não-negatividade e `Math.floor`; o fallback é zero.

**Por que foi implementado dessa forma:** Desenvolvimento local pode optar por repetição, mas a linha 21 desliga retries em CI para expor flakiness.

**Por que uma implementação ingênua seria pior:** Retry positivo obrigatório poderia mascarar falha inicial; aceitar negativos ou NaN produziria configuração inválida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 12

**Fonte:** `  ? Math.floor(requestedRetries)`

**O que faz:** No ramo válido, normaliza retries para inteiro com `Math.floor`.

**Como faz:** Retries locais passam por coerção numérica, teste de finitude/não-negatividade e `Math.floor`; o fallback é zero.

**Por que foi implementado dessa forma:** Desenvolvimento local pode optar por repetição, mas a linha 21 desliga retries em CI para expor flakiness.

**Por que uma implementação ingênua seria pior:** Retry positivo obrigatório poderia mascarar falha inicial; aceitar negativos ou NaN produziria configuração inválida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 13

**Fonte:** `  : 0;`

**O que faz:** No ramo inválido, usa zero retries.

**Como faz:** Retries locais passam por coerção numérica, teste de finitude/não-negatividade e `Math.floor`; o fallback é zero.

**Por que foi implementado dessa forma:** Desenvolvimento local pode optar por repetição, mas a linha 21 desliga retries em CI para expor flakiness.

**Por que uma implementação ingênua seria pior:** Retry positivo obrigatório poderia mascarar falha inicial; aceitar negativos ou NaN produziria configuração inválida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 14

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia entre a derivação de política e o objeto exportado.

**Como faz:** Não cria binding nem side effect; apenas separa blocos semânticos no texto fonte.

**Por que foi implementado dessa forma:** A separação torna uma configuração curta mais auditável e reduz confusão entre derivação de ambiente e aplicação de opções.

**Por que uma implementação ingênua seria pior:** Remover a linha não mudaria runtime, mas compactação excessiva dificulta revisão e manutenção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 15

**Fonte:** `module.exports = defineConfig({`

**O que faz:** Exporta a configuração CommonJS retornada por `defineConfig`.

**Como faz:** `module.exports` recebe o resultado de `defineConfig`, carregado pela CLI quando `--config=playwright.config.js` é usado.

**Por que foi implementado dessa forma:** Um único config raiz evita a duplicação histórica em `tests/`; o gate estrutural proíbe a cópia legada.

**Por que uma implementação ingênua seria pior:** Configs paralelos fariam package, CI e desenvolvedores executarem políticas diferentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 16

**Fonte:** `  testDir: './tests/e2e',`

**O que faz:** Restringe a descoberta do Playwright ao diretório `tests/e2e`.

**Como faz:** Estas propriedades são interpretadas pelo Playwright Test no nível do runner: descoberta, artefatos, timeout, paralelismo, workers, retries e proteção contra foco.

**Por que foi implementado dessa forma:** Elas compõem o contrato E2E e permitem ao plano distribuir 21 testes sem mascarar retry ou `test.only` em CI.

**Por que uma implementação ingênua seria pior:** Defaults implícitos ou divergentes poderiam omitir testes, aumentar flakiness ou tornar duração e concorrência imprevisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` carrega este config real e o caminho atual produz o inventário de 21 testes, mas não existe assertion que exija literalmente `testDir: './tests/e2e'`.

### Linha 17

**Fonte:** `  outputDir: './test-results',`

**O que faz:** Define `test-results` como diretório de saída de artefatos do runner.

**Como faz:** Estas propriedades são interpretadas pelo Playwright Test no nível do runner: descoberta, artefatos, timeout, paralelismo, workers, retries e proteção contra foco.

**Por que foi implementado dessa forma:** Elas compõem o contrato E2E e permitem ao plano distribuir 21 testes sem mascarar retry ou `test.only` em CI.

**Por que uma implementação ingênua seria pior:** Defaults implícitos ou divergentes poderiam omitir testes, aumentar flakiness ou tornar duração e concorrência imprevisíveis.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 18

**Fonte:** `  timeout: 60000,`

**O que faz:** Define timeout padrão de 60 segundos por teste.

**Como faz:** Estas propriedades são interpretadas pelo Playwright Test no nível do runner: descoberta, artefatos, timeout, paralelismo, workers, retries e proteção contra foco.

**Por que foi implementado dessa forma:** Elas compõem o contrato E2E e permitem ao plano distribuir 21 testes sem mascarar retry ou `test.only` em CI.

**Por que uma implementação ingênua seria pior:** Defaults implícitos ou divergentes poderiam omitir testes, aumentar flakiness ou tornar duração e concorrência imprevisíveis.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 19

**Fonte:** `  fullyParallel: true,`

**O que faz:** Habilita `fullyParallel`, permitindo distribuição de testes entre workers.

**Como faz:** Estas propriedades são interpretadas pelo Playwright Test no nível do runner: descoberta, artefatos, timeout, paralelismo, workers, retries e proteção contra foco.

**Por que foi implementado dessa forma:** Elas compõem o contrato E2E e permitem ao plano distribuir 21 testes sem mascarar retry ou `test.only` em CI.

**Por que uma implementação ingênua seria pior:** Defaults implícitos ou divergentes poderiam omitir testes, aumentar flakiness ou tornar duração e concorrência imprevisíveis.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige literalmente `fullyParallel: true`.

### Linha 20

**Fonte:** `  workers: isCi ? ciWorkers : undefined,`

**O que faz:** Em CI usa `ciWorkers`; fora de CI deixa `workers` indefinido para o default do Playwright.

**Como faz:** Estas propriedades são interpretadas pelo Playwright Test no nível do runner: descoberta, artefatos, timeout, paralelismo, workers, retries e proteção contra foco.

**Por que foi implementado dessa forma:** Elas compõem o contrato E2E e permitem ao plano distribuir 21 testes sem mascarar retry ou `test.only` em CI.

**Por que uma implementação ingênua seria pior:** Defaults implícitos ou divergentes poderiam omitir testes, aumentar flakiness ou tornar duração e concorrência imprevisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `run-e2e-group.js` injeta workers do plano; não há assertion do número efetivamente criado pelo Playwright.

### Linha 21

**Fonte:** `  retries: isCi ? 0 : localRetries,`

**O que faz:** Em CI força zero retries; fora de CI usa o valor local normalizado.

**Como faz:** Estas propriedades são interpretadas pelo Playwright Test no nível do runner: descoberta, artefatos, timeout, paralelismo, workers, retries e proteção contra foco.

**Por que foi implementado dessa forma:** Elas compõem o contrato E2E e permitem ao plano distribuir 21 testes sem mascarar retry ou `test.only` em CI.

**Por que uma implementação ingênua seria pior:** Defaults implícitos ou divergentes poderiam omitir testes, aumentar flakiness ou tornar duração e concorrência imprevisíveis.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — o contrato exige `retries: isCi ? 0`; o self-test do reporter prova separadamente que retry após falha permanece reprovado.

### Linha 22

**Fonte:** `  forbidOnly: isCi,`

**O que faz:** Proíbe `test.only` somente quando `isCi` está ativo.

**Como faz:** Estas propriedades são interpretadas pelo Playwright Test no nível do runner: descoberta, artefatos, timeout, paralelismo, workers, retries e proteção contra foco.

**Por que foi implementado dessa forma:** Elas compõem o contrato E2E e permitem ao plano distribuir 21 testes sem mascarar retry ou `test.only` em CI.

**Por que uma implementação ingênua seria pior:** Defaults implícitos ou divergentes poderiam omitir testes, aumentar flakiness ou tornar duração e concorrência imprevisíveis.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — o contrato exige `forbidOnly: isCi` e seu self-test muta para `false` e exige falha.

### Linha 23

**Fonte:** `  reporter: isCi`

**O que faz:** Inicia a escolha do reporter conforme ambiente.

**Como faz:** Um ternário aninhado escolhe a lista de reporters: blob nos shards, gate customizado em CI não-shard e list localmente.

**Por que foi implementado dessa forma:** O pipeline precisa serializar resultados dos shards e aplicar a política global somente depois do merge; localmente prioriza legibilidade.

**Por que uma implementação ingênua seria pior:** Aplicar o gate dentro de cada shard reprovaria subconjuntos contra o baseline; omitir blob impediria o merge.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 24

**Fonte:** `    ? (isShardRun`

**O que faz:** Dentro de CI, distingue shard de execução CI não-shard.

**Como faz:** Um ternário aninhado escolhe a lista de reporters: blob nos shards, gate customizado em CI não-shard e list localmente.

**Por que foi implementado dessa forma:** O pipeline precisa serializar resultados dos shards e aplicar a política global somente depois do merge; localmente prioriza legibilidade.

**Por que uma implementação ingênua seria pior:** Aplicar o gate dentro de cada shard reprovaria subconjuntos contra o baseline; omitir blob impediria o merge.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 25

**Fonte:** `      ? [['line'], ['blob']]`

**O que faz:** Para shard, usa reporter `line` e `blob`.

**Como faz:** Um ternário aninhado escolhe a lista de reporters: blob nos shards, gate customizado em CI não-shard e list localmente.

**Por que foi implementado dessa forma:** O pipeline precisa serializar resultados dos shards e aplicar a política global somente depois do merge; localmente prioriza legibilidade.

**Por que uma implementação ingênua seria pior:** Aplicar o gate dentro de cada shard reprovaria subconjuntos contra o baseline; omitir blob impediria o merge.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow roda shards com a flag correspondente, publica blobs e exige exatamente cinco antes do merge.

### Linha 26

**Fonte:** `      : [['line'], ['./scripts/ci/playwright-gate-reporter.js']])`

**O que faz:** Para CI não-shard, usa `line` e o reporter de gate do projeto.

**Como faz:** Um ternário aninhado escolhe a lista de reporters: blob nos shards, gate customizado em CI não-shard e list localmente.

**Por que foi implementado dessa forma:** O pipeline precisa serializar resultados dos shards e aplicar a política global somente depois do merge; localmente prioriza legibilidade.

**Por que uma implementação ingênua seria pior:** Aplicar o gate dentro de cada shard reprovaria subconjuntos contra o baseline; omitir blob impediria o merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — o contrato exige o caminho do reporter customizado; o reporter tem self-test próprio.

### Linha 27

**Fonte:** `    : [['list']],`

**O que faz:** Fora de CI, usa somente o reporter `list`.

**Como faz:** Um ternário aninhado escolhe a lista de reporters: blob nos shards, gate customizado em CI não-shard e list localmente.

**Por que foi implementado dessa forma:** O pipeline precisa serializar resultados dos shards e aplicar a política global somente depois do merge; localmente prioriza legibilidade.

**Por que uma implementação ingênua seria pior:** Aplicar o gate dentro de cada shard reprovaria subconjuntos contra o baseline; omitir blob impediria o merge.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 28

**Fonte:** `  use: {`

**O que faz:** Abre o bloco `use` de defaults das fixtures gerenciadas pelo Playwright.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 29

**Fonte:** `    channel: 'chromium',`

**O que faz:** Seleciona o channel `chromium` para o browser padrão das fixtures.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 30

**Fonte:** `    launchOptions: {`

**O que faz:** Abre `launchOptions` do browser padrão.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 31

**Fonte:** `      args: [`

**O que faz:** Abre a lista de argumentos passados ao Chromium padrão.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 32

**Fonte:** `        '--headless=new',`

**O que faz:** Adiciona a flag `--headless=new` ao processo do Chromium.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 33

**Fonte:** `        \`--disable-extensions-except=${path.join(__dirname, 'extension')}\`,`

**O que faz:** Restringe extensões permitidas ao diretório `extension` do repositório.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 34

**Fonte:** `        \`--load-extension=${path.join(__dirname, 'extension')}\`,`

**O que faz:** Carrega explicitamente a extensão Manga Translator desse diretório.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 35

**Fonte:** `        '--no-sandbox',`

**O que faz:** Desativa o sandbox geral do Chromium.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 36

**Fonte:** `        '--disable-setuid-sandbox',`

**O que faz:** Desativa o setuid sandbox do Chromium.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 37

**Fonte:** `      ],`

**O que faz:** Fecha a lista de argumentos de lançamento.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 38

**Fonte:** `    },`

**O que faz:** Fecha o objeto `launchOptions`.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 39

**Fonte:** `    headless: false,`

**O que faz:** Define `headless: false` na API do Playwright, enquanto a linha 32 solicita o headless novo por argumento.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 40

**Fonte:** `    viewport: { width: 1280, height: 720 },`

**O que faz:** Define viewport padrão de 1280×720 para fixtures padrão.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 41

**Fonte:** `    screenshot: 'only-on-failure',`

**O que faz:** Solicita screenshot automático somente em falha.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 42

**Fonte:** `    video: 'retain-on-failure',`

**O que faz:** Solicita retenção de vídeo somente em falha.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 43

**Fonte:** `  },`

**O que faz:** Fecha o bloco global `use`.

**Como faz:** O bloco `use` fornece defaults às fixtures browser/context/page criadas pelo Playwright. Os três specs atuais criam `chromium.launchPersistentContext` manualmente e não herdam automaticamente essas opções.

**Por que foi implementado dessa forma:** A intenção é centralizar channel, flags, viewport e artifacts; hoje parte dela é duplicada nos specs para suportar extensão MV3 em context persistente.

**Por que uma implementação ingênua seria pior:** Assumir que estes defaults governam os contexts manuais produziria documentação falsa e pode esconder drift de flags, ausência de mídia e diferenças de viewport.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 44

**Fonte:** `  projects: [`

**O que faz:** Abre a lista de projetos Playwright.

**Como faz:** `projects` cria um projeto nomeado e aplica o preset de device ao `use` do projeto; o nome aparece no metadata dos testes listados.

**Por que foi implementado dessa forma:** Um projeto explícito dá identidade ao inventário e espaço para variantes futuras.

**Por que uma implementação ingênua seria pior:** Adicionar projetos sem atualizar o plano pode multiplicar execução; assumir que o preset chega aos contexts manuais também seria incorreto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 45

**Fonte:** `    {`

**O que faz:** Abre o único projeto configurado.

**Como faz:** `projects` cria um projeto nomeado e aplica o preset de device ao `use` do projeto; o nome aparece no metadata dos testes listados.

**Por que foi implementado dessa forma:** Um projeto explícito dá identidade ao inventário e espaço para variantes futuras.

**Por que uma implementação ingênua seria pior:** Adicionar projetos sem atualizar o plano pode multiplicar execução; assumir que o preset chega aos contexts manuais também seria incorreto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa do carregamento/configuração real, sem assertion isolada de sua propriedade específica.

### Linha 46

**Fonte:** `      name: 'extension-tests',`

**O que faz:** Nomeia o projeto como `extension-tests`.

**Como faz:** `projects` cria um projeto nomeado e aplica o preset de device ao `use` do projeto; o nome aparece no metadata dos testes listados.

**Por que foi implementado dessa forma:** Um projeto explícito dá identidade ao inventário e espaço para variantes futuras.

**Por que uma implementação ingênua seria pior:** Adicionar projetos sem atualizar o plano pode multiplicar execução; assumir que o preset chega aos contexts manuais também seria incorreto.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 47

**Fonte:** `      use: { ...devices['Desktop Chrome'] },`

**O que faz:** Aplica o preset `Desktop Chrome` ao `use` do projeto.

**Como faz:** `projects` cria um projeto nomeado e aplica o preset de device ao `use` do projeto; o nome aparece no metadata dos testes listados.

**Por que foi implementado dessa forma:** Um projeto explícito dá identidade ao inventário e espaço para variantes futuras.

**Por que uma implementação ingênua seria pior:** Adicionar projetos sem atualizar o plano pode multiplicar execução; assumir que o preset chega aos contexts manuais também seria incorreto.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 48

**Fonte:** `    },`

**O que faz:** Fecha o projeto.

**Como faz:** `projects` cria um projeto nomeado e aplica o preset de device ao `use` do projeto; o nome aparece no metadata dos testes listados.

**Por que foi implementado dessa forma:** Um projeto explícito dá identidade ao inventário e espaço para variantes futuras.

**Por que uma implementação ingênua seria pior:** Adicionar projetos sem atualizar o plano pode multiplicar execução; assumir que o preset chega aos contexts manuais também seria incorreto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 49

**Fonte:** `  ],`

**O que faz:** Fecha a lista de projetos.

**Como faz:** `projects` cria um projeto nomeado e aplica o preset de device ao `use` do projeto; o nome aparece no metadata dos testes listados.

**Por que foi implementado dessa forma:** Um projeto explícito dá identidade ao inventário e espaço para variantes futuras.

**Por que uma implementação ingênua seria pior:** Adicionar projetos sem atualizar o plano pode multiplicar execução; assumir que o preset chega aos contexts manuais também seria incorreto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 50

**Fonte:** `  webServer: {`

**O que faz:** Abre a configuração do servidor auxiliar gerenciado pelo Playwright.

**Como faz:** O Playwright executa o comando do mock e considera o servidor disponível pela porta 3999; com `reuseExistingServer` pode reaproveitar um processo já ouvindo ali.

**Por que foi implementado dessa forma:** Isso torna `npm run test:e2e` autocontido e fornece páginas/rotas mockadas usadas pelos cenários reais.

**Por que uma implementação ingênua seria pior:** Startup manual seria frágil; testar só porta e reutilizar qualquer listener pode aceitar um serviço errado em vez de validar `/health`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — os E2E dependem do mock em `localhost/127.0.0.1:3999`, sem assertion focal do mecanismo de startup desta linha.

### Linha 51

**Fonte:** `    command: \`"${process.execPath}" "${path.join(__dirname, 'tests/fixtures/gemini-mock-server.js')}"\`,`

**O que faz:** Monta o comando que inicia `tests/fixtures/gemini-mock-server.js` com o executável Node atual.

**Como faz:** O Playwright executa o comando do mock e considera o servidor disponível pela porta 3999; com `reuseExistingServer` pode reaproveitar um processo já ouvindo ali.

**Por que foi implementado dessa forma:** Isso torna `npm run test:e2e` autocontido e fornece páginas/rotas mockadas usadas pelos cenários reais.

**Por que uma implementação ingênua seria pior:** Startup manual seria frágil; testar só porta e reutilizar qualquer listener pode aceitar um serviço errado em vez de validar `/health`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — os E2E dependem do mock em `localhost/127.0.0.1:3999`, sem assertion focal do mecanismo de startup desta linha.

### Linha 52

**Fonte:** `    port: 3999,`

**O que faz:** Declara a porta 3999 como sinal de disponibilidade do `webServer`.

**Como faz:** O Playwright executa o comando do mock e considera o servidor disponível pela porta 3999; com `reuseExistingServer` pode reaproveitar um processo já ouvindo ali.

**Por que foi implementado dessa forma:** Isso torna `npm run test:e2e` autocontido e fornece páginas/rotas mockadas usadas pelos cenários reais.

**Por que uma implementação ingênua seria pior:** Startup manual seria frágil; testar só porta e reutilizar qualquer listener pode aceitar um serviço errado em vez de validar `/health`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — os E2E dependem do mock em `localhost/127.0.0.1:3999`, sem assertion focal do mecanismo de startup desta linha.

### Linha 53

**Fonte:** `    reuseExistingServer: true,`

**O que faz:** Permite reutilizar um servidor que já esteja disponível nessa porta.

**Como faz:** O Playwright executa o comando do mock e considera o servidor disponível pela porta 3999; com `reuseExistingServer` pode reaproveitar um processo já ouvindo ali.

**Por que foi implementado dessa forma:** Isso torna `npm run test:e2e` autocontido e fornece páginas/rotas mockadas usadas pelos cenários reais.

**Por que uma implementação ingênua seria pior:** Startup manual seria frágil; testar só porta e reutilizar qualquer listener pode aceitar um serviço errado em vez de validar `/health`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — existe consumo contextual, mas nenhuma assertion focal prova esta propriedade exata.

### Linha 54

**Fonte:** `  },`

**O que faz:** Fecha a configuração do `webServer`.

**Como faz:** O Playwright executa o comando do mock e considera o servidor disponível pela porta 3999; com `reuseExistingServer` pode reaproveitar um processo já ouvindo ali.

**Por que foi implementado dessa forma:** Isso torna `npm run test:e2e` autocontido e fornece páginas/rotas mockadas usadas pelos cenários reais.

**Por que uma implementação ingênua seria pior:** Startup manual seria frágil; testar só porta e reutilizar qualquer listener pode aceitar um serviço errado em vez de validar `/health`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 55

**Fonte:** `});`

**O que faz:** Fecha o objeto, a chamada `defineConfig` e o statement exportado.

**Como faz:** A sintaxe encerra objeto, chamada e atribuição CommonJS; erro aqui impede o config de carregar.

**Por que foi implementado dessa forma:** Mantém um único objeto de configuração exportado à CLI.

**Por que uma implementação ingênua seria pior:** Delimitação incorreta falharia já no `playwright --list`, bloqueando inventário e E2E.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `verify-e2e-shard-plan.js` precisa carregar e interpretar o config real via Playwright CLI.

### Linha 56

**Fonte:** `␤ [newline final]`

**O que faz:** Representa o newline final do blob auditado.

**Como faz:** O blob termina com `\n`; esta posição não executa código, mas integra a representação textual auditada.

**Por que foi implementado dessa forma:** Documentar a posição terminal mantém equivalência com o arquivo real e a contagem integral exigida pelo gate.

**Por que uma implementação ingênua seria pior:** Ignorar o newline final quebraria a rastreabilidade de 56/56 posições e poderia esconder divergência editorial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — o gate das Bíblias compara fonte integral e headings sequenciais, incluindo o newline final.

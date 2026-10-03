# Bíblia técnica — scripts/validation/verify-coverage-selftest.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 8  
> **SHA auditado:** ac08dd661f2d2410a56a7fd685cd9b55e85901f9  
> **Agente responsável:** AGENTE 8  
> **Índice do corpus:** 084  
> **Tipo:** tooling Node.js / self-test da infraestrutura de coverage / gate de CI  
> **Linhas textuais:** **104**  
> **Posições documentais:** **105**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible  
> **Escopo de escrita respeitado:** somente esta Bíblia, a reserva e o state #084; código, testes, workflows e configs permaneceram somente leitura.

## 1. Papel arquitetural

Este arquivo é um **self-test de infraestrutura**. Ele não mede a cobertura real do produto e não substitui Jest. Seu papel é construir um repositório temporário mínimo, invocar a implementação real de `verifyCoverage` e confirmar que o verificador aceita um caso saudável e rejeita cinco classes de degradação.

A dependência central é `scripts/validation/verify-coverage.js`, SHA observado **45f920bd2db5ba3a1273438b1814b29aeafc3be4**. O self-test a importa diretamente na linha 6 e chama `verifyCoverage(...)` nas linhas 80–86. Portanto, os cenários executam a implementação real do verificador, não uma reimplementação local da regra de aprovação.

O self-test é propositalmente sintético: cria dois arquivos JavaScript sob `extension/`, um `coverage-summary.json`, um `lcov.info` e um baseline temporário. Em seguida, cada caso modifica apenas alguns parâmetros do factory e exige um valor booleano específico de `result.ok`.

## 2. Dependências diretas

- **Node.js `fs`** — cria diretórios, grava os artefatos sintéticos e remove a fixture.
- **Node.js `os`** — fornece `os.tmpdir()`.
- **Node.js `path`** — monta caminhos portáveis.
- **`./verify-coverage`** — implementação real sob teste.
- **filesystem temporário local** — trust boundary de I/O do self-test; não há rede, browser, Chrome APIs ou dados do usuário.

Nenhuma dependência npm externa é usada diretamente neste arquivo.

## 3. Consumidores e wiring real

### 3.1 package.json

No SHA observado de `package.json` (**33e0b91d1a6f1790124b700d2ce331f80d2b7095**):

- linha 29: `"test:coverage:infra": "node scripts/validation/verify-coverage-selftest.js"`;
- linha 38: `npm run validate` inclui `npm run test:coverage:infra`.

Isso faz o self-test participar do fluxo `npm run validate`.

### 3.2 GitHub Actions

No SHA observado de `.github/workflows/ci.yml` (**ebee75820db9bfab618bf3c3016065c5bc857ed7**):

- linha 80 nomeia a etapa **Testar verificador de coverage**;
- linha 81 executa `node scripts/validation/verify-coverage-selftest.js`.

Logo, o self-test é wiring real do job `ci-contract`.

### 3.3 verify-ci-contract.js

No SHA observado de `scripts/validation/verify-ci-contract.js` (**636e4bfbaa0646cd8259e1f27f09004a92541294**):

- linha 11 lê este self-test como texto;
- linhas 455–456 exigem que `package.json#test:coverage:infra` aponte exatamente para este arquivo;
- linhas 474–477 exigem marcadores textuais para cinco cenários: `coverage normal`, `lcov vazio`, `coverage 0%`, `arquivo crítico ausente` e `threshold abaixo do mínimo`.

O cenário `threshold crítico abaixo do mínimo` da linha 102 **não aparece nessa lista estática**, lacuna registrada como solicitação 084-003.

## 4. Fluxo operacional

`expectCase`
→ chama `createFixture`
→ cria uma raiz temporária única
→ materializa dois fontes em `extension/`
→ materializa `coverage-summary.json`
→ materializa `lcov.info`
→ materializa baseline sintético
→ chama `verifyCoverage` real com paths explícitos
→ compara somente `result.ok`
→ imprime ✓ se coincidir
→ remove a fixture no `finally`.

Depois disso, o topo do script executa seis casos sequencialmente. Qualquer exceção interrompe o processo com código não zero por propagação natural do Node. A mensagem final da linha 104 só é alcançada se todos os casos tiverem passado.

## 5. Modelo da fixture

A fixture possui dois fontes físicos:

1. `extension/background.js` — também tratado como crítico;
2. `extension/content/content_manga.js`.

O summary contém `total` e entradas por arquivo. O LCOV usa paths absolutos produzidos por `path.join(root, file)`. O baseline sintético exige dois arquivos instrumentados e aplica o mesmo threshold a statements, branches, functions e lines.

Há uma nuance importante: `coverageEntry(file, pct)` não usa `file`. Além disso, para `pct=75`, `covered=Math.round(10*75/100)=8`, enquanto `pct` permanece 75. Portanto, a fixture pode declarar 8/10 cobertos e simultaneamente pct 75. O verificador atual consome o campo `pct`, não reconcilia as contagens, e o self-test não detecta essa inconsistência. Isso está documentado, não corrigido.

## 6. Evidência automatizada e classificação

| Comportamento | Evidência realmente existente | Classificação |
|---|---|---|
| Fixture saudável retorna `ok=true` | linha 97 chama a implementação real e `expectCase` exige igualdade booleana | ✅ PROVADO DIRETAMENTE |
| LCOV vazio é rejeitado | linha 98 chama a implementação real com arquivo vazio e exige `ok=false` | ✅ PROVADO DIRETAMENTE para a rejeição global |
| Coverage 0% é rejeitado | linha 99 exige `ok=false` com pct 0 | ✅ PROVADO DIRETAMENTE para a rejeição global |
| Arquivo crítico ausente é rejeitado | linha 100 omite o crítico de summary e LCOV e exige `ok=false` | ✅ PROVADO DIRETAMENTE para o cenário combinado |
| Coverage total abaixo do mínimo é rejeitado | linha 101 usa minimum=80 e actual=75 | ✅ PROVADO DIRETAMENTE |
| Coverage crítico abaixo do mínimo é rejeitado | linha 102 usa criticalMinimum=80 e actual=75 | ✅ PROVADO DIRETAMENTE |
| Cada caso falha pelo **motivo textual exato** esperado | `result.problems` só entra na mensagem quando o booleano diverge; não há assertion de mensagens | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Métricas/listas retornadas são corretas | não há assertions sobre `metrics`, `instrumentedFiles`, `lcovFiles` ou `sourceFiles` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| wiring `package.json#test:coverage:infra` continua canônico | `verify-ci-contract.js` linhas 455–456 compara o comando exato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| cinco nomes de cenário continuam presentes | `verify-ci-contract.js` linhas 474–477 procura os markers | 🟦 GATE ESTÁTICO ESPECÍFICO |
| cenário de threshold crítico continua presente | nenhuma regra estática equivalente foi localizada | ⚠️ SEM GATE ESTÁTICO ESPECÍFICO |
| self-test participa da CI | workflow linha 81 executa diretamente o arquivo | 🟨 EXECUTADO INDIRETAMENTE no pipeline; nenhuma execução desta sessão foi reivindicada |
| self-test participa de `npm run validate` | package.json linha 38 encadeia `test:coverage:infra` | 🟦 GATE ESTÁTICO ESPECÍFICO de wiring |

### Limite da prova dos casos negativos

Os cinco casos negativos usam a implementação real e uma expectativa booleana real, então provam que **aquela fixture termina reprovada**. Porém, como não validam `result.problems`, não provam isoladamente qual ramo gerou a reprovação.

Exemplo: `omitCritical=true` remove o arquivo de **duas** fontes de evidência — summary e LCOV — e mantém o fonte físico. `verifyCoverage` pode então gerar simultaneamente ausência no summary, ausência no LCOV e ausência crítica. O self-test só exige `ok=false`.

## 7. Relação com verify-coverage.js

A implementação real possui branches relevantes que este self-test cobre e outros que não cobre.

### Cobertos por cenário focal

- arquivo LCOV vazio: branch de artefato ausente/vazio em torno da linha 73 do verifier;
- métricas totais iguais a zero: rejeição em torno da linha 142;
- ausência combinada do crítico no summary e LCOV: branches em torno das linhas 117, 123 e 129;
- mínimo global não atendido: branch em torno da linha 154;
- mínimo crítico não atendido: branch em torno da linha 175;
- happy path completo com dois fontes e dois artefatos.

### Não cobertos focalmente pelo self-test atual

- `coverage-summary.json` ausente;
- `coverage-summary.json` vazio;
- JSON de summary inválido;
- LCOV não vazio, porém sem qualquer linha `SF:`;
- árvore `extension/` sem JavaScript;
- arquivo de fonte faltando somente no summary;
- arquivo de fonte faltando somente no LCOV;
- percentual não numérico/NaN;
- baseline ausente;
- baseline JSON inválido;
- `criticalMinimum` apontando para arquivo não presente no summary;
- `minInstrumentedFiles` não satisfeito isoladamente;
- normalização de paths relativos ao repo versus `tests/`;
- paths com separadores Windows;
- retorno detalhado de `metrics`, `instrumentedFiles`, `lcovFiles` e `sourceFiles`;
- comportamento com thresholds não numéricos.

Essas lacunas não impedem a conclusão documental; elas são registradas como evidência ausente e audit requests.

## 8. Segurança, privacidade e trust boundaries

Este arquivo:

- não acessa internet;
- não acessa Chrome APIs;
- não lê imagens, mangás, Gemini, tabs ou storage da extensão;
- não contém credenciais;
- escreve somente em um diretório temporário criado para a execução.

Os boundaries relevantes são de integridade da CI e filesystem:

1. `os.tmpdir()` deve aceitar criação de diretório;
2. o processo precisa de permissão para criar/remover arquivos temporários;
3. `verifyCoverage` recebe paths controlados pela fixture;
4. erros de escrita/remoção são fail-closed por exceção;
5. se `createFixture` falhar depois de criar o diretório, a limpeza de `expectCase` ainda não está ativa.

## 9. Análise crítica

1. **Assertion booleana ampla.** O teste confirma `ok`, mas não as razões. Um cenário pode permanecer verde se passar a falhar por uma causa incidental diferente da regra que seu nome pretende proteger.
2. **Cenário de ausência crítica é composto.** `omitCritical` retira o arquivo do summary e do LCOV ao mesmo tempo. Isso não separa os contratos “faltou no summary”, “faltou no LCOV” e “criticalFiles não encontrado”.
3. **Fixture aritmeticamente inconsistente para 75%.** `covered=8`, `total=10`, `pct=75`. O verifier não reconcilia esses campos; o self-test também não.
4. **Parâmetro morto.** `coverageEntry(file, pct)` ignora `file`. Não afeta a execução, mas sugere assinatura mais ampla que o comportamento real.
5. **Constante `extension` não utilizada.** Linha 31 calcula o caminho e nunca o usa.
6. **Cleanup começa depois do factory.** Se qualquer escrita dentro de `createFixture` lançar, não existe referência retornada para o `finally` de `expectCase`, podendo sobrar diretório temporário.
7. **Sem teste do contrato de diagnóstico.** Mudanças nas mensagens de `verifyCoverage` não quebram este self-test.
8. **Sem teste do shape de sucesso.** O happy path aceita qualquer objeto com `ok=true`, mesmo que listas ou métricas estejam erradas.
9. **Gate estático incompleto para os cenários.** O CI Contract procura cinco labels e não o sexto cenário crítico.
10. **Baseline sintético, não baseline real.** Isto é correto para testar a mecânica, mas significa que o self-test não prova os números reais de `scripts/ci/data/test-baseline.json`.
11. **Nenhuma execução foi fabricada nesta auditoria.** A Bíblia descreve o que as assertions existentes realmente fazem; não foi criado teste novo nem modificado objeto auditado para produzir prova.

## 10. Casos-limite

- `actual=NaN`: o helper serializaria `NaN` como `null` em JSON; não há cenário para isso.
- `threshold` string numérica: o baseline JSON aceita string se fornecida ao helper; o verifier converte com `Number`; não há cenário.
- `criticalThreshold=0`: cria mapa crítico com zeros; não há cenário explícito.
- `emptyLcov=true` e outro defeito simultâneo: verifier retorna cedo pela ausência/vazio e não exercita branches posteriores.
- `omitCritical=true` e `criticalThreshold != null`: exercitaria o ramo de threshold crítico sem summaryKey, mas não existe caso atual.
- erro de `fs.rmSync`: pode substituir um resultado de teste válido por falha de cleanup, comportamento fail-closed.
- erro durante `createFixture`: pode deixar resíduo temporário porque o `finally` ainda não foi estabelecido.
- múltiplas execuções paralelas: `mkdtempSync` fornece roots diferentes; não há arquivo compartilhado fixo.
- Windows: `path.join` gera separadores nativos e o verifier normaliza caminhos; este self-test roda na CI Linux do job ci-contract, logo não prova esse comportamento no Windows.
- processo interrompido antes do finally: diretório temporário pode permanecer, como em qualquer cleanup em processo.

## 11. Solicitações ao auditor

### 084-001 — TEST_REQUIRED — OPEN

- **Arquivo alvo:** `scripts/validation/verify-coverage-selftest.js`
- **Encontrado ao auditar:** este arquivo.
- **Achado:** os seis casos verificam apenas `result.ok`.
- **Evidência atual:** execução da implementação real com fixtures focais e comparação booleana.
- **Evidência ausente:** assertions sobre `problems` e, no happy path, sobre `metrics`, `instrumentedFiles`, `lcovFiles` e `sourceFiles`.
- **Por que importa:** um caso negativo pode continuar retornando false por uma causa errada e ainda passar.
- **Ação solicitada:** em mudança separada, fortalecer cada cenário para provar pelo menos o diagnóstico esperado e ausência de diagnósticos incidentais relevantes; no happy path, validar o shape retornado.
- **Regressão possível:** branch nominal deixa de funcionar, outro branch passa a reprovar a fixture e o self-test permanece verde.
- **Severidade:** HIGH.

### 084-002 — TEST_REQUIRED — OPEN

- **Arquivo alvo:** `scripts/validation/verify-coverage-selftest.js`
- **Encontrado ao auditar:** cobertura dos branches de `verify-coverage.js`.
- **Achado:** vários branches do verifier não possuem cenário focal neste self-test.
- **Evidência atual:** seis cenários cobrem happy path, LCOV vazio, zero, ausência crítica combinada e thresholds global/crítico.
- **Evidência ausente:** summary ausente/vazio/inválido, LCOV sem SF, extension vazia, faltas independentes summary/LCOV, pct inválido, minInstrumentedFiles, criticalMinimum sem summaryKey e paths relativos/Windows.
- **Ação solicitada:** adicionar casos independentes usando a implementação real, sem copiar a lógica do verifier.
- **Regressão possível:** branches fail-closed ou normalização de paths podem regredir sem quebrar a suíte atual.
- **Severidade:** NORMAL.

### 084-003 — CONTRACT_REVIEW — OPEN

- **Arquivo alvo:** `scripts/validation/verify-ci-contract.js`
- **Encontrado ao auditar:** wiring estático do self-test.
- **Achado:** linhas 474–477 protegem cinco labels de cenário, mas não `threshold crítico abaixo do mínimo`.
- **Evidência atual:** o cenário crítico existe na linha 102 deste arquivo e executa a implementação real.
- **Evidência ausente:** gate que detecte remoção silenciosa desse cenário.
- **Ação solicitada:** decidir se o cenário crítico é invariável obrigatória; se for, proteger sua presença/semântica em alteração separada.
- **Regressão possível:** o caso de threshold por arquivo crítico pode ser removido do self-test sem o CI Contract apontar o enfraquecimento.
- **Severidade:** NORMAL.

### 084-004 — FIXTURE_INTEGRITY_REVIEW — OPEN

- **Arquivo alvo:** `scripts/validation/verify-coverage-selftest.js` / `scripts/validation/verify-coverage.js`
- **Encontrado ao auditar:** helper `coverageEntry`.
- **Achado:** pct 75 produz `covered=8` de total 10, mas mantém `pct=75`; a fixture é internamente inconsistente.
- **Evidência atual:** o verifier lê `pct` e não reconcilia contagens; o self-test passa com essa fixture.
- **Evidência ausente:** decisão explícita se consistência aritmética do summary é ou não parte do contrato de integridade.
- **Ação solicitada:** auditor deve decidir se a fixture deve usar valores coerentes e se o verifier deve detectar inconsistência de contagens versus pct.
- **Regressão possível:** relatórios sintéticos ou corrompidos com pct incoerente podem ser aceitos porque somente o campo pct governa thresholds.
- **Severidade:** NORMAL.

## 12. Invariantes documentais e operacionais

1. O self-test deve continuar importando `verifyCoverage` real, não duplicar sua lógica.
2. O happy path precisa continuar terminando com `ok=true`.
3. LCOV vazio precisa continuar causando reprovação.
4. Coverage total 0 precisa continuar causando reprovação.
5. Ausência do arquivo crítico precisa continuar causando reprovação.
6. Threshold global maior que o actual precisa continuar causando reprovação.
7. Threshold crítico maior que o actual precisa continuar causando reprovação.
8. Cada caso deve usar root temporário isolado.
9. Cleanup normal deve continuar acontecendo mesmo quando a assertion ou verifier lança após a criação completa da fixture.
10. O script deve permanecer fail-closed: exceção não deve ser mascarada com exit 0.
11. O wiring em package.json e CI não deve apontar para cópia alternativa do self-test.
12. O SHA desta Bíblia é válido apenas enquanto o fonte permanecer `ac08dd661f2d2410a56a7fd685cd9b55e85901f9`.

## 13. Fonte integral auditada

~~~javascript
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { verifyCoverage } = require('./verify-coverage');

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function coverageEntry(file, pct) {
  return {
    lines: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
    statements: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
    functions: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
    branches: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
  };
}

function createFixture({
  emptyLcov = false,
  zero = false,
  omitCritical = false,
  threshold = 10,
  criticalThreshold = null,
  actual = 75,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-coverage-selftest-'));
  const extension = path.join(root, 'extension');
  const coverage = path.join(root, 'tests', 'coverage');
  const baseline = path.join(root, 'tests', 'ci', 'test-baseline.json');
  const critical = 'extension/background.js';
  const other = 'extension/content/content_manga.js';

  writeFile(path.join(root, critical), 'module.exports = 1;\n');
  writeFile(path.join(root, other), 'module.exports = 2;\n');

  const pct = zero ? 0 : actual;
  const summary = {
    total: coverageEntry('total', pct),
  };
  if (!omitCritical) summary[path.join(root, critical)] = coverageEntry(critical, pct);
  summary[path.join(root, other)] = coverageEntry(other, pct);

  writeFile(path.join(coverage, 'coverage-summary.json'), JSON.stringify(summary, null, 2));
  const lcovFiles = omitCritical ? [other] : [critical, other];
  writeFile(
    path.join(coverage, 'lcov.info'),
    emptyLcov ? '' : lcovFiles.map((file) => 'TN:\nSF:' + path.join(root, file) +
      '\nFNF:1\nFNH:1\nLF:1\nLH:1\nBRF:1\nBRH:1\nend_of_record\n').join('')
  );
  writeFile(baseline, JSON.stringify({
    coverage: {
      minInstrumentedFiles: 2,
      minimum: {
        statements: threshold,
        branches: threshold,
        functions: threshold,
        lines: threshold,
      },
      criticalMinimum: criticalThreshold == null ? {} : {
        [critical]: {
          statements: criticalThreshold,
          branches: criticalThreshold,
          functions: criticalThreshold,
          lines: criticalThreshold,
        },
      },
    },
  }, null, 2));

  return { root, coverage, baseline, critical };
}

function expectCase(name, fixtureOptions, expectedOk) {
  const fx = createFixture(fixtureOptions);
  try {
    const result = verifyCoverage({
      repoRoot: fx.root,
      coverageDir: fx.coverage,
      baselinePath: fx.baseline,
      criticalFiles: [fx.critical],
      quiet: true,
    });
    if (result.ok !== expectedOk) {
      throw new Error(name + ': esperado ok=' + expectedOk + ', recebido ok=' + result.ok +
        '\n' + result.problems.join('\n'));
    }
    console.log('✓ ' + name);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
}

expectCase('coverage normal', {}, true);
expectCase('lcov vazio', { emptyLcov: true }, false);
expectCase('coverage 0%', { zero: true }, false);
expectCase('arquivo crítico ausente', { omitCritical: true }, false);
expectCase('threshold abaixo do mínimo', { threshold: 80, actual: 75 }, false);
expectCase('threshold crítico abaixo do mínimo', { criticalThreshold: 80, actual: 75 }, false);

console.log('✅ Self-test da infraestrutura de coverage aprovado.');
~~~

## 14. Cobertura posição por posição

### Linha 001

- **Conteúdo:** `'use strict';`
- **Papel:** Ativa strict mode no processo CommonJS do self-test, tornando erros como atribuições acidentais mais explícitos.

### Linha 002

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa a diretiva de modo estrito das dependências Node.

### Linha 003

- **Conteúdo:** `const fs = require('fs');`
- **Papel:** Importa `fs`, usado para criar diretórios, escrever fixtures e remover o diretório temporário.

### Linha 004

- **Conteúdo:** `const os = require('os');`
- **Papel:** Importa `os`, usado exclusivamente para obter o diretório temporário do sistema via `os.tmpdir()`.

### Linha 005

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa `path`, usado para montar caminhos portáveis da fixture e do baseline sintético.

### Linha 006

- **Conteúdo:** `const { verifyCoverage } = require('./verify-coverage');`
- **Papel:** Importa a implementação real `verifyCoverage` do módulo irmão; este é o vínculo que torna os seis casos testes da implementação real, e não uma cópia.

### Linha 007

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa imports do helper de escrita.

### Linha 008

- **Conteúdo:** `function writeFile(file, content) {`
- **Papel:** Declara `writeFile(file, content)`, helper síncrono para materializar arquivos da fixture.

### Linha 009

- **Conteúdo:** `  fs.mkdirSync(path.dirname(file), { recursive: true });`
- **Papel:** Garante recursivamente a existência do diretório pai antes da escrita; permite criar árvores temporárias completas sem setup prévio.

### Linha 010

- **Conteúdo:** `  fs.writeFileSync(file, content);`
- **Papel:** Escreve o conteúdo do arquivo de fixture de forma síncrona; erros de I/O propagam e fazem o self-test falhar.

### Linha 011

- **Conteúdo:** `}`
- **Papel:** Fecha o helper `writeFile`.

### Linha 012

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual entre helpers.

### Linha 013

- **Conteúdo:** `function coverageEntry(file, pct) {`
- **Papel:** Declara `coverageEntry(file, pct)`; o parâmetro `file` não é usado no corpo e é uma redundância observável.

### Linha 014

- **Conteúdo:** `  return {`
- **Papel:** Inicia o objeto de métricas que imita uma entrada de `coverage-summary.json`.

### Linha 015

- **Conteúdo:** `    lines: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },`
- **Papel:** Cria a métrica `lines` com total 10, covered arredondado, skipped 0 e o `pct` fornecido. Para pct=75, covered vira 8 embora pct permaneça 75; o self-test não valida consistência aritmética entre contagem e percentual.

### Linha 016

- **Conteúdo:** `    statements: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },`
- **Papel:** Cria a métrica `statements` com total 10, covered arredondado, skipped 0 e o `pct` fornecido. Para pct=75, covered vira 8 embora pct permaneça 75; o self-test não valida consistência aritmética entre contagem e percentual.

### Linha 017

- **Conteúdo:** `    functions: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },`
- **Papel:** Cria a métrica `functions` com total 10, covered arredondado, skipped 0 e o `pct` fornecido. Para pct=75, covered vira 8 embora pct permaneça 75; o self-test não valida consistência aritmética entre contagem e percentual.

### Linha 018

- **Conteúdo:** `    branches: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },`
- **Papel:** Cria a métrica `branches` com total 10, covered arredondado, skipped 0 e o `pct` fornecido. Para pct=75, covered vira 8 embora pct permaneça 75; o self-test não valida consistência aritmética entre contagem e percentual.

### Linha 019

- **Conteúdo:** `  };`
- **Papel:** Fecha o objeto retornado por `coverageEntry`.

### Linha 020

- **Conteúdo:** `}`
- **Papel:** Fecha o helper `coverageEntry`.

### Linha 021

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual antes do factory de fixture.

### Linha 022

- **Conteúdo:** `function createFixture({`
- **Papel:** Inicia `createFixture`, factory parametrizado de uma árvore temporária mínima que simula fonte, cobertura e baseline.

### Linha 023

- **Conteúdo:** `  emptyLcov = false,`
- **Papel:** Opção `emptyLcov`: quando verdadeira, grava `lcov.info` vazio para provar rejeição do artefato vazio.

### Linha 024

- **Conteúdo:** `  zero = false,`
- **Papel:** Opção `zero`: força percentual global e por arquivo a 0, exercitando a rejeição de coverage zero.

### Linha 025

- **Conteúdo:** `  omitCritical = false,`
- **Papel:** Opção `omitCritical`: remove o arquivo crítico tanto do summary quanto do LCOV, mantendo o fonte físico presente.

### Linha 026

- **Conteúdo:** `  threshold = 10,`
- **Papel:** Opção `threshold`: baseline mínimo global; default 10 fica abaixo do actual default 75.

### Linha 027

- **Conteúdo:** `  criticalThreshold = null,`
- **Papel:** Opção `criticalThreshold`: `null` desativa thresholds críticos; valor numérico cria política por arquivo crítico.

### Linha 028

- **Conteúdo:** `  actual = 75,`
- **Papel:** Opção `actual`: percentual sintético usado no summary; default 75.

### Linha 029

- **Conteúdo:** `} = {}) {`
- **Papel:** Fecha a desestruturação de opções e define default `{}` para chamadas sem argumentos.

### Linha 030

- **Conteúdo:** `  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-coverage-selftest-'));`
- **Papel:** Cria diretório temporário único sob `os.tmpdir()` com prefixo `mt-coverage-selftest-`; a limpeza normal ocorre no `finally` de `expectCase`.

### Linha 031

- **Conteúdo:** `  const extension = path.join(root, 'extension');`
- **Papel:** Monta o caminho `extension/` da fixture; esta constante não é usada diretamente depois, apenas documenta a árvore e é estado morto local.

### Linha 032

- **Conteúdo:** `  const coverage = path.join(root, 'tests', 'coverage');`
- **Papel:** Monta `tests/coverage`, diretório passado explicitamente a `verifyCoverage` como `coverageDir`.

### Linha 033

- **Conteúdo:** `  const baseline = path.join(root, 'tests', 'ci', 'test-baseline.json');`
- **Papel:** Monta um baseline sintético em `tests/ci/test-baseline.json`; a localização difere do default de produção, mas é passada explicitamente a `verifyCoverage`.

### Linha 034

- **Conteúdo:** `  const critical = 'extension/background.js';`
- **Papel:** Define o caminho relativo do arquivo crítico sintético como `extension/background.js`.

### Linha 035

- **Conteúdo:** `  const other = 'extension/content/content_manga.js';`
- **Papel:** Define o segundo fonte sintético `extension/content/content_manga.js`, garantindo inventário mínimo de dois arquivos.

### Linha 036

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco antes da criação dos fontes.

### Linha 037

- **Conteúdo:** `  writeFile(path.join(root, critical), 'module.exports = 1;\n');`
- **Papel:** Materializa `background.js` mínimo; o conteúdo JavaScript é irrelevante para o verificador, que inspeciona inventário de arquivos e relatórios.

### Linha 038

- **Conteúdo:** `  writeFile(path.join(root, other), 'module.exports = 2;\n');`
- **Papel:** Materializa `content_manga.js` mínimo, completando os dois fontes esperados na fixture.

### Linha 039

- **Conteúdo:** _linha em branco_
- **Papel:** Separador antes da montagem do summary.

### Linha 040

- **Conteúdo:** `  const pct = zero ? 0 : actual;`
- **Papel:** Calcula `pct`: 0 no cenário zero, caso contrário usa `actual`.

### Linha 041

- **Conteúdo:** `  const summary = {`
- **Papel:** Inicia o objeto `summary` que será serializado como `coverage-summary.json`.

### Linha 042

- **Conteúdo:** `    total: coverageEntry('total', pct),`
- **Papel:** Adiciona a entrada agregada `total` usando o mesmo percentual sintético das entradas individuais.

### Linha 043

- **Conteúdo:** `  };`
- **Papel:** Fecha a inicialização básica de `summary`.

### Linha 044

- **Conteúdo:** `  if (!omitCritical) summary[path.join(root, critical)] = coverageEntry(critical, pct);`
- **Papel:** Inclui o arquivo crítico no summary, exceto quando `omitCritical=true`; esse branch participa do cenário de ausência crítica.

### Linha 045

- **Conteúdo:** `  summary[path.join(root, other)] = coverageEntry(other, pct);`
- **Papel:** Inclui sempre o segundo arquivo no summary para que a fixture não fique vazia.

### Linha 046

- **Conteúdo:** _linha em branco_
- **Papel:** Separador antes da escrita dos artefatos de coverage.

### Linha 047

- **Conteúdo:** `  writeFile(path.join(coverage, 'coverage-summary.json'), JSON.stringify(summary, null, 2));`
- **Papel:** Serializa o summary com indentação e o grava em `coverage-summary.json` dentro do coverageDir sintético.

### Linha 048

- **Conteúdo:** `  const lcovFiles = omitCritical ? [other] : [critical, other];`
- **Papel:** Monta a lista de arquivos do LCOV: omite o crítico no mesmo cenário em que ele é omitido do summary.

### Linha 049

- **Conteúdo:** `  writeFile(`
- **Papel:** Inicia a chamada multiline de `writeFile` para `lcov.info`.

### Linha 050

- **Conteúdo:** `    path.join(coverage, 'lcov.info'),`
- **Papel:** Define o caminho físico do `lcov.info` sintético.

### Linha 051

- **Conteúdo:** `    emptyLcov ? '' : lcovFiles.map((file) => 'TN:\nSF:' + path.join(root, file) +`
- **Papel:** Escolhe string vazia para `emptyLcov`; caso contrário inicia um registro LCOV por arquivo com `TN` e `SF` absoluto.

### Linha 052

- **Conteúdo:** `      '\nFNF:1\nFNH:1\nLF:1\nLH:1\nBRF:1\nBRH:1\nend_of_record\n').join('')`
- **Papel:** Completa cada registro LCOV com contagens mínimas FNF/FNH/LF/LH/BRF/BRH e `end_of_record`, depois concatena todos.

### Linha 053

- **Conteúdo:** `  );`
- **Papel:** Fecha a escrita do LCOV.

### Linha 054

- **Conteúdo:** `  writeFile(baseline, JSON.stringify({`
- **Papel:** Inicia a escrita do baseline sintético como JSON formatado.

### Linha 055

- **Conteúdo:** `    coverage: {`
- **Papel:** Abre a chave `coverage` do baseline.

### Linha 056

- **Conteúdo:** `      minInstrumentedFiles: 2,`
- **Papel:** Fixa `minInstrumentedFiles: 2`; o happy path satisfaz esse valor, mas nenhum cenário reduz apenas o número de entradas para provar esse branch isoladamente.

### Linha 057

- **Conteúdo:** `      minimum: {`
- **Papel:** Abre o mapa `minimum` de thresholds globais.

### Linha 058

- **Conteúdo:** `        statements: threshold,`
- **Papel:** Atribui o mesmo `threshold` sintético à métrica global `statements`, permitindo o cenário da linha 101 reprovar as quatro métricas quando 80 > 75.

### Linha 059

- **Conteúdo:** `        branches: threshold,`
- **Papel:** Atribui o mesmo `threshold` sintético à métrica global `branches`, permitindo o cenário da linha 101 reprovar as quatro métricas quando 80 > 75.

### Linha 060

- **Conteúdo:** `        functions: threshold,`
- **Papel:** Atribui o mesmo `threshold` sintético à métrica global `functions`, permitindo o cenário da linha 101 reprovar as quatro métricas quando 80 > 75.

### Linha 061

- **Conteúdo:** `        lines: threshold,`
- **Papel:** Atribui o mesmo `threshold` sintético à métrica global `lines`, permitindo o cenário da linha 101 reprovar as quatro métricas quando 80 > 75.

### Linha 062

- **Conteúdo:** `      },`
- **Papel:** Fecha o mapa de mínimos globais.

### Linha 063

- **Conteúdo:** `      criticalMinimum: criticalThreshold == null ? {} : {`
- **Papel:** Define `criticalMinimum`: objeto vazio quando `criticalThreshold` é null; caso contrário cria política para o arquivo crítico.

### Linha 064

- **Conteúdo:** `        [critical]: {`
- **Papel:** Abre o mapa de thresholds do caminho crítico definido na linha 34.

### Linha 065

- **Conteúdo:** `          statements: criticalThreshold,`
- **Papel:** Atribui `criticalThreshold` à métrica crítica `statements`; no cenário da linha 102 o valor 80 deve reprovar o pct 75.

### Linha 066

- **Conteúdo:** `          branches: criticalThreshold,`
- **Papel:** Atribui `criticalThreshold` à métrica crítica `branches`; no cenário da linha 102 o valor 80 deve reprovar o pct 75.

### Linha 067

- **Conteúdo:** `          functions: criticalThreshold,`
- **Papel:** Atribui `criticalThreshold` à métrica crítica `functions`; no cenário da linha 102 o valor 80 deve reprovar o pct 75.

### Linha 068

- **Conteúdo:** `          lines: criticalThreshold,`
- **Papel:** Atribui `criticalThreshold` à métrica crítica `lines`; no cenário da linha 102 o valor 80 deve reprovar o pct 75.

### Linha 069

- **Conteúdo:** `        },`
- **Papel:** Fecha o objeto de thresholds do arquivo crítico.

### Linha 070

- **Conteúdo:** `      },`
- **Papel:** Fecha a expressão condicional que escolhe `{}` ou o mapa crítico.

### Linha 071

- **Conteúdo:** `    },`
- **Papel:** Fecha o objeto `coverage`.

### Linha 072

- **Conteúdo:** `  }, null, 2));`
- **Papel:** Fecha o JSON do baseline, serializa com indentação e conclui a escrita.

### Linha 073

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco antes do retorno da fixture.

### Linha 074

- **Conteúdo:** `  return { root, coverage, baseline, critical };`
- **Papel:** Retorna os caminhos necessários ao executor: raiz, coverageDir, baselinePath e o caminho relativo crítico.

### Linha 075

- **Conteúdo:** `}`
- **Papel:** Fecha `createFixture`.

### Linha 076

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual antes do executor de casos.

### Linha 077

- **Conteúdo:** `function expectCase(name, fixtureOptions, expectedOk) {`
- **Papel:** Declara `expectCase(name, fixtureOptions, expectedOk)`, harness que executa a implementação real para uma fixture.

### Linha 078

- **Conteúdo:** `  const fx = createFixture(fixtureOptions);`
- **Papel:** Cria a fixture antes do `try`; se `createFixture` lançar depois de `mkdtempSync`, o `finally` abaixo não é alcançado e o diretório temporário pode permanecer.

### Linha 079

- **Conteúdo:** `  try {`
- **Papel:** Inicia o bloco protegido cuja saída sempre aciona limpeza da fixture já criada.

### Linha 080

- **Conteúdo:** `    const result = verifyCoverage({`
- **Papel:** Chama diretamente a função real `verifyCoverage` importada na linha 6.

### Linha 081

- **Conteúdo:** `      repoRoot: fx.root,`
- **Papel:** Substitui `repoRoot` pelo diretório temporário, isolando a prova do repositório real.

### Linha 082

- **Conteúdo:** `      coverageDir: fx.coverage,`
- **Papel:** Passa o diretório sintético `tests/coverage` como `coverageDir`.

### Linha 083

- **Conteúdo:** `      baselinePath: fx.baseline,`
- **Papel:** Passa o baseline sintético explicitamente, evitando depender do baseline real do projeto.

### Linha 084

- **Conteúdo:** `      criticalFiles: [fx.critical],`
- **Papel:** Restringe `criticalFiles` ao único caminho crítico da fixture; isso torna o caso determinístico.

### Linha 085

- **Conteúdo:** `      quiet: true,`
- **Papel:** Ativa `quiet`, evitando logs de inventário/métricas durante o self-test.

### Linha 086

- **Conteúdo:** `    });`
- **Papel:** Fecha a chamada de `verifyCoverage` e captura seu objeto de resultado.

### Linha 087

- **Conteúdo:** `    if (result.ok !== expectedOk) {`
- **Papel:** Compara somente o booleano `result.ok` com `expectedOk`; não verifica mensagens, métricas nem listas retornadas.

### Linha 088

- **Conteúdo:** `      throw new Error(name + ': esperado ok=' + expectedOk + ', recebido ok=' + result.ok +`
- **Papel:** Inicia a exceção diagnóstica para mismatch de booleano, incluindo nome do cenário e valores esperado/recebido.

### Linha 089

- **Conteúdo:** `        '\n' + result.problems.join('\n'));`
- **Papel:** Anexa todas as mensagens `result.problems` ao erro apenas quando o booleano diverge; as mensagens não são assertions do caminho normal.

### Linha 090

- **Conteúdo:** `    }`
- **Papel:** Fecha o branch de falha da assertion manual.

### Linha 091

- **Conteúdo:** `    console.log('✓ ' + name);`
- **Papel:** Emite marca de sucesso por cenário depois que a comparação booleana passa.

### Linha 092

- **Conteúdo:** `  } finally {`
- **Papel:** Inicia `finally`, garantindo cleanup se `verifyCoverage` ou a assertion lançar após a fixture ter sido criada.

### Linha 093

- **Conteúdo:** `    fs.rmSync(fx.root, { recursive: true, force: true });`
- **Papel:** Remove recursivamente a raiz temporária com `force:true`; falha de remoção ainda pode lançar e falhar o self-test.

### Linha 094

- **Conteúdo:** `  }`
- **Papel:** Fecha o `finally`.

### Linha 095

- **Conteúdo:** `}`
- **Papel:** Fecha o helper `expectCase`.

### Linha 096

- **Conteúdo:** _linha em branco_
- **Papel:** Separador antes da tabela executável de cenários.

### Linha 097

- **Conteúdo:** `expectCase('coverage normal', {}, true);`
- **Papel:** Executa happy path com defaults e exige `ok=true`; prova diretamente a aceitação do conjunto sintético válido.

### Linha 098

- **Conteúdo:** `expectCase('lcov vazio', { emptyLcov: true }, false);`
- **Papel:** Executa `lcov.info` vazio e exige `ok=false`; prova diretamente rejeição global do artefato vazio, sem assertar a mensagem exata.

### Linha 099

- **Conteúdo:** `expectCase('coverage 0%', { zero: true }, false);`
- **Papel:** Executa percentuais 0 e exige `ok=false`; prova diretamente que o verifier rejeita a fixture com coverage zero.

### Linha 100

- **Conteúdo:** `expectCase('arquivo crítico ausente', { omitCritical: true }, false);`
- **Papel:** Omite o crítico do summary e LCOV e exige `ok=false`; prova rejeição do cenário combinado, mas não isola qual diagnóstico específico causou o false.

### Linha 101

- **Conteúdo:** `expectCase('threshold abaixo do mínimo', { threshold: 80, actual: 75 }, false);`
- **Papel:** Eleva mínimos globais para 80 com actual 75 e exige `ok=false`; prova rejeição quando o coverage total fica abaixo do baseline.

### Linha 102

- **Conteúdo:** `expectCase('threshold crítico abaixo do mínimo', { criticalThreshold: 80, actual: 75 }, false);`
- **Papel:** Eleva thresholds críticos para 80 com actual 75 e exige `ok=false`; prova rejeição do threshold crítico pela implementação real.

### Linha 103

- **Conteúdo:** _linha em branco_
- **Papel:** Separador antes da mensagem final.

### Linha 104

- **Conteúdo:** `console.log('✅ Self-test da infraestrutura de coverage aprovado.');`
- **Papel:** Imprime mensagem global de sucesso somente se todos os seis `expectCase` terminarem sem lançar.

### Linha 105

- **Conteúdo:** _newline final após a linha 104_
- **Papel:** Posição terminal: newline final do arquivo. Preserva terminação POSIX e conta como a 105ª posição documental.


## 15. Autoauditoria documental

- **SHA do fonte reconfirmado antes da materialização:** sim.
- **Fonte integral embutida:** sim, conteúdo exato do blob auditado.
- **Cobertura:** 104 linhas textuais + newline final = **105/105 posições**.
- **Headings de posição:** Linha 001 → Linha 105, sem lacunas.
- **Dependência real lida:** `verify-coverage.js`.
- **Consumers/wiring lidos:** `package.json`, `.github/workflows/ci.yml`, `verify-ci-contract.js`.
- **Classificação de evidência conservadora:** sim; booleano direto não foi promovido a assertion de mensagem/shape.
- **Mudanças funcionais produzidas para fabricar prova:** nenhuma.
- **Solicitações externas registradas:** 084-001 a 084-004.
- **Estado documental:** concluído segundo o escopo desta unidade independente.

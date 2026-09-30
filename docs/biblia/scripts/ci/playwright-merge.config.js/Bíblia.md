# Bíblia técnica — scripts/ci/playwright-merge.config.js

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE ATIVA  
> **SHA auditado:** `59839922aca9f6f442100b3e6723313ef53d3a54`  
> **Agente responsável pela auditoria:** AGENTE 10  
> **Tipo:** configuração CommonJS auxiliar do Playwright para merge de blob reports  
> **Linhas textuais:** **8**  
> **Posições documentais:** **9**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Identidade e papel arquitetural

O arquivo `scripts/ci/playwright-merge.config.js` não é a configuração principal de execução E2E. Seu papel é deliberadamente mais estreito: fornecer a configuração de reporters usada pelo comando `playwright merge-reports` depois que os shards E2E já terminaram e seus blob reports foram baixados para o job agregador da CI.

No fluxo atual do Manga Translator, `playwright.config.js` decide como os testes são executados. Em CI com `MANGA_E2E_SHARD=1`, os shards produzem reporter `blob`. Depois, o job agregado de `.github/workflows/ci.yml` baixa os cinco artifacts, exige exatamente cinco arquivos `.zip` e executa:

```text
npx playwright merge-reports --config=scripts/ci/playwright-merge.config.js ./all-blob-reports
```

Esta configuração entra somente nessa fase de merge. Ela escolhe dois reporters para o resultado reconstruído: o reporter de console `line` e o reporter local `playwright-gate-reporter.js`, responsável por aplicar o gate global de quantidade mínima, skipped, flaky/retry e status final não aprovado.

## 2. Posição no pipeline E2E

Fluxo concreto:

1. `playwright.config.js` executa cada grupo/shard.
2. Em shard de CI, o reporter `blob` serializa os resultados.
3. A CI publica um artifact por grupo.
4. O job agregador baixa e junta os artifacts em `all-blob-reports/`.
5. O workflow verifica que há exatamente cinco blobs.
6. `playwright merge-reports` carrega este arquivo por `--config`.
7. O merge materializa os resultados consolidados.
8. O reporter `line` fornece saída textual.
9. O reporter `playwright-gate-reporter.js` reavalia o inventário agregado e pode reprovar o comando.

A separação evita reutilizar `playwright.config.js` como se o merge fosse uma nova execução de testes. O merge não precisa de `testDir`, `workers`, `retries`, projetos, servidor web ou opções de launch; esses parâmetros já fizeram sentido antes, durante a execução dos shards.

## 3. Dependências e consumidores

### Dependência direta: módulo Node `path`

A linha 1 carrega `path`, módulo built-in do Node. Ele é usado na linha 6 para construir o caminho do reporter local a partir de `__dirname`.

Isso é importante porque o comando de merge é disparado da raiz do repositório, mas o arquivo está em `scripts/ci/`. Resolver o reporter com base no diretório da própria config evita depender do current working directory para localizar `playwright-gate-reporter.js`.

### Dependência direta: `scripts/ci/playwright-gate-reporter.js`

A linha 6 registra o reporter customizado como segundo reporter. Esse módulo:

- conta os testes descobertos;
- preserva as tentativas por `test.id`;
- calcula skipped;
- detecta teste que só passou após retry;
- conta status final diferente de passed/skipped;
- compara os números com `scripts/ci/data/test-baseline.json`;
- retorna `{ status: 'failed' }` quando o gate encontra violações.

A config não implementa essas regras. Ela apenas conecta o reporter ao lifecycle de merge.

### Consumidor operacional: `.github/workflows/ci.yml`

O job E2E agregado executa diretamente o arquivo com `--config=scripts/ci/playwright-merge.config.js`. Antes do merge, o workflow valida o plano e exige cinco blob reports. Portanto esta config participa do ponto em que resultados independentes de shards voltam a ser avaliados como um conjunto único.

### Consumidor de contrato: `scripts/validation/verify-ci-contract.js`

O verificador de CI exige que o bloco E2E agregado contenha tanto `merge-reports` quanto `playwright-merge.config.js`. Esse gate não interpreta o objeto exportado por esta config, mas protege a ligação do workflow ao arquivo.

### Consumidor estrutural: `scripts/validation/verify-repository-structure.js`

O gate estrutural reconhece exatamente duas configs Playwright:

- `playwright.config.js`;
- `scripts/ci/playwright-merge.config.js`.

Além disso, lê o texto deste arquivo e reprova se ele ganhar qualquer uma destas chaves de execução:

- `testDir`;
- `outputDir`;
- `workers`;
- `retries`;
- `projects`;
- `webServer`;
- `launchOptions`.

Esse contrato preserva a fronteira arquitetural: esta config é de merge/reporter, não uma segunda configuração de execução.

## 4. Dados, estado, efeitos colaterais e lifecycle

Durante a avaliação do arquivo não há leitura de storage, rede, Chrome API, DOM ou dados do usuário.

Estado local criado pela config:

- referência ao módulo `path`;
- objeto exportado com a propriedade `reporter`;
- array contendo duas descrições de reporter.

Efeito concreto da config aparece quando Playwright consome o objeto: o merge instancia/configura os reporters listados. O primeiro produz saída textual; o segundo executa a política do gate E2E.

O arquivo não cria timers, listeners, workers ou recursos persistentes. Também não existe lifecycle MV3 aqui: a execução ocorre no processo Node da CI, fora da extensão.

## 5. Assincronismo e falhas

Esta configuração é síncrona. O único carregamento explícito é `require('path')`; `path.join` também é síncrono e puramente computacional.

As falhas relevantes são delegadas ao consumidor:

- se o arquivo não puder ser carregado, `playwright merge-reports` falha;
- se o reporter local estiver ausente/incompatível, a resolução/carregamento do reporter falha;
- se o reporter retornar status de falha no `onEnd`, o gate agregado deve tornar a etapa E2E não aprovada;
- se os blobs estiverem incompletos, o workflow falha antes de chegar a esta config porque exige cinco arquivos.

Não há `try/catch` local. Para uma configuração pequena, deixar erros de carregamento propagarem é preferível a mascará-los e permitir merge sem o gate.

## 6. Segurança, privacidade e trust boundaries

O arquivo não recebe input do usuário e não processa URLs, cookies, tokens, imagens, Base64, prompts Gemini, tabIds nem mensagens da extensão.

O principal trust boundary é o filesystem/código do repositório executado pela CI. A linha 6 aponta para um reporter local versionado. Usar `path.join(__dirname, ...)` reduz ambiguidade de resolução em relação a um caminho relativo dependente do diretório corrente.

Risco de supply-chain continua existindo no nível do Playwright/Node e das dependências instaladas por `npm ci`, mas esta config não amplia permissões nem baixa código.

Também há um risco de integridade do gate: remover silenciosamente o reporter customizado poderia deixar o merge gerar relatório sem aplicar as políticas adicionais. Os gates atuais protegem o uso da config pelo workflow e a natureza restrita do arquivo, mas não possuem assertion focal que prove que o array `reporter` contém exatamente o reporter local.

## 7. Evidência automatizada

| Comportamento | Evidência real localizada | Classificação |
|---|---|---|
| O workflow agregado chama `playwright merge-reports` usando este caminho de config | `scripts/validation/verify-ci-contract.js` exige as strings `merge-reports` e `playwright-merge.config.js` no job E2E | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Esta config permanece auxiliar e não vira uma segunda config de execução | `verify-repository-structure.js` permite exatamente as duas configs e proíbe `testDir/outputDir/workers/retries/projects/webServer/launchOptions` nesta | 🟦 GATE ESTÁTICO ESPECÍFICO |
| O comando real de CI carrega a config durante o merge | `.github/workflows/ci.yml` executa `npx playwright merge-reports --config=...` | 🟨 EXECUTADO INDIRETAMENTE |
| O reporter customizado reprova skipped acima do baseline, flaky/retry, total abaixo do mínimo e status terminais failed/timedOut/interrupted | `playwright-gate-reporter-selftest.js` instancia a implementação real e faz assertions sobre `onEnd` | ✅ PROVADO DIRETAMENTE para o reporter dependente, mas não para o wiring desta config |
| A linha 6 resolve especificamente o reporter a partir de `__dirname` | Nenhum teste focal importa esta config e compara o caminho exportado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| O array contém exatamente `line` seguido do reporter gate | Nenhuma assertion focal localizada para conteúdo e ordem do array exportado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| A config não contém outras chaves além de `reporter` | O gate proíbe sete chaves conhecidas, mas não rejeita qualquer chave arbitrária adicional | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

### Distinção importante

O self-test do reporter é evidência forte da implementação de `playwright-gate-reporter.js`. Ele não importa `playwright-merge.config.js`; portanto não prova diretamente que esta config realmente exporta o reporter correto. Essa propriedade continua sem assertion específica.

## 8. Casos-limite

1. **CWD diferente da raiz:** a resolução do reporter continua baseada em `__dirname`; por isso o caminho do módulo não depende do diretório de onde o CLI foi iniciado.
2. **Reporter renomeado ou movido:** `path.join` continua produzindo um caminho, mas o carregamento falha se o alvo não existir.
3. **Config usada para `playwright test` por engano:** faltam parâmetros de execução deliberadamente; o gate estrutural existe para evitar transformar este arquivo numa config paralela.
4. **Reporter gate removido da lista:** o merge ainda pode gerar saída `line`, mas as políticas adicionais deixam de ser aplicadas. Falta teste focal que bloqueie exatamente essa regressão.
5. **Reporter `line` removido:** a política customizada ainda pode funcionar, mas a saída humana do merge muda; não há assertion específica para esse requisito.
6. **Ordem invertida:** Playwright aceita múltiplos reporters, mas side effects/ordem de saída podem mudar. Não há prova específica de que a ordem atual é requisito.
7. **Nova chave aparentemente inofensiva:** o gate só bloqueia uma denylist de chaves de execução; uma nova chave Playwright não listada pode entrar sem ser barrada.
8. **Mudança de API do Playwright:** o formato `reporter: [[name], [path]]` depende do contrato da versão instalada. Atualizações de Playwright precisam revalidar o merge.

## 9. Análise crítica

1. **Gate estrutural usa denylist, não allowlist.** Ele impede sete chaves conhecidas, mas não garante que `reporter` seja a única chave exportada. Se a intenção arquitetural é “somente merge/reporter”, uma validação estrutural do objeto seria mais forte.
2. **Wiring não tem teste focal.** Nenhum teste localizado importa esta config e verifica o valor exportado. Uma regressão de typo no nome do reporter local provavelmente só apareceria quando a etapa real de merge rodasse.
3. **Dependência pelo nome do arquivo no workflow é estática.** `verify-ci-contract.js` confirma a string do caminho, mas não executa o merge nessa verificação.
4. **O reporter customizado é bem mais complexo que a config.** Seu self-test direto reduz risco da lógica do gate, mas não cobre a ponte criada pela linha 6.
5. **Config deliberadamente pequena.** Essa simplicidade é uma vantagem: menos superfície de drift entre execução e merge. Adicionar retry/workers/projetos aqui duplicaria responsabilidade já definida em `playwright.config.js`.
6. **Sem fallback silencioso.** Não há tentativa de ignorar erro do reporter. Isso preserva fail-closed para problemas de carregamento do gate.
7. **Acoplamento de caminho local é intencional.** Mover `playwright-gate-reporter.js` exige atualizar esta config; o gate atual não verifica diretamente a existência desse caminho via import da config.

## 10. Invariantes

1. Este arquivo deve continuar sendo **config de merge/reporter**, não config de execução de testes.
2. `playwright.config.js` deve continuar sendo a configuração canônica de execução E2E.
3. O job agregado deve continuar apontando explicitamente para este arquivo ao executar `merge-reports`.
4. O reporter global de gate deve continuar conectado ao merge enquanto a aprovação E2E depender de skipped/flaky/final-status agregados.
5. O caminho do reporter local deve continuar resolvendo a partir do diretório desta config, ou solução equivalente deve preservar independência de CWD.
6. Não introduzir `workers`, `retries`, `projects`, `testDir`, `outputDir`, `webServer` ou `launchOptions` sem redefinir conscientemente a arquitetura e os gates.
7. A configuração deve permanecer carregável por Node/CommonJS enquanto o comando CI usar o stack atual.
8. Não mascarar erro de carregamento do reporter para deixar o merge “verde”.
9. Alterações no array de reporters devem ser acompanhadas por prova automatizada do wiring, não apenas por ocorrência textual no workflow.
10. O SHA desta Bíblia só permanece válido enquanto o fonte for `59839922aca9f6f442100b3e6723313ef53d3a54`.

## 11. Lacunas de teste

### Lacuna 1 — export exato da config

**Comportamento:** exportar um objeto cuja propriedade `reporter` contém exatamente `['line']` e o caminho do gate reporter.

**Por que os testes atuais não provam:** o self-test importa o reporter diretamente, não esta config.

**Teste necessário:** teste Node que `require` a config, compare `Object.keys` e faça `deepStrictEqual` do array de reporters, normalizando somente o caminho absoluto esperado.

**Regressão que pode escapar:** typo no filename, remoção do reporter customizado, troca acidental por outro reporter ou chave extra.

### Lacuna 2 — integração real merge → reporter

**Comportamento:** `playwright merge-reports --config=...` carregar a config e executar o gate reporter contra blobs controlados.

**Por que os testes atuais não provam:** o workflow executa o comando real, mas não existe fixture/self-test focal do wiring.

**Teste necessário:** gerar ou manter blobs mínimos de teste, executar `merge-reports` com esta config e verificar exit status para cenário aprovado e cenário reprovado.

**Regressão que pode escapar:** mudanças de compatibilidade do Playwright que aceitem a config mas deixem de invocar o reporter como esperado.

### Lacuna 3 — allowlist estrutural

**Comportamento:** impedir qualquer configuração de execução adicional.

**Por que os testes atuais não provam:** o gate atual só procura sete nomes proibidos.

**Teste necessário:** importar/parsear o objeto e exigir allowlist de chaves compatível com merge, hoje somente `reporter`.

**Regressão que pode escapar:** inclusão de nova chave Playwright não coberta pela denylist.

### Lacuna 4 — reporter `line`

**Comportamento:** preservar saída textual humana junto do gate.

**Por que os testes atuais não provam:** não há assertion sobre o primeiro reporter.

**Teste necessário:** assertion direta sobre o export ou teste de merge capturando saída.

**Regressão que pode escapar:** pipeline continuar bloqueante, porém perder observabilidade textual útil no log de CI.

## 12. Fonte integral

```javascript
const path = require('path');

module.exports = {
    reporter: [
        ['line'],
        [path.join(__dirname, 'playwright-gate-reporter.js')],
    ],
};
```

## 13. Cobertura linha a linha

### Linha 1 — `const path = require('path');`

**O que faz:** carrega o módulo built-in `path` do Node e guarda sua API na constante local `path`.

**Como faz:** por ser CommonJS, a avaliação da config usa `require`. Não há pacote externo nem I/O; o módulo é fornecido pelo próprio Node. A única API utilizada depois é `path.join` na linha 6.

**Por que foi implementado dessa forma:** o caminho do reporter precisa ser montado de maneira portável entre Windows e Linux. O projeto executa localmente em Windows e em runners Linux de CI; `path.join` usa os separadores adequados ao sistema.

**Por que uma implementação ingênua seria pior:** concatenar `__dirname + '/playwright-gate-reporter.js'` tende a funcionar em muitos cenários, mas codifica separador e deixa a intenção de resolução filesystem menos explícita. Usar apenas `'./playwright-gate-reporter.js'` também dependeria mais da semântica de resolução do consumidor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta importação e para portabilidade do caminho; ela é exercida quando o merge real carrega a config.

### Linha 2 — linha vazia

**Fonte:** linha vazia entre a importação e o export.

**O que faz:** separa visualmente dependência e objeto de configuração; não altera runtime.

**Como faz:** o parser JavaScript ignora whitespace entre statements.

**Por que foi implementado dessa forma:** mantém a config curta legível e evidencia que há somente uma dependência antes do export.

**Por que uma implementação ingênua seria pior:** remover a linha não quebraria comportamento, mas compactaria desnecessariamente um arquivo cujo valor arquitetural é justamente deixar responsabilidades visíveis.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; whitespace não é requisito funcional.

### Linha 3 — `module.exports = {`

**O que faz:** inicia o objeto CommonJS exportado como configuração do merge.

**Como faz:** substitui `module.exports` pelo objeto literal que Playwright lê ao carregar o arquivo indicado em `--config`.

**Por que foi implementado dessa forma:** o repositório e os scripts Node atuais usam CommonJS; manter a config nesse formato evita criar uma fronteira ESM isolada apenas para um objeto pequeno.

**Por que uma implementação ingênua seria pior:** exportar uma segunda configuração completa copiando `playwright.config.js` duplicaria responsabilidade e permitiria drift entre execução e merge.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo comando real `playwright merge-reports --config=...`; não há assertion focal que importe este módulo e examine o export.

### Linha 4 — `    reporter: [`

**O que faz:** abre a lista de reporters que receberão os resultados reconstruídos dos blob reports.

**Como faz:** usa a chave Playwright `reporter` com formato de array de descrições. Cada item subsequente representa um reporter.

**Por que foi implementado dessa forma:** o merge precisa tanto de saída humana simples quanto do gate de política global. O array permite compor os dois sem duplicar lógica.

**Por que uma implementação ingênua seria pior:** usar só o reporter textual mostraria resultados, mas não aplicaria o gate customizado; usar só o customizado reduziria a saída padrão de diagnóstico.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor exportado. O gate estrutural protege contra chaves de execução, não contra remoção da chave `reporter`.

### Linha 5 — `        ['line'],`

**O que faz:** registra o reporter built-in `line` como primeiro reporter do merge.

**Como faz:** fornece a descrição em formato de array, compatível com lista de reporters Playwright.

**Por que foi implementado dessa forma:** o log agregado continua compacto e legível em CI ao mesmo tempo em que o reporter customizado aplica validações.

**Por que uma implementação ingênua seria pior:** depender somente do reporter customizado faria dele também responsável por toda apresentação padrão dos resultados, aumentando acoplamento e código próprio.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para presença ou ordem de `line`.

### Linha 6 — `        [path.join(__dirname, 'playwright-gate-reporter.js')],`

**O que faz:** registra o reporter customizado do Manga Translator como segundo reporter do merge.

**Como faz:** `__dirname` aponta para `scripts/ci`; `path.join` produz o caminho filesystem até `scripts/ci/playwright-gate-reporter.js`. O resultado é colocado no descriptor aceito por Playwright.

**Por que foi implementado dessa forma:** o gate precisa avaliar o conjunto agregado, não apenas cada shard isoladamente. Resolver pelo diretório da config torna a localização estável mesmo se o comando for iniciado da raiz ou de outro CWD.

**Por que uma implementação ingênua seria pior:** um path relativo ao CWD pode quebrar em invocações diferentes; omitir o reporter permitiria que skipped/flaky/status finais escapassem da validação global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do wiring desta linha. `playwright-gate-reporter-selftest.js` prova diretamente a lógica do módulo alvo, mas não importa esta config. A execução do merge em CI é 🟨 EXECUTADO INDIRETAMENTE.

### Linha 7 — `    ],`

**O que faz:** encerra o array de reporters.

**Como faz:** fecha a estrutura iniciada na linha 4 e mantém vírgula final válida em JavaScript.

**Por que foi implementado dessa forma:** delimita explicitamente a única lista funcional da config.

**Por que uma implementação ingênua seria pior:** não há alternativa semântica relevante; o risco real seria acrescentar itens sem testes e alterar comportamento do merge.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Playwright interpreta o objeto; não há assertion focal sobre cardinalidade do array.

### Linha 8 — `};`

**O que faz:** encerra o objeto e completa a atribuição a `module.exports`.

**Como faz:** fecha o literal iniciado na linha 3 e termina o statement com ponto e vírgula.

**Por que foi implementado dessa forma:** entrega ao consumidor um único objeto de configuração sem inicialização adicional.

**Por que uma implementação ingênua seria pior:** adicionar bootstrap, side effects ou I/O nesta fase faria uma config de dados assumir responsabilidades de runner/reporting, dificultando testes e podendo causar falhas antes do merge.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o CLI carrega o módulo; nenhuma assertion focal verifica a forma final do objeto.

### Linha 9 — newline final

**Fonte:** posição vazia após o `;` final causada pelo newline terminal do arquivo.

**O que faz:** preserva a terminação POSIX convencional do arquivo textual; não adiciona statement JavaScript.

**Como faz:** o blob termina em `\n`, por isso `source.split('\n')` possui nove posições documentais embora existam oito linhas textuais com conteúdo/whitespace.

**Por que foi implementado dessa forma:** evita diferenças artificiais em ferramentas de diff, concatenação e linters que esperam newline terminal.

**Por que uma implementação ingênua seria pior:** omitir essa posição na Bíblia faria a cobertura documental não corresponder exatamente ao algoritmo do gate estrutural, que conta `source.split('\n').length`.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO na auditoria estrutural das Bíblias: a validação exige nove headings sequenciais para as nove posições do fonte.

## 14. Conclusão técnica provisória

A responsabilidade do arquivo é pequena, mas crítica: ele reconecta o reporter de política ao resultado agregado depois do sharding. A arquitetura atual mantém boa separação entre execução (`playwright.config.js`) e merge (`playwright-merge.config.js`).

A principal lacuna não está na lógica do reporter, que possui self-test direto, e sim no wiring desta configuração. Um teste que importe a config e valide exatamente seu export reduziria o risco de uma alteração de poucas linhas desativar silenciosamente o gate agregado.

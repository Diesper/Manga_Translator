# Bíblia técnica — .gitignore

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `e48fc70b1acc14aabb245f0db1820bc6c7a2849e`  
> **Agente responsável pela auditoria:** Agente L  
> **Tipo:** configuração Git — exclusão de dependências, segredos e artefatos gerados  
> **Linhas textuais:** **37**  
> **Posições documentais:** **38**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

O `.gitignore` da raiz define a fronteira entre **fonte que deve participar do histórico Git** e **estado reproduzível/local**. Neste projeto ele cobre cinco classes concretas:

1. dependências instaladas por npm;
2. logs e dados de depuração;
3. resultados de Jest/Playwright/coverage e diagnósticos da CI;
4. ambiente/segredos e metadata de workstation/IDE;
5. staging de release e fixtures PNG materializadas.

Ele não executa em runtime da extensão e não afeta Manifest V3 diretamente. Seu efeito aparece quando Git decide quais arquivos não rastreados mostrar/adicionar. Por isso a evidência relevante é diferente de uma action JavaScript: produtores reais dos diretórios provam o **contrato operacional**, enquanto o gate estrutural prova especificamente a presença literal de quatro regras críticas.

## 2. Consumers/produtores cruzados

- `jest.config.js`: produz `.jest-cache`, `.jest-cache-coverage` e `coverage/`.
- `playwright.config.js`: produz `test-results/` e, em CI, usa reporter blob.
- `.github/workflows/ci.yml`: publica `test-results/`, `blob-report/`, `coverage/`, usa `all-blob-reports/` e artifacts sob `.ci-results/`.
- `scripts/ci/run-jest-ci.js` e diagnósticos: escrevem `.ci-results/`.
- `.github/workflows/publish.yml`: remove/recria `dist/`, copia a extensão, gera ZIP, documentação, checksums e release notes.
- `tests/setup/create-test-images.js`: materializa PNGs em `tests/fixtures/manga-images/` a partir da fonte `tests/fixtures/manga-images.js`.
- `scripts/validation/verify-repository-structure.js`: exige literalmente `.jest-cache*/`, `.ci-results/`, `all-blob-reports/` e `dist/`.

## 3. Segurança e privacidade

As regras `.env`, `.env.local` e `.env.*.local` são uma barreira contra **commit acidental** de configuração local/segredos. Elas não são mecanismo de segurança absoluto:

- arquivo já rastreado continua rastreado mesmo depois de entrar no `.gitignore`;
- `.env.production` sem sufixo `.local` não é coberto pelas regras atuais;
- segredos ainda precisam de gestão adequada no GitHub/CI e revisão antes de commit.

Logs e resultados de testes também podem carregar caminhos locais, URLs ou payloads; ignorá-los reduz exposição acidental, mas não sanitiza artifacts enviados conscientemente ao CI.

## 4. Análise crítica

1. **Cabeçalho editorial amplo demais:** o comentário “Sistema Operacional e Editores” permanece acima de `.jest-cache*/`, `.ci-results/`, `all-blob-reports/`, `dist/` e fixtures PNG. Essas cinco regras já pertencem a CI/build/fixtures, então o agrupamento é semanticamente impreciso.
2. **`.env.production` não é ignorado:** isso pode ser intencional para permitir configuração versionada. Se puder conter segredo, o padrão atual não o protege.
3. **`playwright-report/` não possui produtor explícito no config atual:** a configuração usa reporter blob no CI e reporter customizado local; a regra parece defensiva/compatível com reporter HTML convencional.
4. **`.nyc_output/` também parece defensivo/legado:** Jest usa provider V8 e `coverage/`; nenhuma referência produtora atual foi localizada.
5. **Pastas de IDE são ignoradas por inteiro:** isso evita preferências locais, mas também impede versionar deliberadamente tasks/settings úteis sem usar regra de negação.
6. **PNG de fixture é deliberadamente gerado:** o padrão evita binários derivados, mas também esconderia uma tentativa legítima de adicionar um PNG canônico nessa pasta. A arquitetura atual afirma que a fonte única é `manga-images.js`, portanto o tradeoff é coerente.

## 5. Evidência automatizada

| Regra/comportamento | Evidência conferida | Classificação |
|---|---|---|
| `.jest-cache*/` presente | gate percorre lista obrigatória e acusa ausência | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `.ci-results/` presente | mesmo gate; scripts CI produzem o diretório | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `all-blob-reports/` presente | mesmo gate; workflow agrega blobs ali | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `dist/` presente | mesmo gate; publish cria artifacts ali | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `test-results/` corresponde ao Playwright | `outputDir: './test-results'`; CI publica falhas | 🟨 CONTRATO OPERACIONAL, sem assertion do ignore |
| `blob-report/` corresponde ao reporter blob | config CI usa reporter blob e workflow publica a pasta | 🟨 CONTRATO OPERACIONAL |
| `coverage/` corresponde ao Jest | `coverageDirectory` e CI usam a pasta | 🟨 CONTRATO OPERACIONAL |
| PNGs de manga são gerados | script de setup materializa em `tests/fixtures/manga-images` | 🟨 CONTRATO OPERACIONAL |
| `.env*`, logs, OS/IDE e demais padrões realmente bloqueiam `git add` | nenhum teste focal com `git check-ignore` localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Lacunas de teste

1. Não há teste automatizado chamando `git check-ignore` para uma matriz representativa dos padrões.
2. O gate protege apenas quatro entradas críticas, não `node_modules/`, resultados Playwright/Jest comuns, `.env*`, logs, OS/IDE ou PNGs.
3. Não há teste negativo garantindo que arquivos **fonte** próximos continuem rastreáveis, como `tests/fixtures/manga-images.js`, `.env.example` ou arquivos normais em `dist` caso a política mude.
4. Não há teste de semântica dos wildcards `*.sw?`, `*.ntvs*`, `.jest-cache*/` e `tests/fixtures/manga-images/*.png`.
5. Não há auditoria automatizada de segredos provando que variantes de `.env` fora dos padrões atuais são intencionalmente permitidas.
6. `playwright-report/` e `.nyc_output/` não têm produtor atual explicitamente verificado no fluxo canônico, então podem ser regras defensivas ou resíduos históricos.

## 7. Invariantes

1. `node_modules/` deve permanecer fora do histórico enquanto dependências forem reconstruídas por npm.
2. Diretórios de resultados de teste/coverage não devem se tornar fonte canônica.
3. As quatro entradas exigidas por `verify-repository-structure.js` não podem ser removidas sem alterar conscientemente o contrato do gate.
4. `dist/` deve continuar sendo staging reproduzível, não fonte, enquanto o workflow de publicação o recriar.
5. PNGs de `tests/fixtures/manga-images/` não devem ser versionados enquanto `manga-images.js` permanecer a fonte única.
6. Regras de segredo precisam ser revisadas antes de permitir qualquer variante `.env` potencialmente sensível.
7. Adicionar um ignore amplo não pode ocultar arquivos canônicos necessários ao build/teste.
8. Alterações de wildcard devem considerar Windows/Linux/macOS e não apenas o caso local do autor.
9. Se configurações de IDE passarem a ser oficiais, regras de negação ou remoção dos ignores devem ser deliberadas e documentadas.
10. A Bíblia só permanece válida enquanto o SHA do `.gitignore` for `e48fc70b1acc14aabb245f0db1820bc6c7a2849e`.

## 8. Fonte integral

```gitignore
# Dependências
node_modules/

# Logs e arquivos de depuração
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Resultados e relatórios de testes
test-results/
playwright-report/
blob-report/
coverage/
.nyc_output/

# Arquivos de ambiente e segredos
.env
.env.local
.env.*.local

# Sistema Operacional e Editores
.DS_Store
Thumbs.db
desktop.ini
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
.jest-cache*/
.ci-results/
all-blob-reports/
dist/
tests/fixtures/manga-images/*.png
```

## 9. Cobertura linha a linha

### Linha 1 — regra/comentário Git

**Fonte:** ``# Dependências``

**O que faz:** Abre a seção de dependências do arquivo.

**Como faz:** Comentário humano; não cria regra de ignore.

**Por que foi implementado dessa forma:** Ajuda a distinguir dependências instaladas de artefatos de teste.

**Por que uma implementação ingênua seria pior:** Sem agrupamento, futuras edições têm maior chance de inserir padrões no bloco errado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: comentário editorial.

### Linha 2 — regra/comentário Git

**Fonte:** ``node_modules/``

**O que faz:** Ignora o diretório `node_modules/` em qualquer nível aplicável ao repositório.

**Como faz:** A barra final limita o padrão a diretórios chamados `node_modules`; Git não passa a considerar seus arquivos como candidatos rastreáveis não versionados.

**Por que foi implementado dessa forma:** Dependências npm são reproduzíveis por `package-lock.json`/`npm ci` e não devem inflar o histórico.

**Por que uma implementação ingênua seria pior:** Versionar dependências instaladas criaria milhares de arquivos, diferenças entre plataformas e conflito com o lockfile.

**Evidência automatizada:** 🟨 CONTRATO OPERACIONAL: `package.json`/scripts usam Node/npm; não há assertion focal de `git check-ignore` para esta linha.

### Linha 3 — regra/comentário Git

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Separa visualmente dependências do bloco de logs.

**Como faz:** Linha vazia sem efeito de matching.

**Por que foi implementado dessa forma:** Mantém o arquivo legível.

**Por que uma implementação ingênua seria pior:** Remover não quebra Git, mas reduz clareza editorial.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL.

### Linha 4 — regra/comentário Git

**Fonte:** ``# Logs e arquivos de depuração``

**O que faz:** Abre a seção de logs e arquivos de depuração.

**Como faz:** Comentário humano que contextualiza os quatro padrões seguintes.

**Por que foi implementado dessa forma:** Explica por que arquivos voláteis não pertencem ao histórico.

**Por que uma implementação ingênua seria pior:** Sem comentário, os padrões específicos de npm/yarn parecem arbitrários.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 5 — regra/comentário Git

**Fonte:** ``*.log``

**O que faz:** Ignora qualquer arquivo cujo nome termine em `.log`.

**Como faz:** O glob `*` aceita qualquer prefixo no mesmo componente de caminho antes de `.log`.

**Por que foi implementado dessa forma:** Logs variam por execução e podem conter caminhos, payloads ou erros locais.

**Por que uma implementação ingênua seria pior:** Versioná-los cria churn e pode expor informação operacional; ignorar apenas nomes conhecidos perderia logs de ferramentas novas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO de matching Git.

### Linha 6 — regra/comentário Git

**Fonte:** ``npm-debug.log*``

**O que faz:** Ignora `npm-debug.log` e variantes com sufixo.

**Como faz:** O `*` final também cobre nomes como `npm-debug.log.1`, que não seriam cobertos por `*.log`.

**Por que foi implementado dessa forma:** npm pode produzir debug logs em falhas; variantes devem permanecer locais.

**Por que uma implementação ingênua seria pior:** Confiar só em `*.log` deixaria variantes com texto após `.log` visíveis ao Git.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 7 — regra/comentário Git

**Fonte:** ``yarn-debug.log*``

**O que faz:** Ignora `yarn-debug.log` e variantes.

**Como faz:** O prefixo é específico do log de debug do Yarn e o `*` final cobre sufixos.

**Por que foi implementado dessa forma:** Mantém compatibilidade com ambientes que usem Yarn mesmo que npm seja a ferramenta canônica atual.

**Por que uma implementação ingênua seria pior:** Remover por ser ferramenta secundária pode reintroduzir lixo em máquinas de colaboradores.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 8 — regra/comentário Git

**Fonte:** ``yarn-error.log*``

**O que faz:** Ignora `yarn-error.log` e variantes.

**Como faz:** Mesmo mecanismo de glob da linha anterior, agora para logs de erro do Yarn.

**Por que foi implementado dessa forma:** Evita versionar diagnósticos locais de falhas de instalação/execução.

**Por que uma implementação ingênua seria pior:** Versionar erro local gera ruído e pode incluir caminhos específicos da máquina.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 9 — regra/comentário Git

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Separa logs de resultados de teste.

**Como faz:** Linha vazia, sem regra de ignore.

**Por que foi implementado dessa forma:** Cria fronteira visual entre classes de artefato.

**Por que uma implementação ingênua seria pior:** Sem separação, manutenção fica menos legível.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL.

### Linha 10 — regra/comentário Git

**Fonte:** ``# Resultados e relatórios de testes``

**O que faz:** Abre a seção de resultados e relatórios de testes.

**Como faz:** Comentário humano para artefatos produzidos por Playwright/Jest/cobertura.

**Por que foi implementado dessa forma:** Explicita que essas pastas são saídas reproduzíveis, não fontes.

**Por que uma implementação ingênua seria pior:** Sem a seção, diretórios gerados podem parecer fixtures que deveriam ser commitadas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 11 — regra/comentário Git

**Fonte:** ``test-results/``

**O que faz:** Ignora `test-results/`, diretório de artefatos brutos do Playwright.

**Como faz:** A barra final ignora a árvore; `playwright.config.js` define `outputDir: './test-results'`.

**Por que foi implementado dessa forma:** Screenshots, traces e falhas E2E são artefatos de execução e o CI os publica separadamente quando necessário.

**Por que uma implementação ingênua seria pior:** Versionar resultados faria cada execução alterar o working tree e duplicaria artifacts já gerenciados pelo CI.

**Evidência automatizada:** 🟨 CONTRATO CONFIGURADO: Playwright escreve nesse caminho e CI faz upload em falhas; não há gate específico desta entrada no `.gitignore`.

### Linha 12 — regra/comentário Git

**Fonte:** ``playwright-report/``

**O que faz:** Ignora `playwright-report/`, nome convencional do relatório HTML do Playwright.

**Como faz:** Regra de diretório previne rastreamento se um reporter HTML local for habilitado/rodado.

**Por que foi implementado dessa forma:** Protege o repositório contra relatório navegável gerado localmente.

**Por que uma implementação ingênua seria pior:** Sem a regra, uma execução com reporter HTML poderia produzir centenas de arquivos não versionados; atualmente o config não mostra reporter HTML explícito.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO e sem produtor explícito atual localizado; regra defensiva.

### Linha 13 — regra/comentário Git

**Fonte:** ``blob-report/``

**O que faz:** Ignora `blob-report/`, saída do reporter blob do Playwright.

**Como faz:** A regra cobre o diretório produzido pelo reporter `blob`; CI referencia `path: blob-report/`.

**Por que foi implementado dessa forma:** Shards E2E geram blobs temporários que são enviados como artifacts e combinados depois, não código-fonte.

**Por que uma implementação ingênua seria pior:** Versioná-los duplicaria ZIPs binários por execução e por SHA.

**Evidência automatizada:** 🟨 CONTRATO CONFIGURADO: `playwright.config.js` usa reporter blob no CI e `.github/workflows/ci.yml` publica `blob-report/`; sem assertion focal do ignore.

### Linha 14 — regra/comentário Git

**Fonte:** ``coverage/``

**O que faz:** Ignora `coverage/`, relatório produzido por Jest/V8.

**Como faz:** A regra de diretório cobre LCOV e demais formatos sob a pasta; `jest.config.js` define `coverageDirectory: '<rootDir>/coverage'`.

**Por que foi implementado dessa forma:** Cobertura é resultado derivado dos testes e o CI publica `coverage/` como artifact.

**Por que uma implementação ingênua seria pior:** Rastrear relatórios faria porcentagens e HTML gerados poluírem commits.

**Evidência automatizada:** 🟨 CONTRATO CONFIGURADO: Jest/CI usam exatamente `coverage/`; o ignore em si não recebe assertion focal.

### Linha 15 — regra/comentário Git

**Fonte:** ``.nyc_output/``

**O que faz:** Ignora `.nyc_output/`, diretório tradicional de dados intermediários NYC/Istanbul.

**Como faz:** A regra cobre a pasta oculta inteira.

**Por que foi implementado dessa forma:** Mantém compatibilidade defensiva com ferramentas de cobertura que geram fragmentos NYC, apesar de o projeto atual usar provider V8/Jest.

**Por que uma implementação ingênua seria pior:** Sem a regra, executar tooling alternativo de coverage pode sujar o working tree; por outro lado, é atualmente uma regra sem produtor confirmado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; produtor atual não localizado.

### Linha 16 — regra/comentário Git

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Separa artefatos de teste de arquivos de ambiente.

**Como faz:** Linha vazia sem efeito funcional.

**Por que foi implementado dessa forma:** Melhora leitura e revisão de regras sensíveis.

**Por que uma implementação ingênua seria pior:** Sem separação, regras de segredo podem se misturar a artefatos banais.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL.

### Linha 17 — regra/comentário Git

**Fonte:** ``# Arquivos de ambiente e segredos``

**O que faz:** Abre a seção de ambiente e segredos.

**Como faz:** Comentário associa os padrões `.env*` ao risco de credenciais/configuração local.

**Por que foi implementado dessa forma:** Torna explícita a intenção de segurança, não apenas limpeza.

**Por que uma implementação ingênua seria pior:** Sem esse contexto, alguém pode remover a regra pensando ser apenas conveniência local.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 18 — regra/comentário Git

**Fonte:** ``.env``

**O que faz:** Ignora exatamente arquivos chamados `.env`.

**Como faz:** Padrão sem wildcard cobre o nome base em diretórios onde o padrão se aplica.

**Por que foi implementado dessa forma:** `.env` frequentemente contém tokens, URLs privadas e overrides de máquina; não deve entrar por acidente.

**Por que uma implementação ingênua seria pior:** Versionar `.env` pode vazar segredo; usar `.env*` amplo demais também esconderia exemplos intencionais como `.env.example`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; proteção depende do Git respeitar este padrão.

### Linha 19 — regra/comentário Git

**Fonte:** ``.env.local``

**O que faz:** Ignora `.env.local`.

**Como faz:** Padrão explícito cobre o override local comum.

**Por que foi implementado dessa forma:** Distingue configuração pessoal de arquivos de exemplo/configuração versionável.

**Por que uma implementação ingênua seria pior:** Sem a regra, o override local pode ser adicionado acidentalmente mesmo que `.env` esteja ausente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 20 — regra/comentário Git

**Fonte:** ``.env.*.local``

**O que faz:** Ignora variantes `.env.<ambiente>.local`.

**Como faz:** Os `*` cobrem o nome do ambiente entre os pontos, por exemplo `.env.test.local`.

**Por que foi implementado dessa forma:** Permite manter arquivos locais por ambiente sem ocultar automaticamente todos os `.env.<ambiente>` que talvez sejam intencionalmente versionáveis.

**Por que uma implementação ingênua seria pior:** Usar `.env*` seria mais simples, mas poderia esconder templates; não cobrir variantes locais aumenta risco de segredo acidental.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO. Observação: `.env.production` sem `.local` não é coberto por esta regra.

### Linha 21 — regra/comentário Git

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Separa segredos de ruído de sistema/editor.

**Como faz:** Linha vazia sem matching.

**Por que foi implementado dessa forma:** Cria limite editorial antes de arquivos de máquina.

**Por que uma implementação ingênua seria pior:** Sem separação, revisão visual fica menos clara.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL.

### Linha 22 — regra/comentário Git

**Fonte:** ``# Sistema Operacional e Editores``

**O que faz:** Abre a seção de Sistema Operacional e Editores.

**Como faz:** Comentário descreve corretamente as regras imediatamente seguintes de macOS/Windows/IDE.

**Por que foi implementado dessa forma:** Agrupa ruído de workstation que não pertence ao produto.

**Por que uma implementação ingênua seria pior:** Sem categorização, colaboradores podem confundir metadata de IDE com configuração oficial.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO. O título fica desatualizado para as linhas 33–37, que já tratam CI/build/fixtures.

### Linha 23 — regra/comentário Git

**Fonte:** ``.DS_Store``

**O que faz:** Ignora `.DS_Store` do macOS.

**Como faz:** Nome exato elimina metadata criada pelo Finder.

**Por que foi implementado dessa forma:** Evita arquivos binários/metadados específicos de diretório no histórico.

**Por que uma implementação ingênua seria pior:** Versioná-lo cria diffs sem valor e dependentes do usuário.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 24 — regra/comentário Git

**Fonte:** ``Thumbs.db``

**O que faz:** Ignora `Thumbs.db` do Windows.

**Como faz:** Nome exato cobre o cache de miniaturas tradicional do Explorer.

**Por que foi implementado dessa forma:** Evita cache binário específico da máquina.

**Por que uma implementação ingênua seria pior:** Rastrear o cache adicionaria dados derivados e instáveis.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 25 — regra/comentário Git

**Fonte:** ``desktop.ini``

**O que faz:** Ignora `desktop.ini` do Windows.

**Como faz:** Nome exato cobre metadata de personalização do Explorer.

**Por que foi implementado dessa forma:** Mantém preferências de pasta fora do repositório.

**Por que uma implementação ingênua seria pior:** Versionar preferências locais cria ruído entre Windows e outros sistemas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 26 — regra/comentário Git

**Fonte:** ``.vscode/``

**O que faz:** Ignora `.vscode/`.

**Como faz:** Regra de diretório exclui configurações locais do VS Code.

**Por que foi implementado dessa forma:** O projeto evita impor preferências pessoais de editor por essa pasta.

**Por que uma implementação ingênua seria pior:** Rastrear toda `.vscode` pode misturar settings locais; a desvantagem é que também impede compartilhar tasks/extensions úteis sem negação explícita.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; política ampla de editor.

### Linha 27 — regra/comentário Git

**Fonte:** ``.idea/``

**O que faz:** Ignora `.idea/` de IDEs JetBrains.

**Como faz:** Regra de diretório exclui metadata do projeto gerada pela IDE.

**Por que foi implementado dessa forma:** Evita arquivos dependentes de versão/plugin/usuário.

**Por que uma implementação ingênua seria pior:** Versionar metadata automática gera conflitos; ignorar toda a pasta também impede compartilhar configurações JetBrains intencionais.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 28 — regra/comentário Git

**Fonte:** ``*.suo``

**O que faz:** Ignora arquivos Visual Studio `*.suo`.

**Como faz:** Wildcard cobre qualquer basename com extensão `.suo`.

**Por que foi implementado dessa forma:** `.suo` armazena opções de usuário, não configuração canônica do projeto.

**Por que uma implementação ingênua seria pior:** Versionar preferências de usuário cria diffs e pode carregar estado local.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 29 — regra/comentário Git

**Fonte:** ``*.ntvs*``

**O que faz:** Ignora padrões `*.ntvs*` associados a tooling Node/Visual Studio.

**Como faz:** Wildcards cobrem prefixo arbitrário e extensões/sufixos derivados de `ntvs`.

**Por que foi implementado dessa forma:** Previne metadata gerada por integrações antigas do Visual Studio.

**Por que uma implementação ingênua seria pior:** Sem a regra, ferramentas legadas podem produzir arquivos inesperados; é uma regra de compatibilidade, não uma dependência atual provada.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 30 — regra/comentário Git

**Fonte:** ``*.njsproj``

**O que faz:** Ignora arquivos `*.njsproj` do Node.js Tools for Visual Studio.

**Como faz:** Wildcard cobre qualquer projeto desse tipo.

**Por que foi implementado dessa forma:** Evita introduzir um formato de projeto IDE paralelo à configuração npm canônica.

**Por que uma implementação ingênua seria pior:** Versionar projeto de IDE específico poderia divergir de `package.json` e scripts reais.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 31 — regra/comentário Git

**Fonte:** ``*.sln``

**O que faz:** Ignora soluções Visual Studio `*.sln`.

**Como faz:** Wildcard cobre qualquer arquivo de solução.

**Por que foi implementado dessa forma:** Mantém a raiz centrada em Node/npm sem solução IDE canônica adicional.

**Por que uma implementação ingênua seria pior:** Uma `.sln` gerada localmente pode induzir fluxo paralelo e churn; se algum dia virar configuração oficial, esta regra precisará ser revista.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 32 — regra/comentário Git

**Fonte:** ``*.sw?``

**O que faz:** Ignora swap files com padrão `*.sw?`.

**Como faz:** `?` corresponde a um caractere, cobrindo extensões como `.swp` e `.swo`.

**Por que foi implementado dessa forma:** Editores como Vim criam arquivos temporários durante edição; eles não são fonte.

**Por que uma implementação ingênua seria pior:** Sem esse padrão, crashes/sessões locais podem deixar arquivos não rastreados; padrão mais amplo poderia esconder nomes legítimos indevidamente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 33 — regra/comentário Git

**Fonte:** ``.jest-cache*/``

**O que faz:** Ignora `.jest-cache*/`, cobrindo cache normal e cache de coverage.

**Como faz:** O `*` após `.jest-cache` cobre `.jest-cache` e `.jest-cache-coverage`; `jest.config.js` usa exatamente esses dois diretórios.

**Por que foi implementado dessa forma:** Cache de transformação/test discovery é derivado e pode variar por ambiente.

**Por que uma implementação ingênua seria pior:** Versionar cache torna commits enormes e obsoletos; listar só um dos dois deixaria o outro sujando a raiz.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-repository-structure.js` exige literalmente esta entrada; Jest configura os diretórios correspondentes.

### Linha 34 — regra/comentário Git

**Fonte:** ``.ci-results/``

**O que faz:** Ignora `.ci-results/`, área local de resultados/diagnósticos de runners CI.

**Como faz:** Regra de diretório cobre JSONs/logs agregados produzidos por `run-jest-ci.js` e scripts de diagnóstico.

**Por que foi implementado dessa forma:** Resultados são artefatos transitórios consumidos/publicados pelo CI, não fontes.

**Por que uma implementação ingênua seria pior:** Versionar diagnósticos criaria churn por execução e poderia incluir detalhes de ambiente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-repository-structure.js` exige esta entrada; runners e `verify-ci-contract.js` referenciam o mesmo caminho.

### Linha 35 — regra/comentário Git

**Fonte:** ``all-blob-reports/``

**O que faz:** Ignora `all-blob-reports/`, diretório usado para reunir artifacts blob de shards Playwright.

**Como faz:** A regra cobre o diretório de download/merge dos blobs.

**Por que foi implementado dessa forma:** O CI recria o conteúdo a partir de artifacts de cada shard; não deve persistir entre execuções.

**Por que uma implementação ingênua seria pior:** Versionar blobs agregados duplicaria outputs compactados e poderia fazer um run consumir resultado velho.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o gate exige esta entrada e `ci.yml` usa `all-blob-reports` na agregação.

### Linha 36 — regra/comentário Git

**Fonte:** ``dist/``

**O que faz:** Ignora `dist/`, staging de release.

**Como faz:** A regra exclui toda a árvore onde `publish.yml` copia a extensão, documentação, ZIP, checksums e release notes.

**Por que foi implementado dessa forma:** Artefatos publicados são reconstruídos deterministicamente no workflow e distribuídos via Release, não versionados como fonte.

**Por que uma implementação ingênua seria pior:** Versionar `dist` duplicaria a extensão e faria o repositório carregar outputs potencialmente stale; não ignorá-lo aumenta risco de commit acidental de binários.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o gate exige `dist/`; `publish.yml` recria e popula esse diretório.

### Linha 37 — regra/comentário Git

**Fonte:** ``tests/fixtures/manga-images/*.png``

**O que faz:** Ignora PNGs materializados em `tests/fixtures/manga-images/`, mas não o diretório nem a fonte geradora JS.

**Como faz:** O glob limita o ignore a arquivos `*.png` diretamente nessa pasta; `tests/setup/create-test-images.js` grava imagens derivadas ali a partir de `tests/fixtures/manga-images.js`.

**Por que foi implementado dessa forma:** A fonte única das fixtures permanece em código/texto enquanto binários reproduzíveis são gerados antes do E2E.

**Por que uma implementação ingênua seria pior:** Versionar PNGs gerados duplicaria a fonte e criaria divergência; ignorar a pasta inteira esconderia outros arquivos de fixture potencialmente intencionais.

**Evidência automatizada:** 🟨 CONTRATO OPERACIONAL: README e gerador confirmam materialização; não há assertion específica de `git check-ignore` para o padrão.

### Linha 38 — terminador final

**Fonte:** ``⏎ [newline final]``

**O que faz:** Representa o newline final do `.gitignore`.

**Como faz:** É o LF após a última regra e conta como posição documental separada pelo gate das Bíblias.

**Por que foi implementado dessa forma:** Mantém o arquivo texto terminado por newline e a auditoria posicional exata.

**Por que uma implementação ingênua seria pior:** Omiti-lo deixaria 37 headings para 38 posições esperadas na validação documental.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL: posição terminal confirmada por `source.endsWith('\n')`.

## 10. Autoauditoria

- SHA reconfirmado: `e48fc70b1acc14aabb245f0db1820bc6c7a2849e`.
- Reserva confirmada: `Agente L`.
- Fonte integral: 37 linhas textuais + LF final.
- Posições documentais: 38/38.
- Headings `Linha N`: 38/38 e sequenciais.
- Quatro gates estáticos obrigatórios foram lidos diretamente no verificador estrutural.
- Produtores Jest, Playwright, CI, publish e fixtures foram cruzados com seus arquivos reais.
- Regras sem assertion focal permanecem classificadas conservadoramente.
- Nenhuma alteração funcional foi feita no `.gitignore`.

**Estado documental desta materialização:** ✅ APROVADO em `AUDITORIA.md` para o SHA auditado; fonte integral, 38/38 posições e classificação conservadora entre gate/contrato/lacuna foram reconfirmadas.

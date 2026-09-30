# Bíblia técnica — .github/workflows/publish.yml

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** f673d445a3cc022d473f9b59ae1e0c8972ecd013  
> **Agente responsável pela auditoria:** AGENTE 2  
> **Tipo:** GitHub Actions workflow de publicação/release  
> **Linhas textuais:** **131**  
> **Posições documentais:** **132**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Identidade e papel arquitetural

.github/workflows/publish.yml transforma o estado versionado do repositório em uma GitHub Release distribuível do Manga Translator. Ele não participa do runtime Manifest V3; seu runtime é GitHub Actions em runner Linux. O workflow empacota extension/, publica a documentação canônica, gera checksums, escreve release notes e cria/atualiza a Release correspondente à versão de package.json.

A versão manual única vem de package.json#version. O workflow chama npm run version:check e depois scripts/release/sync-version.js --print-env, que deriva DISPLAY_VERSION, RELEASE_TAG, RELEASE_BASENAME e DOC_ARTIFACT. Manifest, nome do ZIP, tag, título e documento publicado ficam alinhados sem versão hardcoded no YAML.

## 2. Lifecycle completo

1. workflow_dispatch ou push de tag v* inicia o run.
2. Checkout completo traz histórico e tags; Node 20.x é configurado.
3. version:check bloqueia divergências.
4. --print-env grava metadados derivados em GITHUB_ENV.
5. Run disparado por tag exige GITHUB_REF_NAME igual a RELEASE_TAG.
6. dist é recriado do zero.
7. extension/ vira pasta versionada e ZIP.
8. docs/Documentação.md vira artifact versionado.
9. SHA256SUMS.txt cobre ZIP e documentação.
10. RELEASE_NOTES.md é produzido por heredoc.
11. gh escolhe editar Release existente, criar sobre tag existente ou criar tag/Release em GITHUB_SHA.

## 3. Dependências, consumidores e contratos

### Dependências diretas
- GitHub Actions e ubuntu-latest.
- actions/checkout@v4 e actions/setup-node@v4.
- Node.js 20.x.
- package.json, especialmente version:check e version.
- scripts/release/sync-version.js.
- extension/ e docs/Documentação.md.
- bash, rm, mkdir, cp, zip, sha256sum, git e gh.
- github.token exposto ao step como GH_TOKEN.

### Consumidores e efeitos
- GitHub Releases recebe título, notes, latest e três assets.
- Usuários baixam ZIP/docs e podem conferir SHA256SUMS.txt.
- scripts/validation/verify-publish-contract.js lê o YAML como texto e protege marcadores.
- tests/unit/background/version-sync.test.js lê o workflow e verifica paths/names derivados e ausência de hardcode versionado.
- .github/workflows/ci.yml executa npm run validate:publish.
- scripts/validation/verify-ci-contract.js exige que CI rode validate:publish e que package.json aponte para o verificador canônico.

## 4. Estado, dados e efeitos colaterais

O arquivo não usa chrome.storage, IndexedDB, tabs, service worker ou IPC. O estado relevante vive no workspace efêmero, em GITHUB_REF_TYPE/GITHUB_REF_NAME/GITHUB_SHA, em GITHUB_ENV e no estado remoto de tags/Releases.

Efeitos persistentes: criação de tag em um ramo, criação/edição de Release, alteração de latest e upload/substituição de assets. dist é efêmero.

## 5. Segurança e trust boundaries

- **github.token:** credencial efêmera com contents: write; não é impressa intencionalmente.
- **package.json#version:** entrada de commit, filtrada por parseNumericSemver para formato numérico e limites.
- **Tag/ref:** dados do evento GitHub. Tag runs são comparados a RELEASE_TAG; workflow_dispatch em branch pula essa checagem.
- **Artifacts:** vêm do checkout corrente, sem download de payload externo na montagem.
- **Actions:** checkout@v4/setup-node@v4 usam major tags mutáveis, não SHA imutável.
- **Checksums:** detectam alteração/corrupção, mas não fornecem autenticidade independente porque são publicados pelo mesmo token.

## 6. Análise crítica

### 6.1 Mismatch checkout manual ↔ Release/tag existente — risco alto
Em workflow_dispatch, a checagem das linhas 39-43 pode não rodar. Se RELEASE_TAG existir, o workflow pode montar artifacts do ref selecionado e editar/uploadar na Release existente sem provar que GITHUB_SHA corresponde ao commit da tag. Com --clobber, isso pode substituir assets corretos por bytes de outro commit.

**Correção/teste necessário:** resolver o commit de refs/tags/RELEASE_TAG e exigir igualdade com GITHUB_SHA antes de editar/uploadar quando a tag já existir.

### 6.2 Publicação não depende explicitamente do CI — risco alto
O push de tag pode publicar independentemente de ci.yml. version:check não executa suites unitárias, integração, smoke, visual ou E2E nem consulta checks obrigatórios do commit.

**Controle necessário:** dependência de workflow/check aprovado, environment protection ou verificação explícita dos checks antes da mutação da Release.

### 6.3 Ausência de concurrency por versão — risco médio
Dois runs para a mesma RELEASE_TAG podem competir; --clobber torna assets “último escritor vence”.

### 6.4 Runner/actions mutáveis — risco médio
ubuntu-latest e action major tags podem mudar; o workflow também pressupõe zip, sha256sum, git e gh disponíveis.

### 6.5 Release notes hardcoded
Os destaques não vêm de changelog nem são semanticamente verificados e podem ficar obsoletos.

### 6.6 --latest incondicional
Todos os ramos marcam a release como latest; se surgirem backports/prereleases, isso pode deixar de ser desejável.

## 7. Casos-limite

- Tag vfoo passa pelo filtro v* mas deve falhar na comparação com RELEASE_TAG.
- Versão não suportada falha antes via sync-version.
- Release existente → edit + upload --clobber.
- Tag existente sem Release → create --verify-tag.
- Tag ausente → create --target GITHUB_SHA.
- Falta de zip/sha256sum/gh/git quebra o step por set -e.
- Falha parcial após editar/criar pode deixar estado remoto parcialmente atualizado; não há rollback transacional.
- Unicode em DOC_ARTIFACT depende de filesystem/shell UTF-8.
- Cancelamento durante upload pode deixar conjunto parcial de assets.

## 8. Evidência automatizada

| Comportamento | Evidência real | Classificação |
|---|---|---|
| nome canônico | verify-publish-contract.js exige o literal | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workflow_dispatch | mesmo validator | 🟦 GATE ESTÁTICO ESPECÍFICO |
| tags v* | regex específica do validator | 🟦 GATE ESTÁTICO ESPECÍFICO |
| version:check | validator exige o comando, não a ordem | 🟦 GATE ESTÁTICO ESPECÍFICO |
| sync-version --print-env | validator + version-sync.test.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| nomes derivados sem hardcode | version-sync.test.js verifica variáveis e proíbe nomes versionados literais | ✅ PROVADO DIRETAMENTE sobre o texto do workflow |
| cp de extension/ | validator exige comando exato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| ZIP derivado | validator exige comando exato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| docs canônica | validator + version-sync.test.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| sha256sum | validator exige comando exato | 🟦 GATE ESTÁTICO ESPECÍFICO |
| caminhos legados ausentes | validator rejeita paths antigos | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI chama validate:publish | verify-ci-contract.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| condição de tag | nenhuma assertion específica | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| conteúdo real do ZIP | não executado/inspecionado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| hashes reais | não recalculados em teste | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| gh release view/edit/create/upload | não executado contra sandbox | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| consistência checkout↔tag em clobber | nenhuma proteção | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| permissões mínimas | nenhuma assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| commit publicado passou CI | vínculo inexistente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| concorrência entre runs | sem concurrency/teste | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Lacunas de teste

1. Parser/validação YAML real do publish.yml em CI.
2. Self-test negativo do verify-publish-contract.js para cada marcador.
3. Teste tag correta/tag divergente/ref branch.
4. Harness de montagem de dist e inspeção do ZIP.
5. Recalcular hashes e comparar SHA256SUMS.txt.
6. Testar os três ramos do gh release.
7. Provar GITHUB_SHA igual ao commit da tag antes de clobber.
8. Simular falha parcial de upload e recuperação.
9. Testar concorrência para mesma RELEASE_TAG.
10. Impedir publicação sem checks CI aprovados.
11. Validar permissions mínimas.
12. Proteger fetch-depth: 0.
13. Verificar Node/ferramentas do runner.
14. Detectar release notes obsoletas.
15. Exercitar Unicode em DOC_ARTIFACT.
16. Provar rerun idempotente apenas para o mesmo commit/tag.

## 10. Invariantes

1. package.json#version continua fonte manual única.
2. Tag run aborta se GITHUB_REF_NAME divergir de RELEASE_TAG.
3. ZIP contém exclusivamente extension/ do commit autorizado.
4. docs/Documentação.md continua origem da documentação publicada.
5. RELEASE_BASENAME e DOC_ARTIFACT vêm de sync-version.js.
6. dist começa limpo.
7. SHA256SUMS.txt cobre artifacts prometidos.
8. --clobber nunca deve substituir assets com bytes de commit diferente da tag.
9. Tag existente não deve ser movida implicitamente.
10. Tag nova por workflow_dispatch aponta explicitamente ao GITHUB_SHA pretendido.
11. Falhas não são mascaradas.
12. github.token não ganha permissões extras sem necessidade.
13. Commit publicado deve ter gates obrigatórios aprovados.
14. Runs da mesma RELEASE_TAG devem ser coordenados.
15. Workflow permanece válido em GitHub Actions/Linux.
16. Esta Bíblia só vale enquanto publish.yml tiver SHA f673d445a3cc022d473f9b59ae1e0c8972ecd013.

## 11. Fonte integral

~~~yaml
name: Publish Manga Translator

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  publish:
    name: GitHub Release
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x

      - name: Validar metadados de versão
        run: npm run version:check

      - name: Derivar metadados da release
        shell: bash
        run: node scripts/release/sync-version.js --print-env >> "$GITHUB_ENV"

      - name: Validar tag quando disparado por tag
        shell: bash
        run: |
          set -euo pipefail
          if [[ "${GITHUB_REF_TYPE}" == "tag" && "${GITHUB_REF_NAME}" != "${RELEASE_TAG}" ]]; then
            echo "Tag recebida: ${GITHUB_REF_NAME}"
            echo "Tag esperada pelo package.json: ${RELEASE_TAG}"
            exit 1
          fi

      - name: Montar artefatos
        shell: bash
        run: |
          set -euo pipefail
          rm -rf dist
          mkdir -p "dist/${RELEASE_BASENAME}"
          cp -R extension/. "dist/${RELEASE_BASENAME}/"

          (
            cd dist
            zip -qr "${RELEASE_BASENAME}.zip" "${RELEASE_BASENAME}"
          )

          cp "docs/Documentação.md" "dist/${DOC_ARTIFACT}"

          (
            cd dist
            sha256sum "${RELEASE_BASENAME}.zip" "${DOC_ARTIFACT}" > SHA256SUMS.txt
          )

          cat > dist/RELEASE_NOTES.md <<EOF
          # Manga Translator v${DISPLAY_VERSION}

          Release da extensão Chromium gerada a partir da versão canônica ${PACKAGE_VERSION}.

          ## Destaques

          - Service Worker Manifest V3 modularizado com estado durável, reconciliação e watchdog.
          - Persistência transacional de páginas e assets em IndexedDB.
          - Cache perceptual GTC com consultas correlacionadas.
          - Automação do Google Gemini isolada por job, com Observer V3 e ACK real.
          - Versionamento centralizado sem caminhos de release hardcoded.
          - Documentação técnica canônica mantida em docs/Documentação.md.

          ## Arquivos

          - ${RELEASE_BASENAME}.zip — extensão pronta para extrair e carregar sem compactação.
          - ${DOC_ARTIFACT} — documentação técnica correspondente à release.
          - SHA256SUMS.txt — checksums SHA-256 dos artefatos.

          ## Instalação

          1. Baixe ${RELEASE_BASENAME}.zip.
          2. Extraia o arquivo.
          3. Abra chrome://extensions ou edge://extensions.
          4. Ative o modo do desenvolvedor.
          5. Escolha Carregar sem compactação.
          6. Selecione a pasta ${RELEASE_BASENAME} extraída.
          EOF

      - name: Criar ou atualizar GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          set -euo pipefail

          if gh release view "${RELEASE_TAG}" >/dev/null 2>&1; then
            gh release edit "${RELEASE_TAG}" \
              --title "Manga Translator v${DISPLAY_VERSION}" \
              --notes-file dist/RELEASE_NOTES.md \
              --latest

            gh release upload "${RELEASE_TAG}" \
              "dist/${RELEASE_BASENAME}.zip" \
              "dist/${DOC_ARTIFACT}" \
              dist/SHA256SUMS.txt \
              --clobber
          elif git rev-parse "refs/tags/${RELEASE_TAG}" >/dev/null 2>&1; then
            gh release create "${RELEASE_TAG}" \
              "dist/${RELEASE_BASENAME}.zip" \
              "dist/${DOC_ARTIFACT}" \
              dist/SHA256SUMS.txt \
              --verify-tag \
              --title "Manga Translator v${DISPLAY_VERSION}" \
              --notes-file dist/RELEASE_NOTES.md \
              --latest
          else
            gh release create "${RELEASE_TAG}" \
              "dist/${RELEASE_BASENAME}.zip" \
              "dist/${DOC_ARTIFACT}" \
              dist/SHA256SUMS.txt \
              --target "${GITHUB_SHA}" \
              --title "Manga Translator v${DISPLAY_VERSION}" \
              --notes-file dist/RELEASE_NOTES.md \
              --latest
          fi
~~~

## 12. Cobertura documental por linhas

As faixas são contíguas e cobrem explicitamente 1–132; a posição 132 é o newline final.

### 1. Linhas 1-2 — Identidade do workflow

Fonte auditada:
~~~text
1: name: Publish Manga Translator
2: ␠ [linha vazia]
~~~

**O que faz:** Define o nome exibido no GitHub Actions como “Publish Manga Translator” e separa visualmente o cabeçalho do restante do YAML.

**Como faz:** O GitHub Actions lê name como metadado do workflow; a linha vazia não altera semântica.

**Por que foi implementado dessa forma:** O nome estável torna o pipeline de release identificável na UI e também é protegido pelo gate de publicação.

**Por que uma implementação ingênua seria pior:** Remover ou renomear sem atualizar gates/documentação pode quebrar a rastreabilidade operacional; compactar a linha vazia não muda runtime.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: verify-publish-contract.js exige literalmente name: Publish Manga Translator.

### 2. Linhas 3-8 — Gatilhos manual e por tag

Fonte auditada:
~~~text
3: on:
4:   workflow_dispatch:
5:   push:
6:     tags:
7:       - "v*"
8: ␠ [linha vazia]
~~~

**O que faz:** Declara workflow_dispatch e push de qualquer tag cujo nome comece por v.

**Como faz:** O bloco on combina um gatilho manual sem inputs e um filtro de tags v*. Branch pushes comuns não publicam.

**Por que foi implementado dessa forma:** Permite release explícita pela UI/API ou automática por tag, mantendo convenção simples.

**Por que uma implementação ingênua seria pior:** Disparar em todo push poderia publicar commits ordinários; aceitar qualquer tag sem validação aumentaria risco de release incompatível.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: verify-publish-contract.js exige workflow_dispatch e regex para tags v*.

### 3. Linhas 9-11 — Permissão de escrita em contents

Fonte auditada:
~~~text
9: permissions:
10:   contents: write
11: ␠ [linha vazia]
~~~

**O que faz:** Concede contents: write ao token automático do workflow, necessário para criar/editar Releases e anexar assets.

**Como faz:** A permissão é declarada no escopo do workflow e chega ao github.token usado posteriormente como GH_TOKEN.

**Por que foi implementado dessa forma:** O GitHub CLI precisa de escrita para mutar releases; explicitar permissions evita depender do default do repositório.

**Por que uma implementação ingênua seria pior:** Permissões adicionais ampliariam a superfície de dano; contents: read faria gh release falhar.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a política mínima de permissões.

### 4. Linhas 12-17 — Job único de publicação

Fonte auditada:
~~~text
12: jobs:
13:   publish:
14:     name: GitHub Release
15:     runs-on: ubuntu-latest
16: ␠ [linha vazia]
17:     steps:
~~~

**O que faz:** Cria o job publish, nomeia-o GitHub Release, escolhe ubuntu-latest e inicia os steps.

**Como faz:** Todo o pipeline roda em um runner Linux, em um único job sequencial.

**Por que foi implementado dessa forma:** Mantém checkout, artifacts e chamadas gh no mesmo filesystem/ambiente.

**Por que uma implementação ingênua seria pior:** Dividir sem transporte de artifacts perderia dist; ubuntu-latest é simples, mas mutável.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para runner/nome do job.

### 5. Linhas 18-22 — Checkout completo

Fonte auditada:
~~~text
18:       - name: Checkout
19:         uses: actions/checkout@v4
20:         with:
21:           fetch-depth: 0
22: ␠ [linha vazia]
~~~

**O que faz:** Faz checkout com actions/checkout@v4 e fetch-depth: 0.

**Como faz:** fetch-depth zero traz histórico e tags, permitindo git rev-parse refs/tags/RELEASE_TAG mais adiante.

**Por que foi implementado dessa forma:** A release precisa distinguir tag já existente de tag ainda inexistente.

**Por que uma implementação ingênua seria pior:** Checkout raso poderia ocultar tags e escolher ramo errado, inclusive criando tag no SHA atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o workflow roda; nenhum teste focal protege fetch-depth: 0.

### 6. Linhas 23-27 — Node.js 20

Fonte auditada:
~~~text
23:       - name: Configurar Node.js
24:         uses: actions/setup-node@v4
25:         with:
26:           node-version: 20.x
27: ␠ [linha vazia]
~~~

**O que faz:** Configura Node.js 20.x via actions/setup-node@v4.

**Como faz:** Os passos seguintes executam scripts Node do repositório; a versão é escolhida por linha 20.x.

**Por que foi implementado dessa forma:** Node 20 é compatível com engines >=18 e estabiliza o runtime de sync-version.js.

**Por que uma implementação ingênua seria pior:** Depender do Node do runner aumentaria deriva; pin de patch reduziria deriva, mas exigiria manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para node-version 20.x.

### 7. Linhas 28-30 — Validação da fonte canônica de versão

Fonte auditada:
~~~text
28:       - name: Validar metadados de versão
29:         run: npm run version:check
30: ␠ [linha vazia]
~~~

**O que faz:** Executa npm run version:check antes de montar artifacts.

**Como faz:** package.json mapeia version:check para sync-version.js --check, que compara package, Manifest, lockfile e pré-requisitos.

**Por que foi implementado dessa forma:** Impede publicar metadados de versão fora de sincronia.

**Por que uma implementação ingênua seria pior:** Pular o check permitiria release cujo nome/tag divergisse do Manifest ou lockfile.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para o comando; ✅ PROVADO DIRETAMENTE para deriveVersionInfo em version-sync.test.js.

### 8. Linhas 31-34 — Derivação de variáveis da release

Fonte auditada:
~~~text
31:       - name: Derivar metadados da release
32:         shell: bash
33:         run: node scripts/release/sync-version.js --print-env >> "$GITHUB_ENV"
34: ␠ [linha vazia]
~~~

**O que faz:** Executa sync-version.js --print-env e acrescenta a saída a GITHUB_ENV.

**Como faz:** O script deriva PACKAGE_VERSION, MANIFEST_VERSION, DISPLAY_VERSION, RELEASE_TAG, RELEASE_BASENAME e DOC_ARTIFACT de package.json#version.

**Por que foi implementado dessa forma:** Centraliza nomes e tag em uma única fonte.

**Por que uma implementação ingênua seria pior:** Hardcodes de versão em YAML causariam drift a cada release.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO e teste direto de deriveVersionInfo; GITHUB_ENV em si não é exercitado pelo Jest.

### 9. Linhas 35-44 — Validação de tag disparadora

Fonte auditada:
~~~text
35:       - name: Validar tag quando disparado por tag
36:         shell: bash
37:         run: |
38:           set -euo pipefail
39:           if [[ "${GITHUB_REF_TYPE}" == "tag" && "${GITHUB_REF_NAME}" != "${RELEASE_TAG}" ]]; then
40:             echo "Tag recebida: ${GITHUB_REF_NAME}"
41:             echo "Tag esperada pelo package.json: ${RELEASE_TAG}"
42:             exit 1
43:           fi
44: ␠ [linha vazia]
~~~

**O que faz:** Quando o ref atual é tag, compara GITHUB_REF_NAME com RELEASE_TAG e aborta se diferentes.

**Como faz:** set -euo pipefail torna erro/variável ausente/pipeline falho bloqueantes; a condição só vale para ref_type tag.

**Por que foi implementado dessa forma:** Evita que uma tag vX inconsistente com package.json publique sob outra versão.

**Por que uma implementação ingênua seria pior:** Sem a comparação, qualquer tag v* poderia acionar conteúdo/nome derivados de outra versão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a condição e exit 1.

### 10. Linhas 45-52 — Preparação limpa de dist

Fonte auditada:
~~~text
45:       - name: Montar artefatos
46:         shell: bash
47:         run: |
48:           set -euo pipefail
49:           rm -rf dist
50:           mkdir -p "dist/${RELEASE_BASENAME}"
51:           cp -R extension/. "dist/${RELEASE_BASENAME}/"
52: ␠ [linha vazia]
~~~

**O que faz:** Ativa shell estrito, remove dist, cria dist/RELEASE_BASENAME e copia extension/. integralmente.

**Como faz:** rm -rf limpa workspace efêmero; mkdir -p cria destino; cp -R extension/. copia conteúdo inclusive entradas ocultas.

**Por que foi implementado dessa forma:** Reconstrói artifact do zero e usa a árvore real da extensão.

**Por que uma implementação ingênua seria pior:** Reusar dist poderia misturar versões; copiar lista manual poderia omitir novos arquivos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para cp -R extension/. e basename derivado.

### 11. Linhas 53-57 — Compactação da extensão

Fonte auditada:
~~~text
53:           (
54:             cd dist
55:             zip -qr "${RELEASE_BASENAME}.zip" "${RELEASE_BASENAME}"
56:           )
57: ␠ [linha vazia]
~~~

**O que faz:** Entra em dist em subshell e cria ZIP recursivo RELEASE_BASENAME.zip contendo a pasta versionada.

**Como faz:** O subshell limita cd; zip -q reduz ruído e -r percorre a pasta.

**Por que foi implementado dessa forma:** Mantém caminhos posteriores estáveis e produz um pacote extraível.

**Por que uma implementação ingênua seria pior:** cd global poderia afetar passos seguintes; zipar diretório errado alteraria estrutura do artifact.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para o comando zip; conteúdo real do ZIP não é testado.

### 12. Linhas 58-64 — Documentação e checksums

Fonte auditada:
~~~text
58:           cp "docs/Documentação.md" "dist/${DOC_ARTIFACT}"
59: ␠ [linha vazia]
60:           (
61:             cd dist
62:             sha256sum "${RELEASE_BASENAME}.zip" "${DOC_ARTIFACT}" > SHA256SUMS.txt
63:           )
64: ␠ [linha vazia]
~~~

**O que faz:** Copia docs/Documentação.md para nome DOC_ARTIFACT e gera SHA256SUMS.txt para ZIP e documentação.

**Como faz:** Executa cp e depois sha256sum dentro de dist, produzindo nomes relativos.

**Por que foi implementado dessa forma:** Publica documentação correspondente e verificação de integridade dos dois artifacts.

**Por que uma implementação ingênua seria pior:** Paths absolutos piorariam portabilidade; omitir hash removeria detecção de corrupção.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para cp e sha256sum; hashes não são recalculados em teste.

### 13. Linhas 65-69 — Início das release notes

Fonte auditada:
~~~text
65:           cat > dist/RELEASE_NOTES.md <<EOF
66:           # Manga Translator v${DISPLAY_VERSION}
67: ␠ [linha vazia]
68:           Release da extensão Chromium gerada a partir da versão canônica ${PACKAGE_VERSION}.
69: ␠ [linha vazia]
~~~

**O que faz:** Cria dist/RELEASE_NOTES.md por heredoc com título dinâmico e versão canônica.

**Como faz:** EOF não é quoted, então variáveis do ambiente são expandidas pelo bash.

**Por que foi implementado dessa forma:** Reutiliza metadados derivados e evita título manual divergente.

**Por que uma implementação ingênua seria pior:** Hardcode de versão ficaria obsoleto; dados shell não validados poderiam ser perigosos, mas a versão deriva de parser numérico.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para o heredoc.

### 14. Linhas 70-78 — Destaques hardcoded

Fonte auditada:
~~~text
70:           ## Destaques
71: ␠ [linha vazia]
72:           - Service Worker Manifest V3 modularizado com estado durável, reconciliação e watchdog.
73:           - Persistência transacional de páginas e assets em IndexedDB.
74:           - Cache perceptual GTC com consultas correlacionadas.
75:           - Automação do Google Gemini isolada por job, com Observer V3 e ACK real.
76:           - Versionamento centralizado sem caminhos de release hardcoded.
77:           - Documentação técnica canônica mantida em docs/Documentação.md.
78: ␠ [linha vazia]
~~~

**O que faz:** Escreve a seção Destaques com características arquiteturais e referência à documentação.

**Como faz:** São linhas estáticas incorporadas ao workflow, não changelog gerado.

**Por que foi implementado dessa forma:** Fornece contexto humano imediato da release.

**Por que uma implementação ingênua seria pior:** Texto fixo pode ficar desatualizado após mudanças arquiteturais.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para veracidade/atualização dos destaques.

### 15. Linhas 79-84 — Lista dos assets

Fonte auditada:
~~~text
79:           ## Arquivos
80: ␠ [linha vazia]
81:           - ${RELEASE_BASENAME}.zip — extensão pronta para extrair e carregar sem compactação.
82:           - ${DOC_ARTIFACT} — documentação técnica correspondente à release.
83:           - SHA256SUMS.txt — checksums SHA-256 dos artefatos.
84: ␠ [linha vazia]
~~~

**O que faz:** Descreve ZIP, documento e SHA256SUMS.txt nas release notes.

**Como faz:** Os dois nomes versionados usam variáveis derivadas; checksum tem nome fixo.

**Por que foi implementado dessa forma:** Explica ao usuário a finalidade dos assets.

**Por que uma implementação ingênua seria pior:** Hardcode versionado quebraria sincronização; ausência de descrição reduz usabilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: nomes coincidem com montagem/upload, sem assertion dessas linhas.

### 16. Linhas 85-94 — Instalação e fim do heredoc

Fonte auditada:
~~~text
85:           ## Instalação
86: ␠ [linha vazia]
87:           1. Baixe ${RELEASE_BASENAME}.zip.
88:           2. Extraia o arquivo.
89:           3. Abra chrome://extensions ou edge://extensions.
90:           4. Ative o modo do desenvolvedor.
91:           5. Escolha Carregar sem compactação.
92:           6. Selecione a pasta ${RELEASE_BASENAME} extraída.
93:           EOF
94: ␠ [linha vazia]
~~~

**O que faz:** Escreve seis passos de instalação Chrome/Edge e fecha EOF.

**Como faz:** O basename derivado nomeia a pasta; chrome://extensions e edge://extensions são apenas texto das notes.

**Por que foi implementado dessa forma:** Entrega instruções junto da Release.

**Por que uma implementação ingênua seria pior:** Instruções podem ficar obsoletas; esquecer EOF quebraria o script shell.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### 17. Linhas 95-101 — Token e shell de mutação

Fonte auditada:
~~~text
95:       - name: Criar ou atualizar GitHub Release
96:         env:
97:           GH_TOKEN: ${{ github.token }}
98:         shell: bash
99:         run: |
100:           set -euo pipefail
101: ␠ [linha vazia]
~~~

**O que faz:** Inicia o step que cria/atualiza Release, injeta github.token como GH_TOKEN, usa bash e set -euo pipefail.

**Como faz:** gh detecta GH_TOKEN; contents: write autoriza as mutações.

**Por que foi implementado dessa forma:** Evita PAT persistente e torna falhas bloqueantes.

**Por que uma implementação ingênua seria pior:** PAT de longa duração aumentaria risco; shell permissivo poderia esconder erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para autenticação real.

### 18. Linhas 102-102 — Detecção de Release existente

Fonte auditada:
~~~text
102:           if gh release view "${RELEASE_TAG}" >/dev/null 2>&1; then
~~~

**O que faz:** Consulta gh release view RELEASE_TAG e usa o exit status para decidir se a Release já existe.

**Como faz:** Saída é descartada; sucesso entra no primeiro ramo.

**Por que foi implementado dessa forma:** Permite rerun sem falhar por Release duplicada.

**Por que uma implementação ingênua seria pior:** Não verificar o commit da tag permite que um run manual de outro ref substitua artifacts de release existente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; risco alto de mismatch checkout↔tag em workflow_dispatch.

### 19. Linhas 103-107 — Edição da Release existente

Fonte auditada:
~~~text
103:             gh release edit "${RELEASE_TAG}" \
104:               --title "Manga Translator v${DISPLAY_VERSION}" \
105:               --notes-file dist/RELEASE_NOTES.md \
106:               --latest
107: ␠ [linha vazia]
~~~

**O que faz:** Atualiza título, notes e marca a Release como latest.

**Como faz:** gh release edit opera em RELEASE_TAG e lê dist/RELEASE_NOTES.md.

**Por que foi implementado dessa forma:** Reruns podem corrigir metadados sem criar nova Release.

**Por que uma implementação ingênua seria pior:** Editar sem validar checkout↔tag pode associar notes de outro commit à tag existente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### 20. Linhas 108-112 — Substituição de assets

Fonte auditada:
~~~text
108:             gh release upload "${RELEASE_TAG}" \
109:               "dist/${RELEASE_BASENAME}.zip" \
110:               "dist/${DOC_ARTIFACT}" \
111:               dist/SHA256SUMS.txt \
112:               --clobber
~~~

**O que faz:** Faz upload de ZIP, docs e checksum com --clobber.

**Como faz:** --clobber substitui assets de mesmo nome.

**Por que foi implementado dessa forma:** Permite reparar artifacts em rerun.

**Por que uma implementação ingênua seria pior:** Sem checagem de commit, clobber pode substituir artifacts legítimos por bytes de outro ref.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; mutação destrutiva depende só de permissões/contexto.

### 21. Linhas 113-114 — Tag Git existente sem Release

Fonte auditada:
~~~text
113:           elif git rev-parse "refs/tags/${RELEASE_TAG}" >/dev/null 2>&1; then
114:             gh release create "${RELEASE_TAG}" \
~~~

**O que faz:** Se a Release não existe, verifica refs/tags/RELEASE_TAG e inicia criação se a tag existir.

**Como faz:** git rev-parse depende do checkout completo para localizar a tag.

**Por que foi implementado dessa forma:** Preserva tag previamente criada e cria a Release sobre ela.

**Por que uma implementação ingênua seria pior:** Checkout raso poderia falhar e levar ao ramo que cria tag no SHA atual.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resolução real da tag.

### 22. Linhas 115-121 — Criação para tag existente

Fonte auditada:
~~~text
115:               "dist/${RELEASE_BASENAME}.zip" \
116:               "dist/${DOC_ARTIFACT}" \
117:               dist/SHA256SUMS.txt \
118:               --verify-tag \
119:               --title "Manga Translator v${DISPLAY_VERSION}" \
120:               --notes-file dist/RELEASE_NOTES.md \
121:               --latest
~~~

**O que faz:** Anexa os três assets, exige --verify-tag, define título/notas e --latest.

**Como faz:** gh release create valida existência remota da tag informada.

**Por que foi implementado dessa forma:** Evita criação implícita de tag quando o fluxo acredita que ela já existe.

**Por que uma implementação ingênua seria pior:** Mesmo com verify-tag, artifacts vêm do checkout corrente e não são comparados ao commit da tag.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para gh release create ou igualdade checkout↔tag.

### 23. Linhas 122-130 — Criação de tag/Release no SHA atual

Fonte auditada:
~~~text
122:           else
123:             gh release create "${RELEASE_TAG}" \
124:               "dist/${RELEASE_BASENAME}.zip" \
125:               "dist/${DOC_ARTIFACT}" \
126:               dist/SHA256SUMS.txt \
127:               --target "${GITHUB_SHA}" \
128:               --title "Manga Translator v${DISPLAY_VERSION}" \
129:               --notes-file dist/RELEASE_NOTES.md \
130:               --latest
~~~

**O que faz:** Quando não há Release nem tag, cria Release com --target GITHUB_SHA, anexando assets, título/notas e --latest.

**Como faz:** gh release create pode criar a tag apontando explicitamente para o commit atual.

**Por que foi implementado dessa forma:** Suporta workflow_dispatch antes da criação manual da tag e evita target implícito.

**Por que uma implementação ingênua seria pior:** Qualquer ref manual com versão válida pode inaugurar a tag/release sem aprovação adicional.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para --target ou autorização do ref manual.

### 24. Linhas 131-132 — Fechamento e newline final

Fonte auditada:
~~~text
131:           fi
132: ␠ [linha vazia]
~~~

**O que faz:** Fecha o if/elif/else do script e preserva o newline final.

**Como faz:** fi encerra seleção exclusiva entre editar, criar sobre tag existente ou criar tag no SHA atual; posição 132 é newline terminal.

**Por que foi implementado dessa forma:** Mantém sintaxe shell válida e convenção editorial.

**Por que uma implementação ingênua seria pior:** Bloco mal fechado quebra o step; newline ausente afeta principalmente diffs/ferramentas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando GitHub interpreta o run; não há parser shell/YAML focal.


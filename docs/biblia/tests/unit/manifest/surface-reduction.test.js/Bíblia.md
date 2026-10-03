# Bíblia técnica — tests/unit/manifest/surface-reduction.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `d5bde042b414dc6369a105615ff8b838bdbc503b`  
> **Agente responsável:** AGENTE 1  
> **Tipo:** teste Jest de redução de superfície do Manifest V3  
> **Linhas textuais:** 24  
> **Posições documentais:** 25, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este teste protege duas propriedades do `extension/manifest.json`:

1. três recursos internos historicamente sensíveis não podem aparecer em `web_accessible_resources`;
2. `host_permissions` deve ser exatamente `['<all_urls>']`, sem uma entrada Gemini redundante além da permissão global.

O arquivo não carrega a extensão no navegador. Ele lê e parseia o Manifest real do repositório e faz assertions sobre sua estrutura JSON.

## 2. Dependências e entrada no Jest

Dependências:

- `fs` para ler o Manifest;
- `path` para resolver o caminho real;
- globals Jest `describe`, `test`, `expect`.

`jest.config.js:49-51` define o projeto `manifest` e inclui `tests/unit/manifest/**/*.test.js`.

O teste foi executado no CI real do mesmo blob, portanto não é apenas um arquivo órfão no repositório.

## 3. Fixture real: Manifest

O teste lê:

`extension/manifest.json`

por `path.resolve(__dirname, '../../../extension/manifest.json')`.

No snapshot auditado:

- `manifest_version = 3`;
- `host_permissions = ['<all_urls>']`;
- não existe propriedade `web_accessible_resources`;
- `content/inject.js` é injetado como content script `world: MAIN` apenas nos matches Gemini/localhost, mas não é web-accessible;
- o reader é acessado internamente, não exposto via `web_accessible_resources`.

É importante separar esses conceitos: **content script declarado** não é sinônimo de **web accessible resource**.

## 4. Primeiro contrato — recursos não expostos

O teste calcula:

```js
const exposedResources = (manifest.web_accessible_resources || [])
    .flatMap((entry) => entry.resources || []);
```

Se a propriedade não existir, a lista é `[]`.

Depois exige que a lista não contenha:

- `content/inject.js`;
- `reader/reader.html`;
- `reader/reader.js`.

No Manifest atual, como `web_accessible_resources` está ausente, a assertion passa de forma legítima: nenhum desses caminhos está exposto por esse mecanismo.

A normalização com `entry.resources || []` também evita erro caso exista uma entrada sem `resources`.

## 5. Segundo contrato — host permissions

A linha 22 exige igualdade estrutural exata:

```js
expect(manifest.host_permissions).toEqual(['<all_urls>']);
```

Isso é mais forte do que `toContain('<all_urls>')`.

A assertion falha se:

- a permissão global desaparecer;
- houver permissão adicional;
- surgir uma entrada explícita redundante para Gemini;
- a ordem/estrutura deixar de ser exatamente o array unitário esperado.

## 6. Evidência automatizada

O blob deste teste é o mesmo existente no commit do workflow bem-sucedido **MangaTranslator CI #36577447500**.

No job **Unit + Integration (20.x)**, ID `109437162616`, o log contém:

`PASS manifest tests/unit/manifest/surface-reduction.test.js`

O job terminou com:

- 109 suítes aprovadas;
- 851 testes aprovados.

### Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| Manifest real é JSON parseável | avaliação do arquivo durante suíte PASS | ✅ PROVADO DIRETAMENTE |
| `content/inject.js` não está em WAR | assertion linhas 14–18, suíte PASS | ✅ PROVADO DIRETAMENTE |
| `reader/reader.html` não está em WAR | mesma assertion | ✅ PROVADO DIRETAMENTE |
| `reader/reader.js` não está em WAR | mesma assertion | ✅ PROVADO DIRETAMENTE |
| `host_permissions` é exatamente `['<all_urls>']` | linha 22, suíte PASS | ✅ PROVADO DIRETAMENTE |
| nenhum outro recurso interno pode ser exposto no futuro | não existe allowlist/asserção global | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| nenhuma WAR pode existir | não é o contrato atual; `|| []` aceita ausência ou lista permitida | ⚠️ NÃO PROVADO/ NÃO EXIGIDO |

## 7. Solicitação ao auditor

### 216-001 — TEST_REQUIRED — OPEN

**Encontrado:** o teste de “surface reduction” protege somente três caminhos específicos dentro de `web_accessible_resources`.

**Arquivo auditado:** `tests/unit/manifest/surface-reduction.test.js`.

**Arquivo relacionado:** `extension/manifest.json`.

**Evidência atual:** o Manifest atual não possui `web_accessible_resources`, e o teste prova diretamente que os três caminhos listados não estão expostos.

**Evidência ausente:** uma regra global ou allowlist que impeça a exposição futura de outros recursos internos, por exemplo outros scripts de `content/`, `shared/` ou páginas internas.

**Por que a evidência atual é insuficiente:** adicionar um quarto recurso interno a `web_accessible_resources` não listado no array de denylist manteria esta suíte verde.

**Ação solicitada:** auditor deve confirmar a política desejada. Se a intenção for “nenhum recurso interno é web-accessible salvo exceções explícitas”, substituir/complementar a denylist com assertion de ausência/allowlist controlada em alteração de teste separada.

**Evidência esperada:** regressão que falhe para qualquer recurso interno não aprovado, sem bloquear recursos legitimamente necessários caso existam no futuro.

**Possível regressão:** expansão acidental da superfície pública da extensão sem falha deste teste.

**Severidade:** NORMAL.

## 8. Fonte integral auditada

```js
const fs = require('fs');
const path = require('path');

describe('manifest surface reduction', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.resolve(__dirname, '../../../extension/manifest.json'),
        'utf8'
    ));

    test('does not expose static content scripts or the internal reader to web pages', () => {
        const exposedResources = (manifest.web_accessible_resources || [])
            .flatMap((entry) => entry.resources || []);

        expect(exposedResources).not.toEqual(expect.arrayContaining([
            'content/inject.js',
            'reader/reader.html',
            'reader/reader.js',
        ]));
    });

    test('uses the all-URLs host permission without a redundant Gemini entry', () => {
        expect(manifest.host_permissions).toEqual(['<all_urls>']);
    });
});
```

## 9. Mapa linha por linha

| Linha | Papel | Evidência |
|---:|---|---|
| 1 | importa `fs` | ✅ executado |
| 2 | importa `path` | ✅ executado |
| 3 | separador | estrutural |
| 4 | abre suíte | ✅ executado |
| 5 | inicia leitura/parse do Manifest | ✅ executado |
| 6 | resolve caminho real do Manifest | ✅ executado |
| 7 | define UTF-8 | ✅ executado |
| 8 | fecha parse/read | ✅ JSON real parseado |
| 9 | separador | estrutural |
| 10 | abre teste de exposição | ✅ executado |
| 11 | lê WAR ou usa array vazio | ✅ executado |
| 12 | achata `resources` das entradas | ✅ executado |
| 13 | separador | estrutural |
| 14 | inicia assertion de não contenção | ✅ PROVADO DIRETAMENTE |
| 15 | denylist: `content/inject.js` | ✅ PROVADO DIRETAMENTE |
| 16 | denylist: `reader/reader.html` | ✅ PROVADO DIRETAMENTE |
| 17 | denylist: `reader/reader.js` | ✅ PROVADO DIRETAMENTE |
| 18 | fecha arrayContaining/assertion | ✅ PROVADO DIRETAMENTE |
| 19 | fecha primeiro teste | estrutural |
| 20 | separador | estrutural |
| 21 | abre teste de host permissions | ✅ executado |
| 22 | exige array unitário `<all_urls>` | ✅ PROVADO DIRETAMENTE |
| 23 | fecha segundo teste | estrutural |
| 24 | fecha suíte | estrutural |
| 25 | newline final | 🟦 verificado no blob |

## 10. Unidades semânticas

### U01 — linhas 1–8 — carregamento da configuração real

O teste não duplica um Manifest em fixture; usa o arquivo de produção. Isso é superior a um mock porque mudanças reais entram automaticamente na prova.

### U02 — linhas 10–19 — redução de WAR

Transforma a estrutura aninhada de WAR em lista plana e aplica uma denylist focal. O fallback `|| []` torna a ausência total de WAR um estado válido.

Limite: a denylist não é uma política completa de allowlist; isso fundamenta 216-001.

### U03 — linhas 21–23 — host permission canônica

A igualdade exata impede permissões redundantes. Usar apenas `toContain` seria mais fraco e deixaria extras passarem.

### U04 — posição 25 — newline

O blob termina com `\n`; há 24 linhas textuais e 25 posições documentais.

## 11. Relação com segurança/superfície

O teste reduz superfícies declarativas do Manifest, mas não é uma auditoria de segurança completa.

Ele não prova:

- que content scripts não possam comunicar dados;
- que permissões sejam mínimas além do array testado;
- que CSP esteja correta;
- que mensagens runtime sejam autenticadas;
- que páginas internas não sejam abertas por outros mecanismos.

Seu escopo documental deve permanecer limitado às duas assertions realmente existentes.

## 12. Autoauditoria do AGENTE 1

- [x] ownership exclusivo confirmado;
- [x] SHA do teste reconfirmado;
- [x] Manifest real investigado;
- [x] execução CI do mesmo blob localizada;
- [x] assertions diretas separadas de garantias mais amplas;
- [x] 24 linhas textuais + newline = 25 posições;
- [x] lacuna de denylist registrada como solicitação externa;
- [x] nenhum teste/Manifest foi alterado para fabricar prova.

**Resultado:** Bíblia concluída para `d5bde042b414dc6369a105615ff8b838bdbc503b`; 216-001 permanece OPEN.

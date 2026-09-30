# Bíblia técnica — tests/unit/content-manga/get-clean-url.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `a04fe1e3552d5b61a91442496a1294e6d8379fbf`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte Jest de normalização de URL baseada em implementação espelho local  
> **Linhas textuais:** **158**  
> **Posições documentais:** **159**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Esta suíte documenta e testa uma versão local de `getCleanUrl()`, função usada conceitualmente para transformar URLs instáveis de imagens em chaves comparáveis. O foco histórico é remover query/hash de CDNs para que tokens rotativos não criem uma identidade nova após F5.

O arquivo, porém, **não importa nem executa o `getCleanUrl` de produção**. Linhas 20–29 declaram explicitamente uma implementação espelho. A implementação autoritativa consumida hoje por `content_manga.js` está em `extension/content/cm-dom-replace.js`, exposta como `MangaTranslatorDomReplace.getCleanUrl` e atribuída diretamente a `const getCleanUrl = domReplaceApi.getCleanUrl` em `content_manga.js`.

A comparação atual mostra drift substancial entre espelho e produção; assim, as assertions desta suíte provam diretamente apenas o mirror local.

## 2. Implementações reais correlatas

### `extension/content/cm-dom-replace.js`

SHA lido: `d3fc72032dbddc81eae8fadc5e4da89b13a3bb79`. É a implementação usada pelo pipeline DOM em `content_manga.js`.

O `getCleanUrl` real:
- rejeita **data:** e também **blob:**;
- resolve URLs relativas usando `window.location.origin/href`, `document.baseURI` ou fallback interno;
- canonicaliza `preview.redd.it`/`external-preview.redd.it` para `i.redd.it`;
- canonicaliza thumbnails Imgur removendo sufixos de tamanho;
- conhece parâmetros de resize (`width`, `w`, `h`, `quality`, `q`, `crop`, `fit`, etc.);
- lowercases o resultado;
- usa fallback textual também em lowercase.

### `extension/content/cm-gtc-client.js`

SHA lido: `95d062f41b9f1bd789a576c3a5c5d903b705fa55`. Possui outra implementação de `getCleanUrl` praticamente equivalente para geração de fingerprint/cache global. Essa duplicação aumenta o custo de manter paridade.

### `extension/content/content_manga.js`

SHA lido: `a8b3698019f6f22027f09f544f15c0563a9f6515`. Na região lida, o pipeline não mantém a versão histórica local: ele usa `const getCleanUrl = domReplaceApi.getCleanUrl`.

## 3. Drift entre a suíte e produção

| Tema | Mirror deste teste | Produção `cm-dom-replace.js` | Impacto |
|---|---|---|---|
| `data:` | retorna null | retorna null | alinhado |
| `blob:` | não é rejeitado explicitamente | retorna null | divergente |
| Base relativa | fixa `https://testmanga.com` | origem/href/document base reais | divergente |
| Query normal | remove toda query | remove toda query quando nenhum resize param reconhecido foi removido | parcialmente alinhado |
| Query com resize + parâmetros restantes | remove tudo | remove resize e **preserva query restante** | divergente |
| Hash | desaparece pelo uso de origin+pathname | não é reintroduzido | alinhado na rota genérica |
| Reddit preview | sem tratamento | converte para `i.redd.it` canônico | divergente |
| Imgur thumbnail | sem tratamento | remove sufixo b/m/l/h/t/s antes da extensão | divergente |
| Case | preserva case do origin/path retornado por `URL` | lowercases resultado | divergente |
| Fallback parse | split query/hash, preserva case | split query/hash + lowercase | divergente |

Consequentemente, um verde desta suíte não prova a chave gerada pela extensão para blobs, URLs relativas, Reddit, Imgur, case ou URLs com resize combinado a token.

## 4. Fluxo e cenários da suíte

1. Define um mirror autônomo, sem import de produção.
2. Rejeita valores falsy e strings iniciadas por `data:`.
3. Tenta `new URL(urlStr, 'https://testmanga.com')`.
4. Em sucesso, devolve apenas `origin + pathname`, descartando sempre query/hash.
5. Em erro, faz split textual em `?` e `#`.
6. Os testes exercitam URLs simples, tokens Cloudflare/AWS/GCS, cache busting, hash, rotação de token, Data URLs, falsy, uma string relativa, paths e extensões.

## 5. Evidência automatizada

| Propriedade | Evidência | Classificação |
|---|---|---|
| Arquivo é descoberto no projeto Jest `content-scripts` | `jest.config.js` inclui `tests/unit/content-manga/**/*.test.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Mirror preserva URL absoluta simples | linhas 33–43 | ✅ PROVADO DIRETAMENTE para o mirror |
| Mirror remove tokens/query Cloudflare/AWS/GCS/cache-busting | linhas 45–66 | ✅ PROVADO DIRETAMENTE para o mirror |
| Mirror remove fragmento | linhas 68–78 | ✅ PROVADO DIRETAMENTE para o mirror |
| Tokens rotativos isolados convergem no mirror | linhas 80–85 | ✅ PROVADO DIRETAMENTE para o mirror |
| Paths diferentes permanecem diferentes no mirror | linhas 87–91 | ✅ PROVADO DIRETAMENTE para o mirror |
| `data:image/*` retorna null no mirror | linhas 94–102 | ✅ PROVADO DIRETAMENTE para o mirror |
| `blob:` retorna null | não existe caso e mirror não contém guard de blob | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; diverge do real |
| Entradas falsy retornam null | linhas 104–115 | ✅ PROVADO DIRETAMENTE para o mirror |
| String sem scheme resolve para a base fixa do mirror | linhas 117–129 | ✅ PROVADO DIRETAMENTE para o mirror |
| URL relativa usa **origem real da página** | teste exige somente presença do path e mirror usa host fixo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Produção canonicaliza Reddit preview | `auto-restorer-real.test.js` executa o content script real e restaura via chave `i.redd.it` | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção canonicaliza thumbnail Imgur | `auto-restorer-real.test.js` executa o content script real e restaura chave sem sufixo | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção filtra backdrop gêmeo Reddit | `twin-backdrop-sync.test.js` carrega pipeline real | ✅ PROVADO DIRETAMENTE por teste externo para o comportamento consumidor |
| Produção rejeita `blob:` em `getCleanUrl` | leitura direta do código, sem assertion focal encontrada nesta suíte | 🟦 GATE ESTÁTICO ESPECÍFICO para estrutura; ⚠️ sem prova desta suíte |
| Query genérica com resize + token produz chave estável entre rotações | nenhum caso encontrado nesta suíte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Invariantes pretendidos

1. A mesma imagem não deve ganhar chave nova apenas porque credenciais/tokens transitórios mudaram.
2. Imagens diferentes devem continuar distinguíveis pelo path/canonicalização.
3. Data/blob temporários não devem virar chaves persistentes de rede quando o contrato real os exclui.
4. URLs relativas devem ser resolvidas no contexto real da página, não em um host de fixture fixo.
5. Canonicalizações específicas de provedores devem ocorrer antes de cache/restore/fingerprint.
6. Query usada somente para transformação visual deve não fragmentar a identidade; parâmetros que forem semanticamente relevantes precisam de política explícita.

## 7. Riscos e observações

**Mirror historicamente obsoleto.** O comentário da linha 20 ainda atribui a função a `content_manga.js v3.2`; hoje a função usada pelo pipeline DOM mora em `cm-dom-replace.js`.

**Base relativa artificial.** A suíte afirma no cabeçalho que relativa resolve contra `window.location.origin`, mas o mirror nunca lê `window.location`: usa `https://testmanga.com` hardcoded. O teste relativo só usa `toContain(path)`, então não detecta a contradição.

**Política de query real é condicional.** Na produção, quando nenhum parâmetro de resize reconhecido existe, toda query desaparece. Se um resize param é removido e sobra outra query, essa query restante é preservada. Assim `?token=A` e `?width=640&token=A` seguem políticas diferentes. Para CDNs que combinam resize + token rotativo, isso pode quebrar a estabilidade que esta suíte afirma proteger.

**Case.** Produção converte a chave inteira para lowercase; o mirror não. Se path case-sensitive for significativo no servidor, a política real também merece contrato explícito; esta suíte não toca no tema.

**Provas reais existem, mas são indiretas para a API focal.** `auto-restorer-real.test.js` demonstra Reddit/Imgur por comportamento consumer-level; ainda assim, não há nesta suíte uma matriz direta sobre `MangaTranslatorDomReplace.getCleanUrl`.

## 8. Solicitações ao auditor

### 205-001 — TEST_CORRECTION — OPEN

**Encontrado:** `get-clean-url.test.js` testa um mirror v3.2 que não corresponde à implementação atual de `MangaTranslatorDomReplace.getCleanUrl`.

**Arquivo relacionado:** `tests/unit/content-manga/get-clean-url.test.js` e implementação real `extension/content/cm-dom-replace.js`.

**Evidência atual:** o mirror remove toda query, não rejeita blob, usa base fixa e não contém canonicalizações Reddit/Imgur/lowercase; a produção atual possui esses comportamentos.

**Evidência ausente:** uma suíte focal que carregue `cm-dom-replace.js` real e exercite sua API exportada.

**Necessário:** substituir o mirror por testes da implementação real e atualizar a matriz para incluir blob, origem real de relativas, Reddit, Imgur, lowercase e combinação de parâmetros de resize com parâmetros restantes.

**Risco:** falso verde enquanto a chave efetivamente usada por cache/restore/fingerprint muda ou quebra.

**Severidade:** HIGH.

### 205-002 — CONTRACT_REVIEW — OPEN

**Encontrado:** em `cm-dom-replace.js`/`cm-gtc-client.js`, a query é toda descartada quando nenhum resize param é reconhecido, mas, se um resize param for removido, parâmetros restantes são preservados (`changed && url.search`).

**Exemplo afetado:** uma URL genérica `...?token=A` canonicaliza sem token, enquanto `...?width=640&token=A` pode preservar `?token=A`; rotação de token nesse segundo formato altera a chave.

**Evidência atual:** a condição está presente nas duas implementações reais; os testes atuais cobrem tokens isolados no mirror e casos provider-specific, não essa combinação genérica.

**Evidência ausente:** requisito formal e assertion sobre URLs contendo simultaneamente resize e token/assinatura transitória.

**Necessário:** auditor deve definir quais parâmetros remanescentes são semanticamente relevantes. Depois, testar a política real e corrigir a canonicalização em mudança funcional separada se a estabilidade por token for o requisito.

**Risco:** a mesma imagem pode gerar chaves diferentes após F5/rotação de token, causando miss de restore/cache e duplicação de identidade.

**Severidade:** HIGH.

### 205-003 — DEDUPLICATION_REVIEW — OPEN

**Encontrado:** há duas implementações reais quase equivalentes de `getCleanUrl`, em `cm-dom-replace.js` e `cm-gtc-client.js`, além de mirrors antigos em testes.

**Evidência atual:** as duas funções reais repetem regras de Reddit, Imgur, resize, lowercase e fallback com diferenças apenas de contexto/base; nenhum módulo compartilhado é a fonte única.

**Evidência ausente:** gate de paridade que impeça evolução divergente entre a chave DOM e a chave usada no fingerprint/GTC.

**Necessário:** avaliar centralização em helper compartilhado compatível com content scripts ou, no mínimo, adicionar uma matriz de paridade que execute as duas implementações para entradas canônicas.

**Risco:** restoreMap e fingerprint/cache global podem calcular chaves diferentes para a mesma imagem após alteração futura em apenas um módulo.

**Severidade:** NORMAL.

## 9. Fonte integral exata

O bloco abaixo corresponde exatamente ao blob auditado; o objeto auditado não foi modificado.

```js
/**
 * get-clean-url.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes completos de getCleanUrl() — v3.2.
 *
 * CONTEXTO: Sites de mangá modernos usam CDNs (AWS S3, Cloudflare, GCS) que
 * anexam tokens de sessão nas URLs de imagem. Após F5, esses tokens mudam.
 * getCleanUrl() remove todos os parâmetros de query e hash, retornando apenas
 * origin + pathname — a parte estável da URL.
 *
 * CASOS CRÍTICOS:
 * - Token AWS: ?AWSAccessKeyId=...&Expires=...&Signature=...
 * - Token Cloudflare: ?token=...&expires=...
 * - Token GCS: ?X-Goog-Signature=...
 * - Hash de âncora: #page-3
 * - Data URLs (deve retornar null)
 * - URLs relativas (deve resolver contra window.location.origin)
 */

// Implementação espelho de getCleanUrl (content_manga.js v3.2)
function getCleanUrl(urlStr) {
    if (!urlStr || urlStr.startsWith('data:')) return null;
    try {
        const u = new URL(urlStr, 'https://testmanga.com');
        return u.origin + u.pathname;
    } catch(e) {
        return urlStr.split('?')[0].split('#')[0];
    }
}

describe('CM-01/CM-02/CM-03/CM-04: getCleanUrl() — Normalização de URLs de CDN (v3.2)', () => {

    describe('Casos básicos — sem parâmetros', () => {
        test('URL simples sem parâmetros não é modificada', () => {
            const url = 'https://cdn.site.com/manga/pag1.jpg';
            expect(getCleanUrl(url)).toBe(url);
        });

        test('URL com apenas subpath é preservada integralmente', () => {
            const url = 'https://s1.mangalivre.net/manga/one-piece/chapter-1050/01.jpg';
            expect(getCleanUrl(url)).toBe(url);
        });
    });

    describe('Remoção de query strings (tokens de CDN)', () => {
        test('remove token Cloudflare simples', () => {
            const url = 'https://cdn.site.com/pag1.jpg?token=ABC123&expires=9999999';
            expect(getCleanUrl(url)).toBe('https://cdn.site.com/pag1.jpg');
        });

        test('remove token AWS S3 (AWSAccessKeyId + Expires + Signature)', () => {
            const url = 'https://s3.amazonaws.com/manga/pag1.jpg?AWSAccessKeyId=AKIA&Expires=1714000000&Signature=xyz';
            expect(getCleanUrl(url)).toBe('https://s3.amazonaws.com/manga/pag1.jpg');
        });

        test('remove token Google Cloud Storage (X-Goog-Signature)', () => {
            const url = 'https://storage.googleapis.com/bucket/pag1.jpg?X-Goog-Signature=abcdef&X-Goog-Expires=3600';
            expect(getCleanUrl(url)).toBe('https://storage.googleapis.com/bucket/pag1.jpg');
        });

        test('remove parâmetros de cache-busting (?v=, ?_=, ?timestamp=)', () => {
            expect(getCleanUrl('https://cdn.site.com/img.jpg?v=1714000000')).toBe('https://cdn.site.com/img.jpg');
            expect(getCleanUrl('https://cdn.site.com/img.jpg?_=1714000000')).toBe('https://cdn.site.com/img.jpg');
            expect(getCleanUrl('https://cdn.site.com/img.jpg?timestamp=1714000000')).toBe('https://cdn.site.com/img.jpg');
        });
    });

    describe('Remoção de hash/âncora', () => {
        test('remove hash de âncora da URL', () => {
            const url = 'https://cdn.site.com/pag1.jpg#section-3';
            expect(getCleanUrl(url)).toBe('https://cdn.site.com/pag1.jpg');
        });

        test('remove tanto query quanto hash', () => {
            const url = 'https://cdn.site.com/pag1.jpg?token=abc#page=2';
            expect(getCleanUrl(url)).toBe('https://cdn.site.com/pag1.jpg');
        });
    });

    describe('Mesma imagem = mesma chave após rotação de tokens (caso crítico)', () => {
        test('F5 com novo token retorna a mesma clean URL', () => {
            const visit1 = 'https://cdn.site.com/manga/pag1.jpg?token=ABC123&expires=1714000000';
            const visit2 = 'https://cdn.site.com/manga/pag1.jpg?token=XYZ789&expires=1714003600';
            expect(getCleanUrl(visit1)).toBe(getCleanUrl(visit2));
        });

        test('diferentes imagens com tokens diferentes produzem chaves diferentes', () => {
            const img1 = 'https://cdn.site.com/manga/pag1.jpg?token=ABC';
            const img2 = 'https://cdn.site.com/manga/pag2.jpg?token=ABC';
            expect(getCleanUrl(img1)).not.toBe(getCleanUrl(img2));
        });
    });

    describe('Data URLs — devem retornar null', () => {
        test('data:image/png retorna null (não é URL de rede)', () => {
            expect(getCleanUrl('data:image/png;base64,iVBOR==')).toBeNull();
        });

        test('data:image/jpeg retorna null', () => {
            expect(getCleanUrl('data:image/jpeg;base64,/9j/')).toBeNull();
        });
    });

    describe('Entradas inválidas', () => {
        test('string vazia retorna null', () => {
            expect(getCleanUrl('')).toBeNull();
        });

        test('null retorna null', () => {
            expect(getCleanUrl(null)).toBeNull();
        });

        test('undefined retorna null', () => {
            expect(getCleanUrl(undefined)).toBeNull();
        });

        test('URL malformada não lança exceção (fallback com split)', () => {
            expect(() => getCleanUrl('not-a-url?param=value')).not.toThrow();
        });

        test('URL sem scheme é resolvida contra a base (comportamento correto do new URL)', () => {
            // CORREÇÃO: new URL('not-a-url?param=value', 'https://testmanga.com')
            // NAO lança TypeError — trata como URL relativa e resolve contra a base.
            // Resultado: 'https://testmanga.com/not-a-url' (query removida corretamente).
            // O fallback via split('?') nunca é acionado porque new URL() tem sucesso.
            // O comportamento CORRETO é retornar a URL resolvida sem query string.
            const result = getCleanUrl('not-a-url?param=value');
            expect(result).toBe('https://testmanga.com/not-a-url');
        });
    });

    describe('URLs relativas', () => {
        test('URL relativa é resolvida contra a origem', () => {
            const result = getCleanUrl('/manga/chapter/pag1.jpg');
            expect(result).toContain('/manga/chapter/pag1.jpg');
        });

        test('URL relativa com query tem query removida', () => {
            const result = getCleanUrl('/pag1.jpg?token=abc');
            expect(result).not.toContain('?');
            expect(result).not.toContain('token');
        });
    });

    describe('Preservação de estrutura de path', () => {
        test('path complexo com múltiplas pastas é preservado', () => {
            const url = 'https://cdn.example.com/media/manga/series/one-piece/vol-01/chapter-1050/page-001.jpg';
            expect(getCleanUrl(url)).toBe(url); // Sem query = sem mudança
        });

        test('extensão do arquivo é preservada (.jpg, .png, .webp)', () => {
            ['jpg', 'png', 'webp', 'gif'].forEach(ext => {
                const url = `https://cdn.site.com/img.${ext}?token=abc`;
                expect(getCleanUrl(url)).toBe(`https://cdn.site.com/img.${ext}`);
            });
        });
    });
});
```

## 10. Cobertura documental por linha/posição

As faixas abaixo cobrem **1–159** sem lacunas nem sobreposição; 159 é o newline terminal.

### Posições 1–18 — cabeçalho e contrato histórico
Declaram v3.2, motivação por tokens e a promessa de remover todos os query/hash, além de listar Data URLs e relativas. O contrato é histórico e não coincide integralmente com produção atual. **Evidência:** 🟦 GATE ESTÁTICO para o texto; ⚠️ claims funcionais exigem comparação com produção.

### Posição 19 — separador
Linha vazia, sem comportamento runtime. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 20–29 — implementação espelho
Define toda a função efetivamente testada: falsy/data→null, base fixa, origin+pathname e fallback por split. Não importa a API real. **Evidência:** ✅ o restante da suíte prova este mirror; ⚠️ não prova produção.

### Posição 30 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 31–43 — abertura e URLs básicas
Abrem suíte e provam duas URLs absolutas sem parâmetros permanecendo idênticas no mirror. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posição 44 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 45–66 — queries/tokens
Provam remoção completa de query em Cloudflare, AWS, GCS e três cache-busters pelo mirror. Não cobrem query mista resize+token da produção atual. **Evidência:** ✅ mirror; ⚠️ contrato real combinado.

### Posição 67 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 68–78 — fragmentos
Exigem remoção de hash sozinho e junto com query. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posição 79 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 80–92 — estabilidade/diferença de chaves
Comparam diretamente duas visitas tokenizadas do mesmo path e paths diferentes. Aqui as assertions são fortes para o mirror. **Evidência:** ✅ PROVADO DIRETAMENTE para os casos escolhidos.

### Posição 93 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 94–102 — Data URLs
Dois MIME types data:image retornam null. Produção adiciona blob ao mesmo guard, mas esta suíte não. **Evidência:** ✅ data no mirror; ⚠️ blob ausente.

### Posição 103 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 104–130 — entradas falsy e relativa textual
Testam '', null, undefined, ausência de throw e resultado exato da base hardcoded `testmanga.com`. O caso chamado malformado é, na prática, uma URL relativa válida para `new URL(base)`, como os próprios comentários reconhecem. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posição 131 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 132–143 — URLs relativas
A primeira assertion só procura o pathname; a segunda prova remoção de query. Nenhuma exige a origem real de `window.location`, apesar do cabeçalho. **Evidência:** ✅ path/query do mirror; ⚠️ origem real não provada.

### Posição 144 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 145–157 — path e extensões
Provam path complexo inalterado e remoção de token para jpg/png/webp/gif no mirror. **Evidência:** ✅ PROVADO DIRETAMENTE para os exemplos.

### Posição 158 — fechamento
Fecha a suíte Jest. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo parser/runner quando a suíte é executada.

### Posição 159 — newline final
Terminador textual final. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA reconfirmado antes da escrita: `a04fe1e3552d5b61a91442496a1294e6d8379fbf`.
- Fonte integral embutida do blob auditado.
- **159/159 posições** cobertas: 1–18, 19, 20–29, 30, 31–43, 44, 45–66, 67, 68–78, 79, 80–92, 93, 94–102, 103, 104–130, 131, 132–143, 144, 145–157, 158, 159.
- Evidência do mirror foi separada de provas consumer-level da produção.
- O drift atual foi registrado, não corrigido durante a auditoria.
- Nenhum teste foi declarado como executado nesta sessão.
- `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md`, código e testes permaneceram fora do escopo de escrita.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com três `audit_requests` abertos.

# Bíblia técnica — `extension/background/actions/fetch-image-base64.js`

> **Estado:** ✅ CRIADO, REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `4a4825c36fdbe630e80dd7fba1341bdc7a06aecf`  
> **Linhas textuais:** **95**.  
> **Posições documentais:** **96** incluindo newline final.  
> **Teste direto:** `tests/unit/background/fetch-image-base64-action.test.js` — `1246da7bd3992499b1a21a4a00dc32b83f9486c3`.

## 1. Papel arquitetural

Capacidade privilegiada do service worker para transformar uma imagem HTTP(S) remota em Data URL quando canvas/fetch da página não consegue acessar o recurso. Possui modo anônimo (`credentials:'omit'`) e modo Gemini autenticado (`include`).

## 2. Segurança do modo autenticado

`geminiSession:true` só passa quando **duas condições** são verdadeiras: o asset está em `googleusercontent.com`/subdomínio e o sender é `https://gemini.google.com/...`. O router também classifica 127.0.0.1 como `gemini` para desenvolvimento, mas isso não basta para sessão autenticada.

## 3. Limites operacionais

- O teto de 50 MiB é checado **depois** de `response.blob()`: limita conversão/retorno Base64, não o tráfego ou a materialização inicial do corpo.
- O timer de 30 s é limpo após obter o Blob; portanto a etapa `FileReader.readAsDataURL()` fica fora desse timeout.
- `cache:'no-store'` é usado em ambos os modos.
- Sem geminiSession, qualquer HTTP(S) aceito pelas permissões da extensão pode ser buscado; não há allowlist de host/IP privado.

## 4. Consumidores

`content_manga.js` usa o action sem sessão quando o canvas da aba auxiliar falha. `content/gemini/result-extractor.js` usa `geminiSession:true` no fallback privilegiado de assets gerados pelo Gemini e modo sem sessão em outros fluxos.

## 5. Evidência

| Fonte | Classificação | O que prova |
|---|---|---|
| `fetch-image-base64-action.test.js` | ✅ PROVADO DIRETAMENTE | URL/protocolo, omit/include, host+sender autenticados, 50 MiB/+1, MIME, HTTP 404, Data URL e abort de 30 s. |
| `result-extractor.test.js` | ✅ PROVA DO CONSUMIDOR | O consumidor envia `geminiSession:true` na rota privilegiada e omite o flag na rota comum; runtime é mockado. |
| `content_manga.js` | 🟨 CONSUMIDOR REAL | Fallback de canvas envia FETCH_IMAGE_AS_BASE64 e espera `dataUrl`. |
| `gemini-cors-fallback.test.js` | ⚠️ MIRROR HISTÓRICO | Reimplementa handler/contrato antigo; não é prova direta desta action. |

## 6. Lacunas explícitas

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `FileReader.onerror`, construtor/readAsDataURL lançando ou `reader.result` inválido.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `response.blob()` rejeitando ou headers ausentes/malformados.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fail-fast quando MangaTranslatorRouter/registerAction não existe.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para redirects finais; `response.url` não é revalidado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para casing incomum de MIME; `startsWith('image/')` é case-sensitive.
- ⚠️ O limite de 50 MiB é pós-Blob e não evita baixar um corpo maior que isso.

## 7. Invariantes

1. URL inválida/protocolo não HTTP(S) falham antes de fetch.
2. Modo comum nunca envia cookies.
3. Modo autenticado exige host Google **e** sender Gemini real.
4. HTTP não-ok e MIME não-image falham antes de FileReader.
5. Exatamente 50 MiB passa; >50 MiB falha.
6. Timeout aborta o fetch aos 30 s enquanto ele/Blob ainda estão pendentes.
7. Sucesso retorna `dataUrl`.
8. Timer é limpo em todos os caminhos via finally.

## 8. Fonte integral

~~~javascript
'use strict';
// background/actions/fetch-image-base64.js -- Busca imagens remotas para o fallback CORS.

(function(scope) {
  const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
  const FETCH_TIMEOUT_MS = 30_000;

  function validate(request) {
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url);
    } catch (_error) {
      return {
        code: 'INVALID_PAYLOAD',
        message: 'URL inválida',
      };
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        code: 'INVALID_PAYLOAD',
        message: 'Protocolo inválido',
      };
    }

    if (request.geminiSession === true) {
      const host = parsedUrl.hostname.toLowerCase();
      const isGoogleAsset = host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
      if (!isGoogleAsset) {
        return {
          code: 'INVALID_PAYLOAD',
          message: 'Asset autenticado deve ser googleusercontent.com',
        };
      }
    }

    return null;
  }

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'));
      reader.readAsDataURL(blob);
    });
  }

  if (!scope.MangaTranslatorRouter ||
      typeof scope.MangaTranslatorRouter.registerAction !== 'function') {
    throw new Error('MangaTranslatorRouter indisponivel para registrar fetch-image-base64');
  }

  scope.MangaTranslatorRouter.registerAction({
    name: 'fetch-image-base64',
    meta: {
      allowedSources: ['content', 'gemini'],
    },
    validate,
    async execute(request, context) {
      const wantsGeminiSession = request.geminiSession === true;
      const senderUrl = String(context && context.sender && context.sender.tab && context.sender.tab.url || '');
      if (wantsGeminiSession && !/^https:\/\/gemini\.google\.com\//i.test(senderUrl)) {
        throw new Error('Sessão Gemini permitida somente para a aba Gemini');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(request.url, {
          signal: controller.signal,
          credentials: wantsGeminiSession ? 'include' : 'omit',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          throw new Error(`Content-Type inválido: ${contentType}`);
        }

        const blob = await response.blob();
        clearTimeout(timeout);
        if (blob.size > MAX_IMAGE_BYTES) {
          throw new Error('Imagem muito grande (>50MB)');
        }

        return { dataUrl: await readAsDataUrl(blob) };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## 9. Rastreabilidade 96/96

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/fetch-image-base64.js -- Busca imagens remotas para o fallback CORS. | Comentário de intenção: background/actions/fetch-image-base64.js -- Busca imagens remotas para o fallback CORS.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U01 | (function(scope) { | Parte da expressão da unidade U01: `(function(scope) {`. |
| 005 | U01 |   const MAX_IMAGE_BYTES = 50 * 1024 * 1024; | Define/usa o teto de 50 MiB antes da conversão Base64. |
| 006 | U01 |   const FETCH_TIMEOUT_MS = 30_000; | Define/usa o timeout de 30 segundos. |
| 007 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 008 | U02 |   function validate(request) { | Abre o validator pré-fetch. |
| 009 | U02 |     let parsedUrl; | Parte da expressão da unidade U02: `let parsedUrl;`. |
| 010 | U02 |     try { | Parte da expressão da unidade U02: `try {`. |
| 011 | U02 |       parsedUrl = new URL(request.url); | Parseia a URL antes de qualquer efeito de rede. |
| 012 | U02 |     } catch (_error) { | Parte da expressão da unidade U02: `} catch (_error) {`. |
| 013 | U02 |       return { | Parte da expressão da unidade U02: `return {`. |
| 014 | U02 |         code: 'INVALID_PAYLOAD', | Classifica a falha como payload inválido no router. |
| 015 | U02 |         message: 'URL inválida', | Mensagem estável para URL não parseável. |
| 016 | U02 |       }; | Fecha estrutura sintática da unidade U02. |
| 017 | U02 |     } | Fecha estrutura sintática da unidade U02. |
| 018 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 019 | U02 |     if (!['http:', 'https:'].includes(parsedUrl.protocol)) { | Restringe o protocolo a HTTP(S). |
| 020 | U02 |       return { | Parte da expressão da unidade U02: `return {`. |
| 021 | U02 |         code: 'INVALID_PAYLOAD', | Classifica a falha como payload inválido no router. |
| 022 | U02 |         message: 'Protocolo inválido', | Mensagem estável para esquema proibido. |
| 023 | U02 |       }; | Fecha estrutura sintática da unidade U02. |
| 024 | U02 |     } | Fecha estrutura sintática da unidade U02. |
| 025 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 026 | U02 |     if (request.geminiSession === true) { | Ativa as regras extras do modo autenticado. |
| 027 | U02 |       const host = parsedUrl.hostname.toLowerCase(); | Normaliza o host para comparação case-insensitive. |
| 028 | U02 |       const isGoogleAsset = host === 'googleusercontent.com' \|\| host.endsWith('.googleusercontent.com'); | Exige googleusercontent.com ou subdomínio real. |
| 029 | U02 |       if (!isGoogleAsset) { | Exige googleusercontent.com ou subdomínio real. |
| 030 | U02 |         return { | Parte da expressão da unidade U02: `return {`. |
| 031 | U02 |           code: 'INVALID_PAYLOAD', | Classifica a falha como payload inválido no router. |
| 032 | U02 |           message: 'Asset autenticado deve ser googleusercontent.com', | Bloqueia cookies para host fora da allowlist. |
| 033 | U02 |         }; | Fecha estrutura sintática da unidade U02. |
| 034 | U02 |       } | Fecha estrutura sintática da unidade U02. |
| 035 | U02 |     } | Fecha estrutura sintática da unidade U02. |
| 036 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 037 | U02 |     return null; | Indica validação bem-sucedida. |
| 038 | U02 |   } | Fecha estrutura sintática da unidade U02. |
| 039 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 040 | U03 |   function readAsDataUrl(blob) { | Declara conversão Blob→Data URL. |
| 041 | U03 |     return new Promise((resolve, reject) => { | Parte da expressão da unidade U03: `return new Promise((resolve, reject) => {`. |
| 042 | U03 |       const reader = new FileReader(); | Instancia FileReader. |
| 043 | U03 |       reader.onloadend = () => resolve(reader.result); | Resolve com o resultado do FileReader. |
| 044 | U03 |       reader.onerror = () => reject(reader.error \|\| new Error('Falha ao ler imagem')); | Rejeita erro de leitura do Blob. |
| 045 | U03 |       reader.readAsDataURL(blob); | Inicia codificação Data URL/Base64. |
| 046 | U03 |     }); | Fecha estrutura sintática da unidade U03. |
| 047 | U03 |   } | Fecha estrutura sintática da unidade U03. |
| 048 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 049 | U04 |   if (!scope.MangaTranslatorRouter \|\| | Verifica presença do router global. |
| 050 | U04 |       typeof scope.MangaTranslatorRouter.registerAction !== 'function') { | Verifica API de registro do router. |
| 051 | U04 |     throw new Error('MangaTranslatorRouter indisponivel para registrar fetch-image-base64'); | Falha cedo quando bootstrap está incompleto. |
| 052 | U04 |   } | Fecha estrutura sintática da unidade U04. |
| 053 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 054 | U05 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action. |
| 055 | U05 |     name: 'fetch-image-base64', | Nome canônico do alias FETCH_IMAGE_AS_BASE64. |
| 056 | U05 |     meta: { | Parte da expressão da unidade U05: `meta: {`. |
| 057 | U05 |       allowedSources: ['content', 'gemini'], | Restringe sources a content/gemini. |
| 058 | U05 |     }, | Fecha estrutura sintática da unidade U05. |
| 059 | U05 |     validate, | Associa o validator à action. |
| 060 | U05 |     async execute(request, context) { | Abre executor assíncrono. |
| 061 | U06 |       const wantsGeminiSession = request.geminiSession === true; | Ativa as regras extras do modo autenticado. |
| 062 | U06 |       const senderUrl = String(context && context.sender && context.sender.tab && context.sender.tab.url \|\| ''); | Extrai defensivamente sender.tab.url. |
| 063 | U06 |       if (wantsGeminiSession && !/^https:\/\/gemini\.google\.com\//i.test(senderUrl)) { | Normaliza pedido de sessão autenticada. |
| 064 | U06 |         throw new Error('Sessão Gemini permitida somente para a aba Gemini'); | Erro operacional para sender autenticado indevido. |
| 065 | U06 |       } | Fecha estrutura sintática da unidade U06. |
| 066 | U06 |       const controller = new AbortController(); | Cria sinal abortável para o fetch. |
| 067 | U06 |       const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS); | Define/usa o timeout de 30 segundos. |
| 068 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 069 | U07 |       try { | Parte da expressão da unidade U07: `try {`. |
| 070 | U07 |         const response = await fetch(request.url, { | Inicia fetch do URL validado. |
| 071 | U07 |           signal: controller.signal, | Vincula fetch ao AbortController. |
| 072 | U07 |           credentials: wantsGeminiSession ? 'include' : 'omit', | Normaliza pedido de sessão autenticada. |
| 073 | U07 |           cache: 'no-store', | Desativa reutilização de cache. |
| 074 | U07 |         }); | Fecha estrutura sintática da unidade U07. |
| 075 | U07 |         if (!response.ok) throw new Error(`HTTP ${response.status}`); | Rejeita status HTTP não-ok. |
| 076 | U07 | ␠ [linha vazia] | Separador visual da unidade U07. |
| 077 | U07 |         const contentType = response.headers.get('content-type') \|\| ''; | Obtém/valida Content-Type da resposta. |
| 078 | U07 |         if (!contentType.startsWith('image/')) { | Obtém/valida Content-Type da resposta. |
| 079 | U07 |           throw new Error(`Content-Type inválido: ${contentType}`); | Obtém/valida Content-Type da resposta. |
| 080 | U07 |         } | Fecha estrutura sintática da unidade U07. |
| 081 | U07 | ␠ [linha vazia] | Separador visual da unidade U07. |
| 082 | U08 |         const blob = await response.blob(); | Materializa o corpo inteiro como Blob. |
| 083 | U08 |         clearTimeout(timeout); | Limpa o timer; no finally, o cleanup é incondicional. |
| 084 | U08 |         if (blob.size > MAX_IMAGE_BYTES) { | Define/usa o teto de 50 MiB antes da conversão Base64. |
| 085 | U08 |           throw new Error('Imagem muito grande (>50MB)'); | Mensagem estável de excesso de tamanho. |
| 086 | U08 |         } | Fecha estrutura sintática da unidade U08. |
| 087 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 088 | U08 |         return { dataUrl: await readAsDataUrl(blob) }; | Retorna Data URL para o consumidor IPC. |
| 089 | U09 |       } finally { | Abre cleanup incondicional. |
| 090 | U09 |         clearTimeout(timeout); | Limpa o timer; no finally, o cleanup é incondicional. |
| 091 | U09 |       } | Fecha estrutura sintática da unidade U09. |
| 092 | U09 |     }, | Fecha estrutura sintática da unidade U09. |
| 093 | U09 |   }); | Fecha estrutura sintática da unidade U09. |
| 094 | U09 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 095 | U10 | ␠ [linha vazia] | Linha textual vazia existente após a IIFE. |
| 096 | U11 | ⏎ [newline final] | Newline terminal editorial; sem efeito runtime. |

## 10. Análise por unidade

### U01 — posições 1–7: Cabeçalho e limites

**O que faz:** Strict mode, finalidade, 50 MiB e timeout de 30 s.

**Evidência:** ✅ Limite 50 MiB e timeout de 30 s têm assertions diretas.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U02 — posições 8–38: Validação da URL

**O que faz:** Parseia URL, exige HTTP(S) e restringe geminiSession a googleusercontent.com.

**Evidência:** ✅ URL inválida, protocolo, host Google/não-Google têm testes diretos.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U03 — posições 39–48: Blob para Data URL

**O que faz:** Converte Blob com FileReader, resolve onloadend e rejeita onerror.

**Evidência:** 🟨 Sucesso é exercitado; ⚠️ FileReader error/throw não têm teste focal.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U04 — posições 49–53: Fail-fast do router

**O que faz:** Lança se MangaTranslatorRouter/registerAction não estiver disponível.

**Evidência:** ⚠️ Sem teste probatório específico.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U05 — posições 54–60: Registro e sources

**O que faz:** Registra fetch-image-base64 para content/gemini e associa validate.

**Evidência:** 🟨 Action real é despachada; rejeição de popup/external não tem caso focal.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U06 — posições 61–68: Sessão Gemini e timeout

**O que faz:** Exige sender https://gemini.google.com/ para cookies e cria AbortController.

**Evidência:** ✅ Sender fora do Gemini e abort em 30 s são testados.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U07 — posições 69–81: Fetch/status/MIME

**O que faz:** Usa omit/include, no-store, exige response.ok e Content-Type image/*.

**Evidência:** ✅ Opções de fetch, HTTP 404 e MIME inválido têm testes diretos.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U08 — posições 82–88: Blob/tamanho/retorno

**O que faz:** Materializa Blob, rejeita >50 MiB e retorna Data URL.

**Evidência:** ✅ 50 MiB exatos, +1 byte e Data URL têm testes diretos; ⚠️ blob() rejeitando não.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U09 — posições 89–94: Finally e fechamento

**O que faz:** Limpa timeout incondicionalmente e fecha action/IIFE.

**Evidência:** 🟨 Executado nos testes; sem assertion de timers pendentes.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U10 — posições 95–95: Linha vazia terminal

**O que faz:** Preserva a linha textual vazia final do conteúdo.

**Evidência:** 🟦 Gate documental.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

### U11 — posições 96–96: Newline final

**O que faz:** Representa o newline terminal do blob.

**Evidência:** 🟦 Gate documental.

**Por que esta forma:** a unidade preserva o boundary de segurança/lifecycle correspondente sem transferir autoridade para o payload além do necessário.

**Risco de alternativa ingênua:** reduzir ou misturar essas guardas pode ampliar credenciais, aceitar conteúdo não-imagem ou mascarar falhas de rede/boot.

## 11. Auditoria final

- [x] SHA/fonte integral;
- [x] 95 linhas textuais + newline = 96/96 posições;
- [x] segurança do modo autenticado separada do modo comum;
- [x] limite/timer interpretados pela ordem real do código;
- [x] consumidor real e mirror histórico diferenciados;
- [x] lacunas sem prova explicitadas;
- [x] nenhum código funcional alterado.

**Veredito documental:** ✅ APROVADO para `4a4825c36fdbe630e80dd7fba1341bdc7a06aecf`.

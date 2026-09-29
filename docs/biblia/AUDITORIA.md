# Auditoria de qualidade — Bíblias técnicas

> Este arquivo é a fonte de verdade da **auditoria de qualidade** das Bíblias individuais.
> Uma Bíblia só pode permanecer `✅ CONCLUÍDO` no `STATUS.md` e `[x]` no `CHECKLIST.md` depois de receber `✅ APROVADO` aqui.

## O que esta auditoria prova

A aprovação significa que, para a versão/SHA auditada:

1. o SHA declarado corresponde ao blob real do arquivo-fonte;
2. a cópia integral do fonte dentro da Bíblia é byte-a-byte equivalente, admitindo apenas a representação editorial do newline final;
3. toda linha/posição do fonte possui cobertura documental rastreável;
4. nenhuma linha comentada aponta para uma linha diferente do fonte;
5. explicações são suficientemente específicas ao comportamento real do projeto;
6. referências a testes/gates apontam para arquivos reais;
7. uma assertion só é chamada de prova direta quando realmente verifica aquele comportamento;
8. execução indireta, mocks, gates estáticos e simulações são diferenciados;
9. código sem prova específica recebe aviso conservador;
10. alegações arquiteturais foram cruzadas com consumidores/dependências reais quando materialmente relevantes.

A auditoria **não é uma prova formal de correção matemática do software**. Ela prova fidelidade documental e honestidade da evidência disponível no repositório.

## Estados

- `✅ APROVADO`: passou no padrão atual.
- `🟣 REVISÃO OBRIGATÓRIA`: a Bíblia existe, mas não pode ser considerada concluída sob o padrão atual.
- `⬜ NÃO AUDITADO`: ainda não passou por auditoria.

## Regras que causam reprovação automática

Uma Bíblia é reprovada se qualquer um destes casos ocorrer:

- SHA do fonte incorreto;
- fonte integral divergente;
- linha do código ausente da auditoria;
- explicação genérica que apenas repete a linha sem explicar sua semântica/contexto;
- `✅ PROVADO` atribuído por seção a linhas que a assertion não verifica;
- ocorrência textual de um símbolo tratada como prova;
- simulação tratada como execução do arquivo real;
- lacuna de teste conhecida sem aviso explícito;
- referência numérica de linha comprovadamente errada;
- conclusão afirmando 100% quando a própria Bíblia contém lacuna estrutural não registrada.

## Auditoria 2026-09-29 — arquivos materializados

| # | Arquivo | Integridade fonte | Cobertura de linhas | Evidência/testes | Especificidade | Resultado |
|---:|---|---|---|---|---|---|
| 1 | `extension/manifest.json` | SHA correto; bloco integral exato | 76/76 posições documentadas | categorias diretas/gate/indiretas/lacunas distinguíveis; referências verificadas | específica ao Manifest e aos consumidores | ✅ APROVADO |
| 2 | `extension/background.js` | SHA correto; bloco integral exato | 1252/1252; nenhuma divergência física | muitas faixas usam prova funcional de seção como evidência de linha | 305 linhas usam fallback “executa a instrução específica”; só 28 formas normalizadas distintas em “Como faz” para 1252 linhas | 🟣 REVISÃO OBRIGATÓRIA |
| 3 | `extension/background/actions/calculate-visual-fingerprint.js` | SHA correto; bloco integral exato | 130/130; nenhuma divergência | existem testes reais fortes, porém linhas estruturais recebem `✅ PROVADO` pelo resultado da faixa, não por assertion daquela linha | 15 linhas ainda caem no fallback “executa a instrução específica” | 🟣 REVISÃO OBRIGATÓRIA |
| 4 | `extension/background/actions/check-extraction-tab.js` | SHA correto; bloco integral exato | corrigido para 26/26 posições | hit/miss e roteamento têm evidência real; lacunas de ordem/sender ausente continuam explícitas | específica ao mapping/ownership da aba | ✅ APROVADO |
| 5 | `extension/background/actions/claim-gemini-job.js` | SHA correto; bloco integral exato | 103/103; nenhuma divergência | testes reais provam allowlist, SOURCE_DENIED, mismatch e alias, mas a frase de evidência verde é repetida genericamente em todas as linhas | semântica em geral boa, classificação de prova não é linha-específica | 🟣 REVISÃO OBRIGATÓRIA |
| 6 | `extension/background/actions/commit-result.js` | SHA correto; bloco integral exato | 107/107; nenhuma divergência | testes reais provam commit, persistência, batch, ownership e journal; porém “coberta direta ou estruturalmente ... quando aplicável” é vago e não classificável por linha | boa semântica geral, evidência precisa ser refeita | 🟣 REVISÃO OBRIGATÓRIA |
| 7 | `extension/background/actions/deliver-result-from-tab.js` | SHA correto; bloco integral exato | 104/104; nenhuma divergência | testes reais cobrem sucesso/retry/sender/payload, mas rótulos verdes são herdados por faixa | 40 linhas ainda usam fallback “executa a instrução concreta” | 🟣 REVISÃO OBRIGATÓRIA |
| 8 | `extension/background/actions/deliver-result-url.js` | SHA correto; bloco integral exato | 94/94; nenhuma divergência | testes reais cobrem ownership, batch, URL e registro; alguns rótulos verdes continuam aplicados por faixa | 17 linhas usam fallback “executa a instrução concreta” | 🟣 REVISÃO OBRIGATÓRIA |

## Correções já aplicadas pela auditoria

### `check-extraction-tab.js`

Foram corrigidos dois defeitos objetivos:

- a Bíblia dizia que o argumento da IIFE estava na linha 24; o fonte real mostra a invocação na **linha 25**;
- a posição 26, correspondente ao newline final, não estava documentada; agora está.

Depois dessas correções o arquivo passou na auditoria atual.

### `manifest.json`

A integridade física foi reconfirmada:

- SHA-base confere;
- fonte integral confere;
- 76 posições são cobertas;
- permissões e APIs citadas possuem consumidores reais quando a Bíblia afirma uso;
- ausência de assertions específicas para permissões/atributos não protegidos permanece explicitamente marcada.

## Motivos detalhados das revisões obrigatórias

### `background.js`

A Bíblia é fisicamente completa, mas ainda não satisfaz o padrão de **extremo detalhamento sem templates**:

- 305 linhas reutilizam a forma “executa a instrução específica”;
- essas linhas reaproveitam uma justificativa de seção, em vez de explicar a semântica precisa da instrução;
- 974 ocorrências de “PROVA FUNCIONAL” aparecem no documento porque a evidência da seção é repetida por linha;
- um teste que prova o comportamento de uma função não prova automaticamente cada declaração, delimitador, log, assignment ou fallback da função.

Para aprovação, cada uma dessas linhas precisa receber descrição concreta e a evidência precisa ser reclassificada conservadoramente.

### `calculate-visual-fingerprint.js`

Os testes reais são bons, mas a documentação mistura “comportamento da faixa provado” com “linha provada”. Exemplo: declarações/try/catch dentro da validação recebem `✅ PROVADO` porque os testes rejeitam URLs, embora a assertion não prove individualmente cada linha. A solução é:

- manter a explicação do comportamento;
- classificar a linha como execução indireta quando apropriado;
- reservar prova direta para valores/efeitos realmente assertados;
- substituir os 15 fallbacks genéricos por explicações específicas.

### `claim-gemini-job.js`

A descrição semântica é forte, mas a mesma frase:

> “✅ quando coberta pelos cenários diretos acima...”

é usada em todas as linhas. Isso não permite saber se uma linha está diretamente provada, apenas executada ou não coberta. A Bíblia deve mapear cada comportamento aos casos:

- allowlist/sanitização;
- jobId divergente;
- aba manual;
- source denied;
- alias/replacement;
- caminhos não testados.

### `commit-result.js`

A suíte direta prova vários contratos importantes, mas a frase:

> “coberta direta ou estruturalmente ... quando aplicável”

não satisfaz a exigência de rastreabilidade. Cada linha/comportamento precisa ser classificado em uma categoria verificável.

### `deliver-result-from-tab.js`

A suíte prova o protocolo principal, porém:

- 40 linhas ainda usam comentário genérico;
- várias linhas recebem “✅” apenas por pertencer à mesma faixa do teste;
- os mismatches individuais de batch/index/mangaTabId e algumas falhas de API não têm teste focal e precisam permanecer claramente amarelos/vermelhos.

### `deliver-result-url.js`

É melhor que as versões mais antigas, mas ainda possui 17 comentários genéricos e classificação verde por seção. Os caminhos de `blob:`, `data:image`, erro de `tabs.create`, erro de `updateJobState` e erro de `syncState` continuam sem prova focal.

## Ordem obrigatória após esta auditoria

A produção de novos arquivos fica **pausada** até que as Bíblias materializadas reprovadas sejam revisadas.

Ordem de revisão:

1. `extension/background.js`;
2. `extension/background/actions/calculate-visual-fingerprint.js`;
3. `extension/background/actions/claim-gemini-job.js`;
4. `extension/background/actions/commit-result.js`;
5. `extension/background/actions/deliver-result-from-tab.js`;
6. `extension/background/actions/deliver-result-url.js`.

Somente depois de todas essas revisões voltará a fila normal em:

`extension/background/actions/deliver-result.js`.

## Protocolo de reauditoria

Para aprovar uma revisão:

1. buscar novamente o fonte e conferir SHA;
2. comparar bloco integral da Bíblia com o fonte;
3. comparar cada `Linha N` com a linha N real;
4. procurar fallbacks genéricos;
5. abrir os testes citados e ler as assertions;
6. reclassificar toda evidência forte;
7. exigir alerta explícito nos caminhos não provados;
8. verificar consumidores/dependências citados;
9. somente então trocar `🟣 REVISÃO OBRIGATÓRIA` por `✅ APROVADO`;
10. atualizar `STATUS.md` e `CHECKLIST.md`.

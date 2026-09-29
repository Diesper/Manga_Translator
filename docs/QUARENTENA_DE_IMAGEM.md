# Quarentena da imagem de entrada

A quarentena impede que o anexo enviado ao Gemini seja aceito e devolvido como tradução. Ela complementa a validação de autoria do Observer com uma verificação exata dos bytes extraídos.

## Decisão de segurança

O fluxo aplica duas barreiras:

1. **Contexto estrutural:** imagens dentro do compositor, de um `file-preview`/attachment ou de um turno do usuário são classificadas como entrada. Elas não participam da detecção automática nem da seleção manual.
2. **Identidade exata:** depois da extração e antes da entrega, o runner calcula SHA-256 dos bytes da entrada e do resultado. Se forem iguais, interrompe a entrega com `GEMINI_RESULT_MATCHES_INPUT`.

O hash ignora o cabeçalho MIME da data URL e considera somente os bytes decodificados. Assim, trocar `image/png` por `image/webp` sem alterar o payload não contorna a proteção. Os hashes completos não são registrados nos logs.

Similaridade perceptual pode ser calculada como telemetria, mas nunca decide o bloqueio. Uma tradução válida costuma preservar quase toda a arte; um limiar visual poderia gerar falsos positivos. A rejeição de conteúdo usa igualdade criptográfica exata.

A comparação exata detecta o mesmo payload, inclusive quando apenas o MIME da data URL muda. Uma cópia visual reencodada pode ter bytes diferentes e não será bloqueada por SHA-256; por isso a classificação estrutural continua sendo a primeira barreira e a qualidade final permanece sujeita à validação do usuário.

## Integração

`content/gemini/image-quarantine.js` é carregado depois de `content/gemini/dom.js` e antes do Observer. O módulo expõe:

- `classifyStructuralInput(element)`: retorna `attachment_preview`, `composer`, `user_turn` ou `null`;
- `isStructurallyInput(element)`: forma booleana usada pelo runner;
- `computeExactHash(dataUrl)`: SHA-256 dos bytes decodificados;
- `assessExtractedResult(...)`: reúne classificação estrutural, igualdade exata e telemetria opcional.

O Observer consulta a classificação antes de validar autoria. O runner usa a mesma regra em `isLikelyGeneratedImage` e `isManualSelectableImage`, portanto os botões **Usar última** e **Selecionar** não contornam a quarentena.

O hash da entrada é preparado assim que `REQUEST_IMAGE_DATA` retorna. Se a API criptográfica não estiver disponível, existe uma implementação SHA-256 local. Se uma data URL estiver malformada, o runner registra `GEMINI_QUARANTINE_HASH_UNAVAILABLE` e conserva os filtros estruturais; uma indisponibilidade do hash não inventa uma igualdade.

## Eventos de diagnóstico

| Evento | Significado |
|---|---|
| `GEMINI_INPUT_QUARANTINE_READY` | O SHA-256 da entrada foi calculado. |
| `GEMINI_RESULT_REJECTED` com `attachment_preview`, `composer` ou `user_turn` | Um candidato ainda pertence ao caminho de entrada. |
| `GEMINI_RESULT_MATCHES_INPUT` | O resultado extraído tem os mesmos bytes da entrada e não foi entregue. |
| `GEMINI_QUARANTINE_HASH_UNAVAILABLE` | A comparação exata não pôde ser concluída; a proteção estrutural continua ativa. |

## Cobertura automatizada

Os testes verificam SHA-256 sobre bytes, igualdade com MIME diferente, diferença de um byte, telemetria perceptual sem bloqueio, compositor, turno do usuário, preview em Shadow DOM, exclusão de resposta legítima do modelo e data URL inválida. Há também testes do Observer para preview reconstruído durante a geração e do runner para impedir a entrega idêntica e permitir um resultado diferente.

As suítes são executadas pelo GitHub Actions. Nesta revisão não foi executado Jest localmente, conforme orientação do mantenedor.

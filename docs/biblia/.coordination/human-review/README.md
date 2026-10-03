# Human review packages

Quando uma unidade chega a `correction_cycle >= 7`, o transition engine a coloca em
`HUMAN_LOCKED` e gera um pacote JSON + resumo Markdown com ciclos, revisão, findings,
corretores recentes e padrões repetidos.

Esses arquivos são projeções para revisão humana e não concedem autorização.

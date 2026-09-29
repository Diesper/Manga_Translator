# Verificação completa pós-merge da main

## Objetivo

Garantir que **todo commit que entre na branch `main`** dispare uma rodada completa de CI, incluindo os diagnósticos que permanecem opcionais em PRs normais.

## Evento protegido

A política é ativada quando:

```text
github.event_name == push
github.ref == refs/heads/main
```

Isso cobre merges de pull requests e qualquer outro commit que consiga chegar à `main`.

## O que precisa executar

Além dos gates normais:

- Version Integrity;
- JS Syntax Check;
- Manifest Validation;
- CI Contract;
- Smoke Tests;
- Visual Tests;
- Unit + Integration Node 20/22;
- Code Coverage;
- E2E Playwright;

a execução da `main` também exige:

1. **Jest Worker Diagnostic**
   - full-default;
   - full-w1;
   - full-w2;
   - full-w3;
   - full-w4;
   - projects individuais;
   - combinações entre projects.

2. **Focused Project Leak**
   - projects e combinações historicamente relevantes ao worker leak.

3. **Background Leak Bisection**
   - duas tentativas do conjunto de background com 3 workers;
   - se houver leak, redução/bisection e confirmação final.

## Sem mascaramento

Na execução pós-merge:

- os jobs de diagnóstico não usam `continue-on-error`;
- os passos que executam os scripts de diagnóstico não usam `continue-on-error`;
- falha/reprodução de leak retorna código diferente de zero;
- `CI Gate` depende dos três diagnósticos;
- qualquer resultado diferente de `success` reprova o `CI Gate`.

O `continue-on-error` permanece apenas em upload de artifacts/telemetria externa quando isso não altera o resultado técnico dos testes.

## Sem cancelamento da main

A configuração de concurrency usa:

```yaml
cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

Assim, uma atualização nova pode cancelar uma execução antiga de uma branch de trabalho, mas **não pode cancelar uma verificação já iniciada da `main`**.

## Proteção contra enfraquecimento futuro

`tests/ci/verify-ci-contract.js` falha se:

- qualquer um dos três jobs desaparecer;
- deixar de executar em `push` da `main`;
- voltar a ser apenas `workflow_dispatch`;
- voltar a usar `continue-on-error` no job ou no comando de diagnóstico;
- deixar de participar de `CI Gate.needs`;
- o `CI Gate` deixar de exigir seu sucesso na verificação completa;
- `cancel-in-progress` voltar a permitir cancelamento da `main`.

## Limite da garantia

Essa é a garantia máxima que o workflow pode oferecer: todo commit observado pelo GitHub Actions na `main` recebe uma execução completa e bloqueante. Falhas externas da própria infraestrutura do GitHub podem impedir a execução; nesse caso o estado não deve ser interpretado como teste aprovado.

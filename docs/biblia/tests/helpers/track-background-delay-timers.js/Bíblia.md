# Bíblia técnica — tests/helpers/track-background-delay-timers.js

> **Estado documental:** 🟡 CORRIGIDA após PRIMARY+ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `b7860da7879c9bac7714f3ba7d33a7024b586c0d`  
> **Agente responsável:** AGENTE 7  
> **Tipo:** helper Jest de ownership/cleanup de timers reais de background  
> **Linhas textuais:** **41**  
> **Posições documentais:** **42**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`track-background-delay-timers.js` é infraestrutura de isolamento para suítes que carregam o background real com timers reais. Ele espiona `global.setTimeout`, mas intercepta somente três delays conhecidos por representar cleanup tardio do produto — 600 ms, 4 s e 18 s — deixando todos os demais timers seguirem pelo `setTimeout` original.

O helper não acelera esses timers. Em vez disso, mantém ownership explícito dos handles criados durante o caso atual e devolve uma função que os cancela no teardown. Essa função também expõe snapshots de delays/contagem para regressões que precisam provar que um recurso tardio pertence ao teste corrente.

## 2. Dependências, consumidores e efeitos colaterais

- **Dependências:** globals Jest (`jest.spyOn`) e os timers globais reais de Node/Jest.
- **Consumidores localizados:** `marker-anchor-real.test.js`, `process-finalize-real.test.js`, `lifecycle-alarms-real.test.js`, `message-handlers-real.test.js` e `regex-escape.test.js`.
- **Código funcional relacionado:** timers de 600/18_000 em `extension/background/jobs-lifecycle.js`; o caminho real de `handleMarkerAndShow` produz o timer de 4 s observado por `marker-anchor-real.test.js`.
- **Efeito global:** substitui temporariamente `global.setTimeout` por um spy. O cancelador limpa handles rastreados, mas **não restaura o spy**; os consumidores conhecidos fazem isso com `jest.restoreAllMocks()`.
- **Estado interno:** `pending` é privado por invocação do helper, portanto cada teste que chama a factory recebe um conjunto de ownership independente.

## 3. Fluxo de execução

1. captura `setTimeout` e `clearTimeout` reais;
2. cria um `Map` de handles pendentes;
3. instala spy sobre `global.setTimeout`;
4. delega delays diferentes de 600/4_000/18_000 sem rastreá-los;
5. para um delay alvo, agenda com timer real, registra o handle e o remove do Map antes de disparar o callback;
6. devolve um cancelador que limpa todos os handles ainda pendentes e retorna seus delays;
7. anexa getters de observabilidade ao cancelador.

## 4. Evidência automatizada

| Contrato | Evidência encontrada | Classificação |
|---|---|---|
| Timer de 4 s é capturado pelo helper | `marker-anchor-real.test.js` chama o background real e exige `getPendingDelays()` contendo `4_000` | ✅ PROVADO DIRETAMENTE |
| Cancelamento do 4 s retorna o delay e zera pending | mesmo teste exige `cancelledDelays` contendo `4_000` e `getPendingCount() === 0` | ✅ PROVADO DIRETAMENTE |
| Uso em teardowns de background | `marker-anchor-real`, `process-finalize-real`, `lifecycle-alarms-real`, `message-handlers-real` e `regex-escape` instalam o tracker e chamam o cancelador | 🟨 EXECUTADO INDIRETAMENTE |
| Delay de 4 s protegido na matriz de regressão | `regression-matrix.json` exige markers `getPendingDelays` e `4_000` no teste de anchor | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Produção possui timer de 600 ms | literal/fluxo em `extension/background/jobs-lifecycle.js`; `process-finalize-real.test.js` atravessa `finalizeJob` real | 🟨 FATO DO SOURCE + EXECUÇÃO FUNCIONAL; não existe marker estático específico para 600 ms |
| Produção possui timer de 18 s | literal/fluxo em `extension/background/jobs-lifecycle.js`; suítes de lifecycle carregam o background real | 🟨 FATO DO SOURCE + EXECUÇÃO FUNCIONAL; não existe marker estático específico para 18_000 ms |
| Captura/cancelamento específico de 600 e 18_000 | consumidores usam o helper, mas não foi localizada assertion focal sobre esses dois valores | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Delegação de delays fora da allowlist | implementação chama o `setTimeout` real, mas não foi localizado teste focal que prove transparência | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Remoção automática após firing natural | wrapper executa `pending.delete(timer)` antes do callback; nenhuma assertion focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Restauração do spy | consumidores conhecidos chamam `jest.restoreAllMocks()` no teardown; o helper não a executa por conta própria | 🟨 EXECUTADO INDIRETAMENTE |

A prova de 4 s não foi generalizada para 600/18_000: esses dois valores aparecem na implementação e no código funcional, e o helper participa dos teardowns correspondentes, mas uso indireto não foi promovido a assertion direta.

## 5. Invariantes

1. A allowlist de delays deve continuar alinhada aos recursos tardios reais que precisam de ownership em testes.
2. Delays fora de 600/4_000/18_000 não devem entrar em `pending`.
3. O handle devolvido ao código sob teste é o handle produzido pelo timer real.
4. Um callback rastreado deve sair de `pending` antes de executar seu corpo.
5. O cancelador precisa limpar todos os handles ainda pendentes e depois deixar contagem zero.
6. `getPendingDelays` e `getPendingCount` devem observar somente o Map daquela invocação.
7. Consumidores devem restaurar o spy de `setTimeout` após o teardown.
8. Uma mudança dos delays de produção exige revisar este helper e sua cobertura, para não transformar cleanup em no-op silencioso.

## 6. Casos-limite, riscos e análise crítica

- **Lista literal de delays:** qualquer mudança funcional de 600/4_000/18_000 pode fazer o helper parar de rastrear o recurso sem lançar erro.
- **Cobertura assimétrica:** somente 4_000 possui assertion direta de captura/cancelamento; 600 e 18_000 são usados indiretamente.
- **Spy separado do cancelamento:** chamar o cancelador não executa `mockRestore`; esquecer `jest.restoreAllMocks()` em um novo consumidor deixa `global.setTimeout` espionado.
- **Timers não alvo continuam reais:** um consumidor que criar outro timer longo continua podendo manter o worker aberto; esse comportamento é intencional para não esconder timers desconhecidos.
- **Snapshot sem ordenação contratual:** `getPendingDelays()` segue a ordem de inserção do Map, mas nenhum contrato deveria depender disso sem assertion explícita.
- **Firing natural:** o Map é limpo antes de chamar o callback, reduzindo risco de ownership stale mesmo se o callback lançar, porém esse branch não tem teste focal localizado.

## 7. Solicitações ao auditor

### 105-001 — TEST_REQUIRED — ACCEPTED
- **Encontrado:** O helper tem prova direta focal para o delay de 4_000 ms por marker-anchor-real.test.js, mas não existe teste dedicado que prove os branches de 600 ms e 18_000 ms, a delegação de delays não rastreados e a remoção automática do Map quando um callback rastreado dispara naturalmente.
- **Arquivo relacionado:** `tests/unit/background/track-background-delay-timers.test.js`
- **Evidência atual:** marker-anchor-real.test.js executa o background real, verifica getPendingDelays() contendo 4_000, verifica o retorno do cancelamento contendo 4_000 e getPendingCount() igual a zero. process-finalize-real/lifecycle-alarms-real/regex-escape/message-handlers-real instalam e cancelam o tracker durante teardown, mas sem assertions focais equivalentes para 600/18_000.
- **Evidência ausente:** Assertions diretas para captura/cancelamento de 600 e 18_000, passagem transparente de delay fora da allowlist, propagação dos argumentos do callback, remoção de pending após disparo natural e comportamento idempotente de cancelamentos repetidos.
- **Por que é necessário:** Se os delays reais de finalizeJob mudarem ou um branch do helper regredir, o teardown pode deixar handles vivos e reintroduzir worker leak sem que a regressão de 4 s detecte o problema.
- **Ação solicitada:** Adicionar um teste unitário focal para o helper, usando a implementação real e controlando timers, cobrindo 600, 4_000 e 18_000, um delay não rastreado, firing natural e cancelamento repetido. Não copiar a lógica do helper para o teste.
- **Evidência esperada:** Assertions sobre getPendingDelays/getPendingCount, retorno do cancelador, callback/args e ausência de handle rastreado após disparo/cancelamento para todos os três delays.
- **Ação esperada do auditor:** Confirmar a lacuna e criar a cobertura em alteração separada, sem tratar o uso indireto atual como prova dos branches não assertados.
- **Regressão possível:** Handles de 600 ms ou 18 s podem sobreviver ao teardown, atrasar o encerramento do worker Jest ou executar callbacks contra mocks já restaurados.
- **Impacto:** Confiabilidade e isolamento de suítes de background; a cobertura direta existente de 4 s continua válida.
- **Severidade:** NORMAL

## 8. Fonte integral exata

O bloco abaixo reproduz integralmente o blob `b7860da7879c9bac7714f3ba7d33a7024b586c0d`. O arquivo possui newline terminal; a quebra imediatamente antes da fence de fechamento pertence ao fonte.

```javascript
'use strict';

// Recursos reais de background que usam timers deliberadamente atrasados:
// - finalizeJob: fechamento da aba em 600 ms;
// - handleMarkerAndShow: remoção do arquivo-âncora em 4 s;
// - finalizeJob: limpeza da conversa/aba em 18 s.
// Esses timers pertencem ao caso de teste que acionou o fluxo e não podem
// sobreviver ao teardown quando a suíte termina como a última de um worker.
function trackBackgroundDelayTimers() {
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const pending = new Map();

    jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay !== 600 && delay !== 4_000 && delay !== 18_000) {
            return realSetTimeout(callback, delay, ...args);
        }
        const timer = realSetTimeout(() => {
            pending.delete(timer);
            callback(...args);
        }, delay);
        pending.set(timer, delay);
        return timer;
    });

    const cancelTrackedBackgroundDelayTimers = () => {
        const cancelledDelays = Array.from(pending.values());
        for (const timer of pending.keys()) realClearTimeout(timer);
        pending.clear();
        return cancelledDelays;
    };

    // Expostos somente para regressões de ownership: permitem provar que o
    // recurso atrasado pertence ao caso atual sem esperar 4/18 segundos reais.
    cancelTrackedBackgroundDelayTimers.getPendingDelays = () => Array.from(pending.values());
    cancelTrackedBackgroundDelayTimers.getPendingCount = () => pending.size;

    return cancelTrackedBackgroundDelayTimers;
}

module.exports = { trackBackgroundDelayTimers };
```

## 9. Cobertura documental por faixas contíguas

As 42 posições são cobertas pelas 10 faixas abaixo, em ordem, sem lacunas ou sobreposição.

### Bloco 01 — linhas/posições 1–1
Ativa strict mode no módulo CommonJS de helper.

### Bloco 02 — linhas/posições 2–8
Documenta a razão operacional do helper: três recursos reais do background deixam timers longos (600 ms, 4 s e 18 s) que pertencem ao caso de teste e não devem sobreviver ao teardown do último teste executado por um worker.

### Bloco 03 — linhas/posições 9–12
Abre `trackBackgroundDelayTimers`, captura as implementações reais de `setTimeout`/`clearTimeout` antes do spy e cria um `Map` privado para associar handles rastreados aos respectivos delays.

### Bloco 04 — linhas/posições 13–17
Instala um `jest.spyOn(global, 'setTimeout')`. Apenas delays exatamente iguais a 600, 4_000 ou 18_000 entram no rastreamento; qualquer outro delay é delegado imediatamente ao `setTimeout` original com callback e argumentos intactos.

### Bloco 05 — linhas/posições 18–24
Para um delay rastreado, agenda o callback usando o timer real. O wrapper remove o próprio handle de `pending` antes de executar o callback com os argumentos originais, registra handle→delay no Map e devolve o mesmo handle ao código sob teste.

### Bloco 06 — linhas/posições 25–31
Define o cancelador retornado ao teste: fotografa os delays pendentes, limpa cada handle com o `clearTimeout` original, esvazia o Map e devolve a lista de delays cancelados para permitir assertions de ownership.

### Bloco 07 — linhas/posições 32–36
Expõe dois métodos de observabilidade no próprio cancelador: `getPendingDelays()` devolve snapshot dos delays e `getPendingCount()` devolve o tamanho atual do Map. Eles existem explicitamente para regressões de ownership sem esperar segundos reais.

### Bloco 08 — linhas/posições 37–39
Retorna a função canceladora e fecha o helper. O spy continua ativo até o consumidor executar `jest.restoreAllMocks()`; o próprio cancelador não restaura o spy.

### Bloco 09 — linhas/posições 40–41
Exporta `trackBackgroundDelayTimers` como API CommonJS pública deste helper de testes.

### Bloco 10 — linhas/posições 42–42
Posição correspondente ao newline terminal do arquivo; não contém instrução adicional.

## 10. Verificação final desta Bíblia

- SHA do fonte reconfirmado: `b7860da7879c9bac7714f3ba7d33a7024b586c0d`.
- Fonte integral incorporada: **sim**.
- Linhas textuais: **41**; newline terminal: **sim**; posições documentadas: **42/42**.
- Faixas documentais: **10**, contíguas e sem overlap.
- Prova direta focal localizada para o timer de 4 s; 600 ms e 18 s mantidos explicitamente como lacuna de prova específica.
- `audit_request` 105-001 permanece **ACCEPTED** no state canônico para teste dedicado do helper; a request é dívida de teste não bloqueante para fidelidade documental.
- Nenhum código, teste, fixture, workflow ou config externo foi alterado.

> **Correção pós-adversarial:** somente o delay de 4_000 ms possui gate estático específico na regression matrix; 600 ms e 18_000 ms são fatos do source/fluxos funcionais, enquanto a captura focal desses delays pelo helper continua lacuna explícita.

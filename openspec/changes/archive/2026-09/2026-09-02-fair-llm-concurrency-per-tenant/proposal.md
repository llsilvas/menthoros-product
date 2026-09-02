**Tamanho:** S · **Trilha:** Fast

## Why

O `LlmConcurrencyLimiter` é um `Semaphore` **global por JVM e não-justo**. Com as 10 assessorias
fundadoras disparando o lote na mesma janela (domingo à noite), os lotes são atendidos por ordem de
chegada: a prova de carga de `refactor-llm-call-outside-transaction` (`LotePlanosFundadorasIT`)
mediu a 1ª assessoria terminando em **37%** do tempo total e a 10ª em **97%** — escalado para 80 s
por plano, a última espera ~2,6× o tempo da primeira sem saber por quê.

E o **"gerar" individual não passa pelo limiter**: `PlanoTreinoController` chama
`planoService.gerarPlanoTreino` direto. Dois efeitos: a concorrência interativa contra o provedor é
ilimitada, e — pior no sentido oposto — quando o limiter for o gargalo, um coach refazendo o plano
de **um** atleta durante o lote da vizinha esperaria a fila inteira por um plano de 80 s.

Depois do refactor, `llm-concorrencia` vai para 8–10 (tier 3 da OpenAI). Subir o número sem
justiça por assessoria só faz a fila andar mais rápido na mesma ordem injusta.

## What Changes

Só o backend, três pontos, nenhum contrato de API:

1. **`LlmConcurrencyLimiter` ganha três faixas**, todas por configuração:
   - **Global** — `app.batch-plan.llm-concorrencia` (existente): teto contra o provedor.
   - **Por assessoria no lote** — `app.batch-plan.llm-concorrencia-por-tenant` (novo, default
     **2**): `ConcurrentHashMap<UUID, Semaphore>`; o lote adquire o permit do tenant **antes** do
     global (nunca segurar o global esperando o do tenant). Com 10 lotes, global 10 e cap 2,
     **5 assessorias progridem simultaneamente** em vez de 1–2.
   - **Reserva interativa** — `app.batch-plan.llm-reserva-interativa` (novo, default **1**):
     permits do global que o lote não pode ocupar. Implementação: **o lote encadeia três
     aquisições, sempre nesta ordem — tenant → capacidade do lote (`llm-concorrencia − reserva`) →
     global**; o interativo adquire **só o global**. O lote também consome o global — sem isso, o
     teto contra o provedor deixaria de valer com lote e interativo juntos. Sem ciclo de espera
     possível: o interativo nunca segura tenant/capacidade, e o lote nunca adquire fora da ordem.
2. **`BatchPlanProcessor`** passa a chamar `executarLote(tenantId, supplier)`.
3. **O "gerar" interativo passa pelo limiter**: o wrap acontece na fase 2 do
   `PlanoServiceImpl.gerarPlanoTreino` (em volta da chamada ao LLM, nunca das transações), como
   `executarInterativo(supplier)`. Para o lote não adquirir duas vezes, o limiter é
   **reentrante por thread** (ThreadLocal): se a thread já segura permits do lote, o wrap
   interativo é no-op.

## Non-Goals

- Fila com prioridade, aging ou preempção — cap por tenant + reserva bastam para 10 assessorias.
- Limitar os listeners `@Async` (análise de treino, foco semanal) — é a change
  `refactor-async-llm-listeners-outside-transaction`.
- Coordenação entre réplicas — o limiter continua por JVM, como hoje (uma réplica no Railway).
- Mudar `llm-concorrencia` de valor — operação, não código.

## Critérios de aceite

- **CA1 — justiça entre assessorias.** Dados 10 lotes de 10 atletas disparados juntos com global 10
  e cap por tenant 2, quando o lote roda, então (a) **nenhum tenant passa de 2 em voo** e (b) em
  algum instante **≥ 5 assessorias distintas** têm geração em voo simultânea — ambos medidos por
  contadores dentro do stub do LLM, determinísticos. A razão última/primeira (baseline 2,6×;
  esperado ≤ 1,6×) é **métrica reportada no log**, não asserção — duração absoluta em CI flakeia.
- **CA2 — interativo não espera o lote.** Dado o lote saturando todos os permits que lhe cabem,
  quando um "gerar" interativo chega, então ele entra no LLM sem esperar o lote drenar (o permit
  reservado está livre por construção).
- **CA3 — sem dupla aquisição.** Dada uma geração vinda do lote, quando ela passa pela fase 2,
  então nenhum permit adicional é adquirido (reentrância por thread).
- **CA4 — regressão zero.** `./mvnw clean test` e os ITs de plano
  (`LotePlanosFundadorasIT`, `PlanoGeracaoConcorrenteIT`) verdes; a vazão total do lote não cai
  (o cap por tenant redistribui, não reduz — o global continua o teto).

## Métrica de sucesso

Na régua da `LotePlanosFundadorasIT`: razão última/primeira assessoria ≤ 1,6× (hoje 2,6×) com a
mesma vazão total. Efeito prático: nenhum treinador fundador espera meia hora olhando um spinner
porque clicou por último.

## Impact

**Código:** `LlmConcurrencyLimiter` (o grosso), `BatchPlanProcessor` (uma linha),
`PlanoServiceImpl.gerarPlanoTreino` (wrap da fase 2), `application.yml` (duas chaves novas).
**Sem migration, sem contrato de API.** Risco baixo: erro aqui degrada para o comportamento atual
(fila global), não para indisponibilidade. **Rollback sem deploy:** setar
`BATCH_PLAN_LLM_CONCORRENCIA_POR_TENANT` ≥ `llm-concorrencia` e `BATCH_PLAN_LLM_RESERVA_INTERATIVA=0`
neutraliza as duas faixas novas; reverter o PR remove tudo.

## Open Questions & Assumptions

- **Premissa:** cap 2 por tenant e reserva 1 são bons defaults para 10 × 10; ambos são env vars e
  ajustáveis sem deploy.
- **Decisão explícita (achado do Codex no DoR):** o retry do `PlanoResilienceService` (até 2
  tentativas, deadline 100 s) roda **dentro** do permit. É deliberado: o permit protege o provedor,
  e um retry é outra chamada ao provedor; liberá-lo entre tentativas deixaria o global estourar sob
  falha. Custo aceito: sob falha estrutural lenta, um permit fica ocupado por até o deadline.
- **Premissa:** o interativo não precisa de cap por tenant — é um humano clicando; se um dia um
  tenant abusar do endpoint, o problema é rate-limiting HTTP, não este limiter.
- **Em aberto (não bloqueia):** o mapa de semáforos por tenant não é limpo — cresce com o nº de
  assessorias vivas na JVM (dezenas), o que é irrelevante; registrar caso um dia haja multidão de
  tenants.

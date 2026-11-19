**Tamanho:** M · **Trilha:** Full

> **Ticket 3** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 3b, 7) e decisões vivem
> no épico; as decisões abaixo (DoR de 2026-11-18) prevalecem sobre o texto do épico onde divergem.

## Status

- ready-for-agent (2026-11-18): ticket 2 (`add-season-plan-generate-tracer`) arquivado (backend #245,
  front #226). DoR de 2026-11-18 voltou NOT READY (spec-reviewer + Codex, convergentes); as lacunas
  foram decididas com o usuário na mesma data (T1–T9 abaixo).

## Why

A proposta do tracer só tem fases e volume. Para o treinador aprovar, ela precisa ter o que ele de fato
planeja — taper, longão, descargas, provas preparatórias — e dizer onde está fora do razoável.

## What Changes

Tasks do épico: **2.3 (descargas e pico antes do taper), 2.4, 2.5, 2.7, 2.8 (só regressão, T1), 2.9,
2.10 (menos calibração), 2.11, 2.12, 7.2 (escopo reduzido, T8), 7.5**.

- `SeasonPlanner` ganha descargas 3:1, longão por fração do volume e a curva da `TaperStrategy` no lugar
  dos fatores provisórios do tracer.
- Provas preparatórias ancoradas como marcos (`tb_season_week.milestone_race_id`).
- `SeasonPlanValidator` (em `domain/planner`, puro) com quatro regras brandas.
- Resposta da temporada ganha `milestones[]` e `validations[]`; a aba ganha o mapa da temporada, a coluna
  de longão e os painéis de marcos e validações.
- **Sem migration:** `deload`, `long_run_km` e `milestone_race_id` já existem em `tb_season_week` (V117).
- **Rollback:** a flag `season-plan.enabled` do ticket 2; desligada, nada disto é alcançável.

## Decisões do DoR (2026-11-18)

- **T1 — Compressão fica a do ticket 2.** O corte ordenado por CTL de D9 (Base preservada abaixo de CTL
  40) prevalece sobre a "compressão proporcional" do épico; a task vira teste de regressão e o texto do
  épico (`season-plan-macrocycle/spec.md`, "comprimidas proporcionalmente") é corrigido para D9.
- **T2 — Contrato.** `SeasonPlanResponseDto` (GET `current` e POST) ganha:
  - `milestones[]`: `{weekIndex, provaId, name, date, distance}` (`distance` no formato objeto de
    `DistanciaProva`, como no resto da API), ordenado por `weekIndex`.
  - `validations[]`: `{rule, severity, weekIndex, measured, limit, message}`; `rule` ∈ `RAMP`,
    `LONG_RUN_SHARE`, `DELOAD_CADENCE`, `TAPER_DEPTH`; `severity` = `WARN`.
  - Listas vazias, nunca ausentes. Validações **recalculadas a cada leitura** a partir das semanas
    gravadas, sem persistência. `deload` e `longRunKm` deixam de ser sempre `false`/`null` (D1 do ticket 2).
  - Marcos vêm de `milestone_race_id` gravado na geração; prova depois cancelada ou excluída sai da lista.
- **T3 — Limites do validador** (constantes no código, como D14; nenhum bloqueia aprovação):
  - `RAMP`: volume da semana > 1,10 × o da anterior. Não conta a semana que volta de uma descarga.
  - `LONG_RUN_SHARE`: `longRunKm` > 0,30 × volume da semana.
  - `DELOAD_CADENCE`: mais de 4 semanas seguidas de BASE/BUILD sem `deload`; alerta na 5ª.
  - `TAPER_DEPTH`: em semana TAPER/RACE_WEEK, a redução sobre o pico difere em mais de 10 p.p. da que a
    `TaperStrategy` dá para a segunda-feira daquela semana; também dispara quando uma semana TAPER começa
    antes da janela da distância (7/14/21 dias, `TaperStrategy`) — acrescentado no `/qa` de 2026-11-19.
  - Igualdade no limite não dispara; volume anterior zero não avalia `RAMP`.
- **T4 — Descarga e longão no motor.**
  - Descarga 3:1: a 4ª, 8ª, … semana contada dentro de BASE+BUILD tem TSS e volume × 0,80 sobre o valor
    da rampa daquela semana; a semana seguinte volta ao valor da rampa (a descarga não rebaixa a rampa).
    Nunca em PEAK, TAPER ou RACE_WEEK. Se a semana de descarga tem marco, a descarga passa para a semana
    seguinte quando ela ainda é BASE/BUILD; senão, é pulada.
  - Longão = min(0,28 × volume da semana, teto da distância), em km com 1 casa; teto por `distanciaKm`:
    ≤ 5,5 → 12; ≤ 10,5 → 16; ≤ 21,5 → 21; acima → 32. Na descarga, × 0,75. RACE_WEEK sem longão (`null`).
- **T5 — Taper.** `TAPER_FACTOR`/`RACE_WEEK_FACTOR` (0,60/0,45) saem. Em cada semana TAPER e RACE_WEEK,
  TSS = pico × (1 − `TaperStrategy.resolverReducaoPercentual(dias)`), com `dias` = data da prova − segunda
  da semana e pico = TSS da última semana de PEAK (ou da última semana de subida, se não há PEAK), fixo.
  Aplicado uma vez. Quantas semanas de taper existem continua vindo do template; a janela por distância
  da `TaperStrategy` só entra no validador. Maratona no domingo: reduções ≈ 38%, 46% e 56% (20, 13 e
  6 dias) — os 218/164 do ticket 2 mudam.
- **T6 — Provas preparatórias.** Prova do atleta, no tenant, com `provaAlvo = false`, não `CANCELADA`, data
  dentro do horizonte e ao menos 7 dias antes da alvo. Marco na semana que contém a data. Duas na mesma
  semana: fica a de maior distância (empate: a mais cedo). Só marca; não altera TSS nem volume (o
  pós-prova é da integração semanal).
- **T7 — POST repetido** continua devolvendo a PROPOSED existente sem rodar o motor. Propostas do tracer
  ficam como estão (flag desligada em produção, nenhuma real); descartar é do ticket de aprovação.
- **T8 — Mapa com escopo reduzido.** Faixa de fases + volume planejado por semana, marcando semana atual,
  descargas e marcos. Realizado e previsto ficam para o ticket da integração semanal. A tabela de semanas
  é a alternativa textual do mapa.
- **T9 — Métrica.** Log estruturado na geração com a contagem de alertas por regra.

## Critérios de aceite

- **Dado** uma maratona a 16 semanas (domingo) e CTL 40, **quando** a proposta é gerada, **então** as
  semanas 4 e 8 de BASE+BUILD têm `deload = true` com TSS e volume 20% abaixo da rampa, e a semana
  seguinte a cada uma volta ao valor da rampa.
- **Dado** a mesma proposta, **então** cada semana fora de RACE_WEEK tem `longRunKm` = min(28% do volume,
  32), a de descarga 25% menor, e a RACE_WEEK tem `longRunKm = null`.
- **Dado** as semanas TAPER e RACE_WEEK, **então** o TSS de cada uma é o pico × (1 − redução da
  `TaperStrategy` na segunda-feira), aplicado uma vez (teste com os valores exatos).
- **Dado** uma meia a 6 semanas, **quando** gera, **então** o corte de fases é o de D9 e
  `shortPreparation = true` (regressão do ticket 2).
- **Dado** uma prova não alvo, não cancelada, dentro da janela e 7+ dias antes da alvo, **quando** gera,
  **então** ela aparece em `milestones[]` e em `milestone_race_id` da semana que contém a data; duas na
  mesma semana deixam só a mais longa.
- Cada regra do validador tem um caso que dispara e um no limite que não dispara; a proposta é gravada
  com ou sem alerta.
- **Dado** um POST e depois um GET, **então** `milestones[]` e `validations[]` são iguais nos dois
  (round-trip HTTP → banco → GET, em `*IT`).
- **Dado** uma proposta com alertas e marcos, **quando** o treinador abre a aba, **então** vê o mapa com
  descargas e marcos, a coluna de longão, o painel de marcos e o de validações; sem alertas, o painel diz
  que a proposta está dentro dos limites.

## Métrica de sucesso

% de propostas geradas com ao menos um alerta, por regra (T9), lido do log `season-plan.generated`. Alto
em `DELOAD_CADENCE` ou `TAPER_DEPTH` indica motor desalinhado do validador; alto em `RAMP` em preparação
curta é esperado.

## Open Questions & Assumptions

- Assumido: severidade única `WARN`; graduar fica para quando houver dado de aprovação (ticket 5).

## Bloqueado por

- Nada — ticket 2 arquivado em 2026-11-18.

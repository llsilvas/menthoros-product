**Tamanho:** M · **Trilha:** Full

> **Ticket 8** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 5, 10, 10b, 10c) e
> decisões vivem no épico.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-approve-athlete-view` (ticket 5). Não
  depende dos tickets 6 e 7.

## Why

A temporada aprovada passa a ser insumo da geração do plano semanal: a fase e a posição no ciclo chegam
ao prompt no lugar dos valores legados, e a divergência contra a heurística atual é medida em shadow.
A carga **muda de base** (o alvo da semana da temporada no lugar de `ctlAlvo * 7`), mas as reduções por
fadiga existentes continuam valendo por cima — a temporada é teto, não piso (Decisão 5 do épico). O
enforcement pelo motor fica para o ticket 9.

## What Changes

Tasks do épico: **1.10, 5.1–5.5, 5.10, 5.10a, 5.12, 5.16, 5.17**. Refinado no DoR de 2026-11-22
(spec-reviewer + Codex, ambos NOT READY) com o vocabulário que os tickets 1–5 deixaram no código.

**Vocabulário real** (os tickets 1–5 nasceram em inglês, ADR-0007): temporada = `PlanoTreino` com
`seasonStatus = SeasonPlanStatus.ACTIVE`; semana = `SeasonWeek` (`tb_season_week`: `week_index`,
`week_start`, `phase`, `target_tss`, `target_volume_km`, `long_run_km`, `deload`, `milestone_race_id`);
flag `season-plan.enabled`. Nada de `ATIVO`, `SemanaPlanejada` ou `macrociclo.enabled`.

**Gate:** tudo desta change só age com `season-plan.enabled=true` **e** temporada `ACTIVE` com uma
`SeasonWeek` cujo `week_start` = `ctx.semanaInicio` (a segunda-feira resolvida uma vez em
`PlanGenerationContextLoader`). Sem isso — flag desligada, sem temporada ativa, semana fora da temporada
ou temporada só `PROPOSED` — o fluxo é byte a byte o atual. Consultas por `tenant_id` (`SeasonWeekRepository`).

- **Migration V119** em `tb_plano_semanal`: `season_week_id UUID NULL REFERENCES tb_season_week(id) ON
  DELETE SET NULL` e `target_deviation_pct NUMERIC(6,1) NULL`, com índice em `season_week_id`. Colunas
  nullable, sem backfill, não destrutiva. `PlanoSemanal` ganha `seasonWeekId` e `targetDeviationPct`.
- **`SeasonWeekSnapshot`** (record em `domain/planner`): `seasonWeekId`, `weekIndex`, `totalWeeks`, `phase`, `targetTss`,
  `targetVolumeKm`, `longRunKm`, `deload`, próximo marco (nome e data, opcional). Carregado no
  `PlanGenerationContextLoader` como `Optional<SeasonWeekSnapshot>` no `PlanGenerationContext` e mapeado
  para o `PlannerInputSnapshot` em `PlannerShadowService.mapToSnapshot`.
- **Fase, nos dois caminhos**, pela ordem lesão > pós-prova > temporada > heurística:
  - **Prompt (motor desligado, default):** a fase da temporada substitui só a fase derivada por dias até a
    prova (`PeriodizacaoPromptFormatter.determinarFasePreparacao`). Com lesão ativa (`InjuryPolicyResolver`
    com `phaseOverride` presente) ou pós-prova, o bloco de posição no ciclo declara que essa fase prevalece
    sobre a da temporada nesta semana. **Pós-prova** = prova realizada nos 7 dias anteriores a
    `ctx.semanaInicio`, a mesma janela do `PeriodizationPlanner` (`PeriodizationPlanner.java:64`), num
    helper compartilhado pelos dois caminhos. O `resolverPosProva` do builder
    (`PlanoTreinoPromptBuilder.java:550`, só o dia imediatamente anterior) continua alimentando o bloco
    legado de pós-prova, intocado.
  - **Motor (`planner-engine.enabled` ou `shadow`):** `PlannerEngine` resolve
    `injuryPolicy.phaseOverride()` > pós-prova > fase da `SeasonWeekSnapshot` > `PeriodizationPlanner`.
- **Alvo de TSS no prompt:** base = `SeasonWeek.targetTss` no lugar de `ctlAlvo * 7`; as reduções de
  `calcularTssAlvoAjustado` (×0,55 / ×0,75 por TSB e semanas de progressão contínua) aplicam-se sobre essa
  base. As linhas de CTL/TSB/ramp rate que seguem o alvo (`PlanoTreinoPromptBuilder.java:408` em diante)
  ficam; a linha "reduzido X% por semana regenerativa" passa a comparar com a base da temporada.
- **Bloco de posição no ciclo** (no `PeriodizacaoPromptFormatter`, Task 0.3 do épico), emitido **no
  lugar** da seção "PERIODIZAÇÃO E FASE ATUAL" legada (`PlanoTreinoPromptBuilder.java:387`): "Semana N de M
  da temporada · fase · alvo de TSS · volume alvo (km) · longão previsto (km) · semana de descarga (sim/não) ·
  próximo marco (nome, data) ou 'sem marco à frente'".
- **Métrica** `season-plan.phase.divergence.count` com tags `seasonPhase`, `heuristicPhase` e `tenant`, só
  com `planner-engine.shadow=true`, no mesmo ponto da `planner.phase.divergence.count` existente
  (`PlannerShadowService.java:409`).
- **Persistência:** `seasonWeekId` e `targetDeviationPct = round1((Σ tssPlanejado dos treinos persistidos −
  targetTss) / targetTss × 100)`, calculado no `PlanGenerationPersister` **depois** das transformações dos
  treinos (redistribuição/prova garantida). Treino sem `tssPlanejado` conta 0. `targetTss` nulo ou ≤ 0 →
  `targetDeviationPct` nulo (o `seasonWeekId` é gravado mesmo assim).

## Critérios de aceite

- **Dado** temporada `ACTIVE` com semana para `ctx.semanaInicio`, **quando** o plano semanal é gerado,
  **então** o prompt traz o bloco "Semana N de M…" com fase, alvo e próximo marco, e **não** traz a seção
  "PERIODIZAÇÃO E FASE ATUAL" legada nem um "TSS Alvo Semanal" baseado em `ctlAlvo * 7`.
- **Dado** temporada `ACTIVE` e TSB entre `TSB_SOBRECARGA` e `TSB_FADIGA_MODERADA`, sem progressão contínua
  em alerta, **quando** o prompt é montado, **então** o "TSS Alvo Semanal" = `targetTss × 0,75`.
- **Dado** temporada `ACTIVE` e TSB abaixo de `TSB_SOBRECARGA` **ou** semanas de progressão contínua ≥
  `SEMANAS_PROGRESSAO_ALERTA`, **então** o "TSS Alvo Semanal" = `targetTss × 0,55` (mesma prioridade de
  `PeriodizacaoPromptFormatter.java:323`).
- **Dado** temporada `ACTIVE` e prova realizada no sábado anterior a `ctx.semanaInicio` (ou lesão ativa),
  **quando** o prompt é montado, **então** o bloco declara que a fase de pós-prova (ou de lesão) prevalece
  sobre a da temporada; o mesmo caso com o motor ligado resolve POST_RACE.
- **Dado** motor ligado, lesão ativa e temporada `ACTIVE`, **quando** a fase é resolvida, **então** vale a
  fase de lesão; com pós-prova e sem lesão, a de pós-prova; sem as duas, a da temporada.
- **Dado** um atleta sem temporada `ACTIVE`, ou `season-plan.enabled=false`, ou semana fora da temporada,
  **quando** o prompt é montado, **então** ele é byte a byte igual ao de hoje: motor desligado contra o
  golden existente (`PlanoTreinoPromptBuilderGoldenTest`, sem skeleton, data e locale congelados); motor
  ligado contra um golden **novo, gravado em `develop` antes de qualquer mudança** (com skeleton, que
  acrescenta os slots em `PlanoTreinoPromptBuilder.java:441`).
- **Dado** um plano persistido com temporada, **então** `seasonWeekId` aponta para a semana e
  `targetDeviationPct` segue a fórmula acima; com `targetTss` nulo, `targetDeviationPct` é nulo.
- **Dado** `planner-engine.shadow=false`, **então** a métrica de divergência não é produzida.

## Non-goals

- Enforcement de carga pelo motor (`LoadTargetResolver` com `targetTss` como baseline, sem step-back nem
  taper duplicado) e compliance contra a temporada — ticket 9 (`add-season-plan-load-enforcement`)
- Flag de shadow por tenant — o shadow é global (`PlannerShadowService.java:76`), ver rollout
- Mudar a resposta do LLM ou a validação do plano gerado

## Onde mora o bloco de posição

Task 0.3 do épico, resolvida em 2026-11-15: no `PeriodizacaoPromptFormatter`.
`migrate-plan-prompt-to-skills` está em 0/37 e adiada para depois de F4; quando entrar, herda o bloco.
Se ela for retomada antes desta fatia, reabrir esta decisão.

## Métrica de sucesso

Contagem de divergência de fase entre temporada e heurística no tenant do piloto (shadow), filtrada pela
tag `tenant`. Sinal para o ticket 9: divergência alta em semanas de BUILD/PEAK indica template incoerente
com a heurística antes de a temporada virar teto de carga.

## Bloqueado por

- `add-season-plan-approve-athlete-view` (ticket 5) — arquivado em 2026-11-21.

## Dependências e rollout

- Kill-switch: `season-plan.enabled` (já existe). Desligada, o prompt e a persistência voltam ao legado.
- `planner-engine.shadow` é **global**: ligá-lo liga a observação para todos os tenants (é só observação,
  não muda o plano). O piloto é isolado na leitura, pela tag `tenant` da métrica — decidido no DoR de
  2026-11-22, sem flag por tenant.

## Riscos e rollback

- **A carga que o LLM vê muda** para atletas com temporada ativa: a base passa a ser o `targetTss` da
  semana. As reduções por fadiga continuam; a rampa de CTL e o cold-start não estão no caminho do prompt
  com o motor desligado (são do motor) — o `targetTss` já nasce limitado pela rampa do `SeasonPlanner`.
- **Prompt, fase e alvo persistido divergirem:** os três leem a mesma `SeasonWeekSnapshot` do contexto,
  carregada uma vez.
- Rollback: `season-plan.enabled=false`; as colunas novas ficam nulas. Revert do PR remove o código; a
  migration é aditiva.

## Open Questions & Assumptions

- **Decidido pelo founder no DoR (2026-11-22):** alvo = temporada + reduções por fadiga; precedência no
  prompt e no motor; shadow global com tag de tenant.

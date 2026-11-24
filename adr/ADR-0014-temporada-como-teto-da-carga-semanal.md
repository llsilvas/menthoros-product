# ADR 0014 - Temporada como teto da carga semanal, não piso

## Status
Aceito

## Data
2026-11-24

## Decisores
Founder (Leandro), na spec de `add-season-plan-load-enforcement` (ticket 9 do épico do plano de
temporada)

## Contexto

Até o ticket 8 (`add-season-plan-weekly-context`) a semana da temporada aprovada pelo treinador era só
contexto: o prompt mostrava fase, `targetTss` e longão previstos, mas o alvo de carga do skeleton vinha do
`LoadTargetResolver` reativo (`ctl × 7` ajustado pela progressão, taper da `TaperStrategy`) e o compliance
media o plano contra esse alvo. Resultado: dois alvos para a mesma semana, e o prompt podendo anunciar um
número que os slots do skeleton não somavam.

Usar o `targetTss` da temporada como alvo direto também não serve. A temporada é escrita semanas antes,
sobre um CTL previsto; se o atleta perdeu treinos, adoeceu ou está em calibração, seguir o número da
temporada empurra uma rampa que o corpo dele não suporta.

## Opções consideradas

1. Temporada só como contexto (status quo do ticket 8).
2. Temporada como alvo obrigatório: o skeleton usa o `targetTss` sem cortes.
3. Temporada como base e teto: o alvo parte do `targetTss` e só pode descer, pelas proteções de segurança
   que já existem.

## Decisão

Opção 3, atrás da flag `season-plan.enforcement.enabled`. Precedência: **segurança > temporada >
progressão reativa**. Com a flag ligada e a semana com `targetTss > 0`, o alvo é calculado nesta ordem:

1. **Base:** `base = targetTss` da semana. Progressão reativa positiva e step-back não se aplicam: a
   temporada já tem rampa e descargas.
2. **Redução por fase:** `RECOVERY` ou `POST_RACE` → `alvo = base × 0,5`.
3. **`REDUZIR` da progressão:** `alvo = min(alvo, ctl × 7 × (1 + ajuste))`, com `ajuste ≤ 0`.
4. **Teto de rampa:** `alvo = min(alvo, 7 × (ctl + 8))`, sempre.
5. **Cold-start:** com `calibrationStage` presente, os passos 3 e 4 não se aplicam e
   `alvo = min(alvo, alvoColdStart)` (modelo do ADR-0012).
6. **Teto da temporada:** `alvo = min(alvo, base)`. O alvo nunca passa do `targetTss`.

Decisões derivadas:

- **Sem compensação de semana perdida.** Semana realizada abaixo do alvo não aumenta a seguinte; o CTL mais
  baixo só pode reduzir o teto de rampa.
- **Sem segundo taper.** Com a flag ligada, a `TaperStrategy` não roda: a curva de taper já está no
  `targetTss` da temporada.
- **Banda centrada no alvo resolvido** (±10%, ±25% em cold-start), para um corte de segurança não gerar
  violação contra o próprio corte. O skeleton registra `seasonTargetTss` e o `seasonCutReason` do último
  passo que baixou o alvo.
- **Longão:** `LONGAO_DIVERGENTE_DA_TEMPORADA` compara o LONGO do plano com o `longRunKm` (tolerância
  `long-run-tolerance-pct`, default 15%). O `LONGO_ACIMA_TETO` (40% do alvo) é suspenso para o longão que
  segue o previsto, que já passou pelo `LONG_RUN_SHARE` na aprovação da temporada; fora da tolerância ou
  sem distância, volta.
- A semana da temporada nunca é alterada pelo planner. Replanejar por desvio acumulado é o ticket 10.

## Consequências

### Positivas
- Um alvo só por semana: skeleton, prompt e compliance usam o mesmo número.
- O plano do treinador vira limite superior real, sem abrir mão das proteções de carga existentes.
- O delta entre alvo e plano aprovado (`season-plan.approved.deviation.abs.pct`) mede quanto o treinador
  corrige o que foi gerado.

### Negativas / Trade-offs
- Temporada desatualizada (CTL real muito abaixo do previsto) gera semanas sempre cortadas pelo teto de
  rampa até o replanejamento existir; o skeleton registra `TETO_RAMPA` para tornar isso visível.
- Suspender o `LONGO_ACIMA_TETO` afrouxa uma proteção, limitada ao longão dentro da tolerância.
- Compliance mais barulhento: a chave nova pode mandar mais planos para revisão; a métrica
  `planner.compliance.violation.count{key}` mede a taxa por regra antes de ligar em mais tenants.

## Plano de revisão

Reavaliar quando o replanejamento por desvio (ticket 10) existir, ou se a taxa de `TETO_RAMPA` ou de
`LONGAO_DIVERGENTE_DA_TEMPORADA` mostrar que a temporada costuma estar fora da realidade do atleta.

## Referências
- `openspec/changes/add-season-plan-load-enforcement/proposal.md`.
- ADR-0011 (composição determinística de sessões por fase) e ADR-0012 (modelo de carga do cold-start e
  redução de RECOVERY), que continuam válidos.
- `apps/menthoros-backend`: `domain/planner/LoadTargetResolver.java` (`resolveSeason`),
  `domain/planner/PlannerEngine.java`, `domain/compliance/SkeletonComplianceChecker.java`.

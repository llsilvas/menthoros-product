## 1. Flag e contexto

- [ ] 1.1 Flag `season-plan.enforcement.enabled` (default `false`, env `SEASON_PLAN_ENFORCEMENT_ENABLED`) e `season-plan.enforcement.long-run-tolerance-pct` (default `15`) no `application.yml`; a flag chega ao `PlannerEngine` pelo `PlannerInputSnapshot` (épico 5.11b)
  - verify: teste do `PlannerShadowService.mapToSnapshot` com a flag ligada e desligada
- [ ] 1.2 `keySessions` no `SeasonWeekSnapshot` (preenchido pelo `SeasonWeekContextResolver`) e linha "Sessões-chave" no bloco de posição no ciclo do `PeriodizacaoPromptFormatter` (épico 5.6, reduzido)
  - verify: `SeasonWeekContextResolverTest` + `PeriodizacaoPromptFormatterTest` (com e sem sessões-chave); golden do prompt atualizado só nessa linha

## 2. Alvo de carga

- [ ] 2.1 `WeeklyLoadTarget` com `seasonTargetTss` e `seasonCutReason` nulos, mantendo os construtores atuais (épico 5.8)
  - verify: compila sem mudar os testes existentes do planner
- [ ] 2.2 `LoadTargetResolver`: caminho da temporada com os 6 passos da proposal (base, redução por fase, `REDUZIR`, rampa, cold-start, teto da temporada), banda ±10%/±25% sobre o alvo resolvido e `seasonCutReason` do passo mais restritivo (épico 5.7, 5.9)
  - verify: `LoadTargetResolverTest` com os casos dos critérios de aceite: corte por rampa 620→546, progressão acima da temporada, semana perdida, `RECOVERY`/`POST_RACE` sobre a base, `REDUZIR`, cold-start com piso acima da temporada, descarga sem step-back, alvo nunca acima do `targetTss`
- [ ] 2.3 `PlannerEngine`: com a flag e a semana elegível, usa o caminho da temporada e não chama `aplicarTaperSeAplicavel`; sem temporada ou com a flag desligada, caminho legado intacto (épico 5.7)
  - verify: `PlannerEngineTest` — taper da temporada sem segunda redução; flag desligada igual ao comportamento atual; atleta sem temporada idêntico (regressão 5.16)

## 3. Compliance

- [ ] 3.1 `distanciaKm` no `GeneratedSessionSnapshot` e nos dois mappers do `PlannerShadowService` (DTO do LLM e `TreinoPlanejado`) (épico 5.11a)
  - verify: teste dos dois mappers com e sem distância
- [ ] 3.2 Chave `LONGAO_DIVERGENTE_DA_TEMPORADA` e suspensão do `LONGO_ACIMA_TETO` no `SkeletonComplianceChecker.checkPostRedistribution`, com a semana da temporada e a tolerância chegando pelo skeleton/contexto; só com a flag ligada (épico 5.11)
  - verify: `SkeletonComplianceCheckerTest` — 24 km vs 20 (viola), 23 km (passa, limite), nenhum `LONGO` com longão previsto (viola), vários `LONGO` (o de maior distância), `LONGO` sem distância (não avalia, teto de 40% avaliado), longão previsto acima de 40% do alvo sem `LONGO_ACIMA_TETO`, 30 km com as duas violações, flag desligada sem a chave nova
- [ ] 3.3 Estágio 2 do `PlanGenerationPersister`: `planner.compliance.violation.count` com tag `key` e log `INFO` das violações, independente do shadow (épico 5.11)
  - verify: teste do persister com `SimpleMeterRegistry` e `planner-engine.shadow=false` — plano fora da banda nasce `FAILED` + revisão, sem 422, e o contador da chave sobe

## 4. Delta da aprovação

- [ ] 4.1 `PlanoReviewServiceImpl.aprovarTransicao`: com `season_week_id` e `targetTss > 0`, registra `season-plan.approved.deviation.pct` (tag `origem`) e log `season-plan.week-approved` com o delta e o `target_deviation_pct`; sem migration; independente da flag (épico 5.13)
  - verify: teste do serviço — 400 alvo e 360 aprovado registra −10 com `origem=COACH`; auto-aprovação registra com `AUTO_CONFIANCA_ALTA`; sem semana da temporada não registra

## 5. Integração e fechamento

- [ ] 5.1 IT da geração com temporada ativa e `planner-engine.enabled=true`: flag ligada (alvo cortado pela rampa, `TaperStrategy` ausente, violação de longão persistida em revisão) e flag desligada (igual ao ticket 8) (épico 5.14, 5.15)
  - verify: IT novo ou extensão do `PlanoSemanaTemporadaIT`
- [ ] 5.2 `ADR-0014` "Temporada como teto da carga semanal, não piso" em `menthoros-product/adr/` e entrada no `INDEX.md` (épico 10.4)
  - verify: ADR referencia ADR-0011 e ADR-0012; ordem dos 6 passos igual à da proposal
- [ ] 5.3 Validar: `./mvnw clean verify`

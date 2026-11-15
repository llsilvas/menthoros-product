## 1. Alvo de carga

- [ ] 1.1 Sessões-chave e longão da semana no `SessionCompositionResolver` (épico 5.6)
- [ ] 1.2 `LoadTargetResolver` com `tssAlvo` como baseline, sem step-back; `PlannerEngine` sem segundo taper; tetos e cold-start por cima (épico 5.7)
- [ ] 1.3 Desvio e motivo no `WeekPlanSkeleton` quando uma proteção corta o alvo (épico 5.8)
- [ ] 1.4 Alvo resolvido nunca acima do `tssAlvo` (épico 5.9)

## 2. Compliance

- [ ] 2.1 `distanciaKm` no `GeneratedSessionSnapshot` e no mapper (épico 5.11a)
- [ ] 2.2 `TSS_FORA_DA_FAIXA` centrado no `tssAlvo`; `LONGAO_DIVERGENTE_DO_MACRO`; `LONGO_ACIMA_TETO` suspenso quando o longão segue o previsto (épico 5.11)
- [ ] 2.3 Flag `macrociclo.enforcement.enabled` (épico 5.11b)

## 3. Delta e testes

- [ ] 3.1 Delta entre o alvo da temporada e o plano aprovado pelo treinador (épico 5.13)
- [ ] 3.2 Testes do resolver e do engine (épico 5.14)
- [ ] 3.3 Testes de compliance (épico 5.15)

## 4. Fechamento

- [ ] 4.1 ADR: temporada como teto, não piso; precedência segurança > temporada > progressão (épico 10.4)
- [ ] 4.2 Validar: `./mvnw clean test`

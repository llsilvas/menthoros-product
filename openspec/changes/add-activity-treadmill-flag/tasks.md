# Tasks — add-activity-treadmill-flag

## 0. Gates

- [x] 0.1 `product-reviewer` → Refine (2026-11-09): card Esteira antes da série, sem `VirtualRun`,
  gate numérico para a Curva. Incorporado.
- [x] 0.2 Pre-mortem Codex (2026-11-09): `INDOOR_RUNNING` não comprova esteira. Incorporado (D2).
- [ ] 0.3 DoR: `spec-reviewer` e Codex em `/implement init`

## 1. Backend

- [ ] 1.1 `FitParseServiceImpl`: ler `SessionMesg.getSubSport()` e expor `FitSessionData.esteira`
  (`TREADMILL` → `true`); validar a premissa com 1 `.fit` real de esteira do pilot
  verify: fixture sintética `TREADMILL` → `true`; `INDOOR_RUNNING`, nulo e a fixture real outdoor
  (`corrida-15km-16laps.fit`) → `false`; arquivo real de esteira, se houver → `true`
- [ ] 1.2 Migration `V115__Add_esteira_to_treino_realizado.sql`:
  `esteira BOOLEAN NOT NULL DEFAULT false` (aditiva)
  verify: Flyway sobe em Testcontainers
- [ ] 1.3 `FitTreinoPersister` grava `esteira`; `IntervalsIcuActivityMapper` grava `true` só para
  `Treadmill`
  verify: CA3 com os quatro `type` suportados
- [ ] 1.4 `esteira` em `TreinoRealizadoOutputDto` via `TreinoMapper`
  verify: CA4 no teste do mapper
- [ ] 1.5 Validação: `./mvnw clean verify`

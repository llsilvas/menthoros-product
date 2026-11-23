## 1. Backend — volume de partida e motor com fases explícitas

- [x] 1.1 V121: `tb_plano_treino.initial_volume_km NUMERIC(6,1)` nulo; `PlanoTreino.initialVolumeKm`; a geração grava o volume resolvido (escala 1); `criarRascunho` copia da ativa; `SeasonPlanResponseDto.initialVolumeKm`
  - verify: `SeasonPlanServiceImplTest` (geração grava o volume) + `SeasonPlanAdjustIT` (geração → aprovação → rascunho mantém `initialVolumeKm`)
- [x] 1.2 `SeasonPlanner.plan` com semanas por fase explícitas (sem `ajustar`), mesma curva de TSS, descarga, longão e marcos
  - verify: `SeasonPlannerTest` — fases explícitas respeitadas; com as fases do template, mesmas semanas que a sobrecarga atual

## 2. Backend — recálculo (épico 3.5, 3.6, 4.6, 4.7)

- [ ] 2.1 `SeasonPlanAdjustmentService.recalculate` + `SeasonPlanRecalculateInputDto` + `POST /{id}/recalculate`: lock da prova, só rascunho (409), travadas e `COACH` intactas, demais `ENGINE`, `keySessions` preservado, `initial_volume_km` e picos atualizados
  - verify: `SeasonPlanAdjustmentServiceImplTest` (`Recalculate`) — o cenário de 12 semanas do critério de aceite; semana `COACH` intacta; `keySessions` preservado; marcos do rascunho reusados (`milestoneRaceId` igual, descarga adiada por marco passado continua adiada); recalcular duas vezes com a mesma entrada dá as mesmas semanas
- [ ] 2.2 422 do recálculo: soma de fases + 1 ≠ total; fase negativa; `startVolumeKm` ausente, ≤ 0, > 500 ou com mais de uma casa; `initialCtl` nulo ou ≤ 0; fase divergente em semana travada; total de semanas diferente (prova remarcada)
  - verify: testes parametrizados por regra, nada persistido em cada 422
- [ ] 2.3 Controller: `@PreAuthorize`, `@RequireTenant`, `@Operation`/`@ApiResponses` (200, 403, 404, 409, 422)
  - verify: `SeasonPlanControllerTest` (`Recalculate`)

## 3. Backend — diff e métrica (épico 3.7, 4.9)

- [ ] 3.1 `GET /{id}/diff` → `List<SeasonPlanDiffDto>` (`weekIndex`, `field`, `before`, `after`, `source`), só para rascunho (409), por `weekIndex`, campos `phase`, `targetVolumeKm`, `targetTss`, `longRunKm`, `deload`, `keySessions`
  - verify: teste unitário do diff (lista vazia; um campo; vários campos numa semana; `BigDecimal` com escalas diferentes não gera falso positivo) + `SeasonPlanControllerTest`
- [ ] 3.2 Log `season-plan.version-approved` com `changedWeeks` e `coachWeeks`
  - verify: teste do `SeasonPlanVersioning`/serviço com captura de log ou contagem exposta
- [ ] 3.3 IT: recálculo + diff + aprovação ponta a ponta; outra assessoria 403; recálculo na ACTIVE 409
  - verify: `SeasonPlanAdjustIT`
- [ ] 3.4 Validar: `./mvnw clean verify` + OpenAPI com os dois endpoints novos

## 4. Frontend (épico 7.9, 7.10, 7.11)

- [ ] 4.1 Tipos e serviço: `initialVolumeKm`, `SeasonPlanDiffEntry`, `recalcular`, `buscarDiff`; hook `useSeasonAdjustment` carrega o diff com o rascunho e o recarrega depois de salvar semana e recalcular
  - verify: testes do hook (carrega, recarrega, guard de rota trocada)
- [ ] 4.2 Bloco "Parâmetros": semanas por fase com soma ao vivo, volume de partida pré-preenchido, "Recalcular" desabilitado com soma divergente; diálogo de confirmação com as semanas a regenerar
  - verify: teste de componente (soma, desabilitado, lista de semanas na confirmação, 422 com mensagem)
- [ ] 4.3 Tabela: valor anterior riscado e origem nas células alteradas; bloco "Alterações" com o diff
  - verify: teste de componente do diff (vazio, um campo, origem)
- [ ] 4.4 409 na aprovação: mensagem de conflito, motivo mantido, "Descartar e recomeçar" (descarta e cria rascunho da ativa nova)
  - verify: teste da página (409 mantém o motivo; ação navega para o rascunho novo)
- [ ] 4.5 e2e: recalcular preservando a semana editada e ver o diff antes de aprovar
  - verify: `tests/e2e/coach/season-plan.spec.ts`
- [ ] 4.6 Validar: `npm run lint && npm run build && npm run test:run` + e2e do coach

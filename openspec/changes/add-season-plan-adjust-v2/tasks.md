## 1. Modelo

- [x] 1.1 Migration `V120__add_base_season_plan_to_plano_treino.sql`: `base_season_plan_id UUID NULL` com FK para `tb_plano_treino(id) ON DELETE SET NULL` e índice; `PlanoTreino.baseSeasonPlanId`
  - verify: o IT de temporada sobe com Flyway em Postgres limpo (feito, `SeasonPlanIT` 11/11)

## 2. Backend — rascunho, edição, aprovação

- [ ] 2.1 Regra de semana travada (concluída / em andamento / da prova-alvo, `America/Sao_Paulo`) como função pura no domínio, com o motivo
  - verify: teste unitário com fronteiras (segunda, domingo, prova no domingo, marco preparatório não trava)
- [ ] 2.2 `createDraft(atletaId, seasonPlanId)` + `POST .../{id}/draft` (épico 3.1, 4.4): trava a prova antes de ler; PROPOSED `version+1`, `baseSeasonPlanId`, cópia das semanas (com `keySessions`); idempotente (200) com rascunho da mesma base; 409 se a base não é ACTIVE ou há PROPOSED de outra base/v1
  - verify: unitário do serviço (feliz, idempotente, base não ACTIVE, outro PROPOSED) + 201/200/409 no IT
- [ ] 2.3 `updateWeek(atletaId, seasonPlanId, weekIndex, input)` + `PATCH .../{id}/weeks/{weekIndex}` (épico 4.5, 3.8): trava a prova antes de ler; só PROPOSED (409); travada → 422; fase só BASE/BUILD/PEAK/TAPER (422); `valueSource = COACH`; recalcula `peakVolumeKm`/`maxLongRunKm`; nulo não muda, `keySessions` vazio limpa
  - verify: unitário (feliz, travada 422 por motivo, fase inválida, não-PROPOSED 409, weekIndex inexistente 404, pico recalculado)
- [ ] 2.4 Aprovar v2 (épico 3.2, 3.3, 3.4, 4.10): `approve` aceita `reason`; com base: motivo obrigatório ≤ 255 (422), gate de calibração mantido, base ainda ACTIVE e `version = base+1` (409), recópia das semanas travadas da ativa, recálculo de pico/longão, arquiva a ativa e ativa o rascunho com flush nessa ordem; v1 sem base inalterada; log `season-plan.version-approved`
  - verify: unitário (sem motivo, em branco, 255 ok, 256 → 422, base trocada 409, calibração 422, recópia do passado) + IT da troca atômica
- [ ] 2.5 Descartar: `DELETE .../{id}` trava a prova antes de ler; PROPOSED com base → ARCHIVED "rascunho descartado", 204; fora disso (já ACTIVE, v1) 409
  - verify: unitário + IT
- [ ] 2.6 Leitura: `GET .../{id}`; DTO com `version`, `baseSeasonPlanId`, `openDraftId` (no `current`) e, por semana, `keySessions`, `locked`/`lockReason`; o `/me` continua só ACTIVE
  - verify: unitário do mapeamento + IT (rascunho invisível ao atleta)
- [ ] 2.7 Controller: rotas com `@PreAuthorize` TECNICO/ADMIN, `@Operation`/`@ApiResponses`, DTO de entrada com Bean Validation
  - verify: `@WebMvcTest` (403 ATLETA, 400 com `fields` para Bean Validation, 404 flag)
- [ ] 2.8 IT `SeasonPlanAdjustIT`: criar ajuste (duas chamadas simultâneas → uma linha), editar futura e reabrir `keySessions`, travada 422, aprovar sem motivo 422, aprovar com motivo (v1 ARCHIVED, v2 ACTIVE, passado idêntico), descartar depois de aprovar 409, plano semanal vinculado à v1 continua na v1, base trocada 409, outro tenant 404
  - verify: `./mvnw clean verify` verde

## 3. Frontend

- [ ] 3.1 Tipos e cliente: `SeasonPlan` com `version`, `baseSeasonPlanId`, `openDraftId`, `locked`/`lockReason`; `SeasonPlanService` com `criarAjuste`, `buscarPorId`, `atualizarSemana`, `aprovar(reason)`, `descartar`
  - verify: `bun run build`
- [ ] 3.2 Aba Temporada: "Ajustar temporada" / "Continuar ajuste" na ACTIVE, navegando para a página de ajuste
  - verify: teste de componente do `SeasonTabPanel`
- [ ] 3.3 `CoachSeasonAdjustPage` (épico 7.8, 7.10): tabela com travas e motivo, edição por linha, alertas, motivo obrigatório, confirmação de aprovação, descartar, erros 409/422
  - verify: teste de componente da tabela editável (travada não editável, salvar linha, aprovar bloqueado sem motivo)
- [ ] 3.4 E2E (épico 7.14): abrir o ajuste, editar uma semana futura, aprovar com motivo e ver a v2 na aba (rotas mockadas, como `tests/e2e/coach/season-plan.spec.ts`)
  - verify: Playwright verde
- [ ] 3.5 Validar: `bun lint && bun run build && bun test:run`

## 4. Fechamento

- [ ] 4.1 Validar backend: `./mvnw clean verify`

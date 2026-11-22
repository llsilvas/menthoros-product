## 1. Backend

- [x] 1.1 Gate de calibração no `SeasonPlanServiceImpl.generate`: ler `calibracaoIniciadaEm` pelo `baselineRepository` logo depois de `buscarAtleta` e antes de travar a prova e do retorno idempotente; não nula **e** `planner-engine.shadow` ligado → `DomainRuleViolationException` (422) com o motivo (dizendo que destrava quando o atleta conclui a calibração) — na implementação a condição ficou só `shadow`: a avaliação da graduação depende só dele (`PlannerShadowService.java:125`), `enabled` sozinho não gradua ninguém
  - verify: teste unitário do serviço com baseline em calibração lança 422 e não chama `planoTreinoRepository.save`; com o shadow em `false`, gera
- [x] 1.2 Mesmo gate no `approve`, antes de ativar
  - verify: teste unitário: proposta `PROPOSED` + atleta em calibração → 422, status inalterado
- [x] 1.3 IT (`SeasonPlanCalibrationGateIT`): POST de geração para atleta em calibração (semana 1 e semana 5+) → 422 e zero linhas em `tb_plano_treino`/`tb_season_week`; com proposta existente → 422; aprovação → 422; atleta sem linha de baseline e com `calibracaoIniciadaEm` nula → fluxo atual
  - verify: os cenários passam no Failsafe
- [x] 1.4 Descrição do 422 em `SeasonPlanController` (gerar e aprovar) cita a calibração — `docs/api/openapi.json` **não** regenerado: está parado desde `f8cedea` e não tem nenhuma rota de `season-plans`; regenerar traria um diff alheio à change
- [x] 1.5 Validar: `./mvnw clean verify` — 353 ITs e 534 classes de teste unitário, 0 falhas (2026-11-22)

## 2. Frontend

- [x] 2.1 Hook `useAthleteCalibration` (feature coach) consulta `OnboardingService.obterStatusCalibracao(atletaId)` do atleta selecionado; descarta resposta de atleta anterior; erro → trata como fora de calibração
  - verify: teste do hook: 200 → status; 204 → null; erro → null; troca de atleta não aplica resposta antiga
- [x] 2.2 `SeasonTabPanel`: com status de calibração (limitação aceita: ver "Riscos e rollback" do proposal), "Gerar temporada" desabilitada e o motivo com a semana (`weekNumber`) visível
  - verify: teste de componente: em calibração → botão desabilitado + texto com a semana; sem status → habilitado
- [x] 2.3 Validar: `npm run lint && npm run build && npm run test:run` — 3039 testes; E2E `tests/e2e/coach/season-plan.spec.ts` com cenário novo de calibração (4/4)

## 3. Spec do épico

- [x] 3.1 Substituir o cenário "Atleta sem baseline confiável" em `add-season-plan-macrocycle/specs/season-plan-macrocycle/spec.md` pela recusa (Q9)
  - verify: nenhum cenário do épico pede geração durante a calibração

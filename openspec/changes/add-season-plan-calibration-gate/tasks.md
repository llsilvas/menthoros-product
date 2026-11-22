## 1. Backend

- [ ] 1.1 Gate de calibração no `SeasonPlanServiceImpl.generate`: ler `calibracaoIniciadaEm` pelo `baselineRepository` logo depois de `buscarAtleta` e antes de travar a prova e do retorno idempotente; não nula **e** `planner-engine.shadow || planner-engine.enabled` → `DomainRuleViolationException` (422) com o motivo (dizendo que destrava quando o atleta conclui a calibração)
  - verify: teste unitário do serviço com baseline em calibração lança 422 e não chama `planoTreinoRepository.save`; com os dois flags em `false`, gera
- [ ] 1.2 Mesmo gate no `approve`, antes de ativar
  - verify: teste unitário: proposta `PROPOSED` + atleta em calibração → 422, status inalterado
- [ ] 1.3 IT (`SeasonPlan*IT`): POST de geração para atleta em calibração (semana 1 e semana 5+) → 422 e zero linhas em `tb_plano_treino`/`tb_season_week`; com proposta existente → 422; aprovação → 422; atleta sem linha de baseline e com `calibracaoIniciadaEm` nula → fluxo atual
  - verify: os cenários passam no Failsafe
- [ ] 1.4 Descrição do 422 em `SeasonPlanController` (gerar e aprovar) cita a calibração; regenerar `docs/api/openapi.json`
  - verify: diff do `openapi.json` só na descrição
- [ ] 1.5 Validar: `./mvnw clean verify`

## 2. Frontend

- [ ] 2.1 `useSeasonPlan` (ou hook vizinho na feature coach) consulta `OnboardingService.obterStatusCalibracao(atletaId)` do atleta selecionado; descarta resposta de atleta anterior; erro → trata como fora de calibração
  - verify: teste do hook: 200 → status; 204 → null; erro → null; troca de atleta não aplica resposta antiga
- [ ] 2.2 `SeasonTabPanel`: com status de calibração (limitação aceita: ver "Riscos e rollback" do proposal), "Gerar temporada" desabilitada e o motivo com a semana (`weekNumber`) visível
  - verify: teste de componente: em calibração → botão desabilitado + texto com a semana; sem status → habilitado
- [ ] 2.3 Validar: `npm run lint && npm run build && npm run test:run`

## 3. Spec do épico

- [ ] 3.1 Substituir o cenário "Atleta sem baseline confiável" em `add-season-plan-macrocycle/specs/season-plan-macrocycle/spec.md` pela recusa (Q9)
  - verify: nenhum cenário do épico pede geração durante a calibração

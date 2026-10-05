## 1. Backend

- [ ] 1.1 Adicionar campo `tssPlanejado` (Integer, nullable) em `AtletaPerfilCoachOutputDto.TreinoPlanejadoResumoDto` (`dto/output/AtletaPerfilCoachOutputDto.java`)
  - Validação: `./mvnw -q compile`
- [ ] 1.2 Passar `tp.getTssPlanejado()` no construtor do DTO em `CoachAthleteProfileServiceImpl.resolverPlanoVigente` (`services/impl/CoachAthleteProfileServiceImpl.java`)
  - Validação: `./mvnw clean test -Dtest=CoachAthleteProfileServiceImplTest`
- [ ] 1.3 Atualizar/criar teste cobrindo `tssPlanejado` presente e nulo no `planoVigente`
  - Validação: `./mvnw clean test -Dtest=CoachAthleteProfileServiceImplTest`
- [ ] 1.4 Rodar suíte completa do backend
  - Validação: `./mvnw clean verify`

## 2. Frontend

- [ ] 2.1 Adicionar `tssPlanejado?: number | null` em `TreinoPlanejadoResumoDto` (`src/types/AtletaPerfilCoach.ts`)
  - Validação: `npx tsc --noEmit`
- [ ] 2.2 Renderizar TSS em `TreinoCard` (`src/features/coach/components/CurrentWeekPlan.tsx`) quando `tssPlanejado != null`, seguindo o padrão de `DetalheTreinoDialog.tsx`
  - Validação: `npm run lint && npm run build`
- [ ] 2.3 Atualizar/criar testes de `CurrentWeekPlan` cobrindo TSS presente e ausente
  - Validação: `npm run test -- CurrentWeekPlan`
- [ ] 2.4 Rodar suíte completa do frontend
  - Validação: `npm run lint && npm run build && npm run test`

## 3. Fechamento

- [ ] 3.1 Validar manualmente no ambiente local: atleta com plano vigente mostrando TSS no painel do coach
- [ ] 3.2 Atualizar este `tasks.md` com o que foi entregue vs. adiado antes de arquivar

## 1. Backend

- [x] 1.1 Adicionar campo `tssPlanejado` (Integer, nullable) em `AtletaPerfilCoachOutputDto.TreinoPlanejadoResumoDto` (`dto/output/AtletaPerfilCoachOutputDto.java`)
  - Validação: `./mvnw -q compile` ✅
- [x] 1.2 Passar `tp.getTssPlanejado()` no construtor do DTO em `CoachAthleteProfileServiceImpl.resolverPlanoVigente` (`services/impl/CoachAthleteProfileServiceImpl.java`)
  - Validação: `./mvnw clean test -Dtest=CoachAthleteProfileServiceImplTest` ✅ 28/28
- [x] 1.3 Atualizar/criar teste cobrindo `tssPlanejado` presente e nulo no `planoVigente`
  - Validação: `./mvnw clean test -Dtest=CoachAthleteProfileServiceImplTest` ✅
- [x] 1.4 Rodar suíte completa do backend
  - Validação: `./mvnw clean verify` ✅ BUILD SUCCESS, 204 testes de integração, 0 falhas (commit `86964d7`, branch `fix/coach-planned-trainings-tss`)

## 2. Frontend

- [x] 2.1 Adicionar `tssPlanejado?: number | null` em `TreinoPlanejadoResumoDto` (`src/types/AtletaPerfilCoach.ts`)
  - Validação: `npx tsc -b` ✅
- [x] 2.2 Renderizar TSS em `TreinoCard` (`src/features/coach/components/CurrentWeekPlan.tsx`) quando `tssPlanejado != null`, seguindo o padrão de `DetalheTreinoDialog.tsx`
  - Validação: `npm run lint && npm run build` ✅
- [x] 2.3 Atualizar/criar testes de `CurrentWeekPlan` cobrindo TSS presente e ausente
  - Validação: `npx vitest run CurrentWeekPlan` ✅ 10/10
- [x] 2.4 Rodar suíte completa do frontend
  - Validação: `npm run lint && npm run build` ✅ (commit `fdf6303`, branch `fix/coach-planned-trainings-tss`)

## 3. Fechamento

- [ ] 3.1 Validar manualmente no ambiente local: atleta com plano vigente mostrando TSS no painel do coach
  - Adiado: ambiente local do backend aponta para Postgres do homelab, não verificado nesta sessão; testes automatizados (unit + integração) cobrem o contrato ponta a ponta.
- [ ] 3.2 Atualizar este `tasks.md` com o que foi entregue vs. adiado antes de arquivar

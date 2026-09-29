# Tasks — standardize-card-migration

Branch `feature/standardize-card-migration` (front). Depende de `standardize-card-foundation` já
mergeada em `develop` (branch a partir de `develop` atualizada, não da branch da foundation).

**Ordem:** as decisões abertas (0) resolvem antes de qualquer migração, porque afetam quais tasks
existem. Migrações (1-8) são independentes entre si — podem sair em qualquer ordem ou paralelizar por
agente/sessão, desde que cada uma seja commit isolado. Fechamento (9) é o último passo.

## 0. Decisões abertas do proposal
- [ ] 0.1 Decidir destino de `AtividadePendenteCard` (migra para `Card` ou recebe só tokens corretos mantendo `Accordion`) — registrar a decisão aqui antes da task 7
- [ ] 0.2 Decidir se `TodayHeroCard` vira variante `hero` oficial de `Card` ou `sx` extra sobre `flat` — registrar antes da task 8
- [ ] 0.3 Decidir destino de `AIInsightCard`/`WeeklyReviewCard`/`CurrentWeekPlan` — registrar antes de qualquer uma das três precisar migrar (podem ficar fora do escopo desta change se a decisão for "sem chrome é padrão válido")

## 1. SectionCard
- [ ] 1.1 Migrar `features/coach/components/SectionCard.tsx` para `<Card variant="flat">` + `<CardHeader divider>`
  - verify: testes existentes verdes; `npm run test:run`

## 2. DiagnosisCard
- [ ] 2.1 Migrar `features/coach/components/DiagnosisCard.tsx` para `<Card variant="flat">` + `<CardHeader>`
  - verify: testes existentes verdes

## 3. ReadinessCard
- [ ] 3.1 Migrar `features/athlete/components/ReadinessCard.tsx` para `<Card variant="flat">`
  - verify: testes existentes verdes

## 4. WeekOverviewCard
- [ ] 4.1 Migrar `features/athlete/components/WeekOverviewCard.tsx` para `<Card variant="flat">` + `<CardHeader>`
  - verify: testes existentes verdes

## 5. ProgressBlockCard
- [ ] 5.1 Migrar `features/athlete/components/progress/ProgressBlockCard.tsx` para `<Card variant="flat">` + `<CardHeader>`
  - verify: testes existentes verdes

## 6. KudosCard
- [ ] 6.1 Migrar `features/athlete/components/KudosCard.tsx` para `<Card variant="glass">`
  - verify: testes existentes verdes

## 7. AtividadePendenteCard (conforme decisão 0.1)
- [ ] 7.1 Aplicar a decisão de 0.1
  - verify: testes existentes verdes

## 8. TodayHeroCard (conforme decisão 0.2)
- [ ] 8.1 Aplicar a decisão de 0.2
  - verify: testes existentes verdes

## 9. TreinoCard
- [ ] 9.1 Migrar `components/features/planos/TreinoCard.tsx` para `<Card variant="glass" stateColor={isRealizado ? 'success' : isPerdido ? 'danger' : undefined}>`, removendo o `sx` manual de borda/fundo por status
  - verify: testes existentes verdes; `grep -n "}40\|}14\|}1F\|}0F" src/components/features/planos/TreinoCard.tsx` não retorna mais essas ocorrências

## 10. Fechamento
- [ ] 10.1 `grep -rn "borderRadius:\|elevation.card\|glassSx\|surface\[700\]" src/features src/pages src/components --include="*.tsx"` nos arquivos migrados — confirmar que não sobrou estilo literal de card fora de `Card.tsx`/`CardHeader.tsx`
- [ ] 10.2 Validação completa: `npm run lint && npm run build && npm run test:run`
- [ ] 10.3 Navegação manual nas telas afetadas (coach: Inbox, perfil do atleta; atleta: home, progresso, planos) com a skill `run`, print anexado ao relatório da task
- [ ] 10.4 Atualizar `specs/design-system/spec.md` (de `standardize-card-foundation`) se algum cenário novo surgiu (ex.: variante `hero`)

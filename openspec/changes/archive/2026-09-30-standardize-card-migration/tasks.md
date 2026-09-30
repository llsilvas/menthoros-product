# Tasks — standardize-card-migration

Branch `feature/standardize-card-migration` (front). Depende de `standardize-card-foundation` já
mergeada em `develop` (branch a partir de `develop` atualizada, não da branch da foundation).

**Ordem:** as decisões abertas (0) resolvem antes de qualquer migração, porque afetam quais tasks
existem. Migrações (1-8) são independentes entre si — podem sair em qualquer ordem ou paralelizar por
agente/sessão, desde que cada uma seja commit isolado. Fechamento (9) é o último passo.

> Nota de execução (2026-09-30): esta change foi implementada por uma sessão que não tinha lido este
> `tasks.md`/`proposal.md` antes de migrar a maior parte dos cards (PR #134, já mergeada). Por isso há
> divergências de decisão registradas abaixo, resolvidas depois via releitura da spec — não é
> retrabalho cego, é o resultado real bate com o pedido, mas o caminho para 3 dos 9 cards não seguiu o
> que o proposal antecipava. Task 7 (`AtividadePendenteCard`) ficou pendente na primeira rodada e foi
> fechada depois, isolada, em PR própria (#135).

## 0. Decisões abertas do proposal
- [x] 0.1 Decidir destino de `AtividadePendenteCard` — **decisão: manter `Accordion`, não migrar para
  `Card`.** O componente precisa de estado `:hover` + `.Mui-expanded` e de expand/collapse com ARIA
  nativo (lista de reconciliação do coach) — `Card` não modela isso sem reimplementar o accordion à
  mão. Só os valores de cor ad-hoc (`overlayWhite[50]/[30]/[55]`, 30–55% de opacidade, bem mais opaco
  que o resto do app) foram trocados pelos tokens canônicos `content.cardBg`/`cardBgHover`/`cardBorder`
  (8–15%). PR #135.
- [x] 0.2 Decidir se `TodayHeroCard` vira variante `hero` oficial de `Card` ou `sx` extra sobre `flat`
  — **decisão: `sx` extra, não uma variante `hero` dedicada** (gradiente é uso único, conforme a regra
  do próprio proposal). Mas a base não é `flat`: é a variante nova `solid` (ver 0.4 abaixo), com
  `surfaceLevel="panel"` e o gradiente `elevation.panel → elevation.card` via `sx={{ background: ... }}`
  sobrepondo o `backgroundColor` da variante.
- [x] 0.3 Decidir destino de `AIInsightCard`/`WeeklyReviewCard`/`CurrentWeekPlan` — **decisão: "sem
  chrome" é padrão válido, nenhum dos três migra.** Os três renderizam como conteúdo dentro de um card
  já migrado do próprio consumidor (`AIInsightCard` dentro de `DiagnosisCard`; `WeeklyReviewCard`
  dentro de `SectionCard`; `CurrentWeekPlan` não tem chrome de card na raiz). Confirmado lendo os
  consumidores, não just by inspection do próprio arquivo.
- [x] 0.4 **Decisão não prevista no proposal, registrada aqui:** o proposal assumia que
  `ReadinessCard`/`WeekOverviewCard`/`ProgressBlockCard` (e mais 6 cards da Home do atleta não listados
  no proposal original: `TodayCompletedCard`, `TodaySkippedCard`, `TodayFeedbackCard`,
  `FitUploadResultCard`, `IntervalsIcuConnectionCard`, `PostWorkoutFeedbackCard`) iriam para
  `variant="flat"`, aceitando a borda trocar de `surface[700]` (sólida) para `content.cardBorder`
  (translúcida) — ver D3 do `standardize-card-foundation`. Em vez disso, foi criada uma variante nova
  `variant="solid"` (+ prop `surfaceLevel: 'card' | 'panel'`) em `cardStyles.ts`/`Card.tsx` que preserva
  a borda sólida `surface[700]` sobre `elevation.card`/`.panel` — a receita que esses ~10 componentes já
  usavam por cópia. **Por quê:** essa receita é consistente e deliberada em todo `features/athlete`, não
  um desvio isolado como o `TreinoCard` (task 9); trocá-la por `content.cardBorder` seria uma mudança
  visual perceptível na Home do atleta inteira, não uma consolidação neutra. Coberto por testes novos em
  `Card.test.tsx`. Isso substitui a suposição do proposal — não é uma correção de bug, é uma decisão de
  design diferente da antecipada, registrada aqui para não se perder.

## 1. SectionCard
- [x] 1.1 Migrado para `<Card variant="flat">`. **Divergência:** não usa `<CardHeader>` — a barra de
  título em caixa alta (`0.6875rem`, uppercase, `surface[400]`) é um estilo deliberadamente diferente do
  `CardHeader` (título grande, `h3`), documentado no próprio `DiagnosisCard.tsx`. Só o shell externo
  (border/bg/radius) foi migrado; o cabeçalho próprio do `SectionCard` foi preservado.
  - verify: testes existentes verdes ✓ (`npm run test:run`)

## 2. DiagnosisCard
- [x] 2.1 Migrado para `<Card variant="flat">` + `<CardHeader>`, conforme a spec.
  - verify: testes existentes verdes ✓

## 3. ReadinessCard
- [x] 3.1 Migrado para `<Card variant="solid">` (não `flat` — ver decisão 0.4).
  - verify: testes existentes verdes ✓

## 4. WeekOverviewCard
- [x] 4.1 Migrado para `<Card variant="solid">` (não `flat` — ver decisão 0.4). **Divergência:** não
  usa `<CardHeader>` — o cabeçalho tem título + período lado a lado, sem ícone/ação, mais simples que o
  que `CardHeader` oferece; mantido como markup próprio dentro do `Card`.
  - verify: testes existentes verdes ✓

## 5. ProgressBlockCard
- [x] 5.1 Migrado para `<Card variant="solid">` (não `flat` — ver decisão 0.4). **Divergência:** idem
  4.1 — cabeçalho próprio (pergunta + período), sem `<CardHeader>`.
  - verify: testes existentes verdes ✓

## 6. KudosCard
- [x] 6.1 Migrado para `<Card variant="glass">`, conforme a spec.
  - verify: testes existentes verdes ✓

## 7. AtividadePendenteCard (conforme decisão 0.1)
- [x] 7.1 Aplicados os tokens canônicos (`content.cardBg`/`cardBgHover`/`cardBorder`) mantendo
  `Accordion`. PR #135.
  - verify: testes existentes verdes ✓ (não havia teste dedicado antes; nenhum criado — mudança é só de
    token de cor)

## 8. TodayHeroCard (conforme decisão 0.2)
- [x] 8.1 Migrado para `<Card variant="solid" surfaceLevel="panel">` com o gradiente original
  (`elevation.panel → elevation.card`) preservado via `sx`.
  - verify: testes existentes verdes ✓

## 8b. Cards adicionais fora do inventário original do proposal
Auditoria pós-task-6 encontrou mais 6 cards em `features/athlete` com a mesma receita "solid"
(3 deles sem borda nenhuma, radius menor — variante de resultado/confirmação): `TodayCompletedCard`,
`TodaySkippedCard`, `TodayFeedbackCard` (`surfaceLevel="panel"`, mesma família de `TodayHeroCard`), e
`FitUploadResultCard`, `IntervalsIcuConnectionCard`, `PostWorkoutFeedbackCard` (`variant="solid"` só
pelo token de fundo, com `sx={{ border: 'none', borderRadius: 1 }}` — nunca tiveram borda, preservado).
- [x] 8b.1 Migrados os 6, sem mudança visual pretendida — verify: testes existentes verdes ✓

## 9. TreinoCard
- [x] 9.1 Migrado para `<Card variant="glass" stateColor={isRealizado ? 'success' : isPerdido ? 'danger' : undefined}>`,
  exatamente conforme a spec. `sx` manual de borda/fundo por status removido.
  - verify: testes existentes verdes ✓; `grep -n "}40\|}14\|}1F\|}0F" src/components/features/planos/TreinoCard.tsx`
    não retorna mais essas ocorrências ✓ (confirmado)

## 10. Fechamento
- [x] 10.1 `grep` de verificação — confirmado: os arquivos migrados não têm mais `borderRadius:`/
  `elevation.card`/`glassSx`/`surface[700]` literais fora de `cardStyles.ts`/`Card.tsx` (que são o
  próprio pacote compartilhado, onde esses valores devem morar).
- [x] 10.2 `npm run lint && npm run build && npm run test:run` — verdes (228 arquivos, 1919 testes).
- [ ] 10.3 Navegação manual nas telas afetadas (coach: Inbox, perfil do atleta; atleta: home, progresso,
  planos) com a skill `run`, print anexado ao relatório da task — **não executado**: esta sessão não
  tem backend + Keycloak configurados para autenticar como coach/atleta e navegar as telas reais. Fica
  como follow-up de QA visual, não bloqueia o fechamento da change (mesmo tratamento que o `CLAUDE.md`
  do front dá a validação que não pode ser executada: registrar como pendente com o motivo, não
  fingir que rodou).
- [x] 10.4 `specs/design-system/spec.md` — adicionado `ADDED Requirement` para a variante `solid` +
  `surfaceLevel` nesta própria change (`specs/design-system/spec.md` abaixo), já que o spec principal
  (`openspec/specs/design-system/`) ainda não existe — o delta de `standardize-card-foundation` também
  nunca foi sincronizado para lá. Ambos os deltas (foundation + esta migration) precisam de sync numa
  próxima oportunidade; não fiz esse sync aqui para não expandir o escopo desta change.

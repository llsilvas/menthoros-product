# Tasks — consolidate-coach-inbox-tabs

> Repo: `apps/menthoros-front` · Branch: `feature/consolidate-coach-inbox-tabs`
> Frontend-only (Fast track). Sem mudança de API/DB.
> Validar por seção: `npm run lint && npm run build && npm run test:run`.

---

## Seção 0 — Estrutura-alvo (referência, sem código)

Drill-down do atleta passa a ter 3 abas (`TabKey`), todas alimentadas pelo atleta selecionado:

| `TabKey` | Label (PT-BR) | Componente | Conteúdo |
|---|---|---|---|
| `diagnosis` | Diagnóstico | `DiagnosisTabPanel` | próximo treino (resumo) · métricas PMC (carga/monotonia/Forma/ACWR/recuperação) · tendência de carga · adesão semanal · limiares inferidos · sinais de atenção |
| `plan` | Plano | `PlanTabPanel` | `CurrentWeekPlan` real + empty-state honesto |
| `races` | Provas & sugestões | `RacesSuggestionsTabPanel` | provas do atleta · sugestões recentes acionáveis |

Painéis globais (`DashboardInsightsPanel`, `DashboardCalendarPanel`) **não** entram no drill-down.

---

## Seção 1 — Aba Diagnóstico (`DiagnosisTabPanel`)

- [ ] 1.1 Criar `DiagnosisTabPanel` (renomear/evoluir `StatusTabPanel`), **sem o guard global** `if (dashboardInsights)` — sempre renderiza métricas do atleta.
  - verify: selecionar atleta e abrir Diagnóstico mostra os valores daquele atleta (não agregados do roster).
- [ ] 1.2 Incorporar o resumo de **próximo treino** (vindo do `ReviewTabPanel`: título, quando, duração, distância, status) no topo do painel.
- [ ] 1.3 Incorporar **adesão semanal** (conteúdo do `AdherenceTabPanel`: barras por semana).
- [ ] 1.4 Renomear "Notas do treinador" → **"Sinais de atenção"** (read-only, system-generated: `notes`/`suggestedActions`).
- [ ] 1.5 Manter limiares inferidos (`LimiareisCard`) e tendência de carga (já com `loadDelta` real).
  - verify: `npm run build` sem campos órfãos; painel renderiza com dado real e com empty-state quando faltar PMC.

## Seção 2 — Aba Plano (`PlanTabPanel`)

- [ ] 2.1 **Remover o fallback "Ajuste rápido"** inteiro (sliders, "Impacto da alteração" com números fabricados, botões Mover/Duplicar/Substituir).
- [ ] 2.2 Quando não há `planoVigente`, renderizar **empty-state honesto** com CTA para revisão/geração (`onOpenRevisao`), em vez do mock.
  - verify: atleta sem plano mostra empty-state com CTA; atleta com plano mostra `CurrentWeekPlan` editável.
- [ ] 2.3 Remover props agora não usadas do `PlanTabPanel` (drafts de intensidade/distância/duração, `saveAdjustment`) e a fiação correspondente em `CoachInboxPage` + hook `usePlanDraft` se ficar órfão.
  - verify: `npm run lint` sem imports/vars não usados.

## Seção 3 — Aba Provas & sugestões (`RacesSuggestionsTabPanel`)

- [ ] 3.1 Criar `RacesSuggestionsTabPanel` (evoluir `CalendarTabPanel`), **sem o guard global** `if (dashboardCalendar)` e **sem** a grade "Semana atual" hardcoded.
- [ ] 3.2 Renderizar **provas do atleta** (`raceCalendar`) com empty-state quando vazio.
- [ ] 3.3 Mover **"Sugestões recentes"** (do `ReviewTabPanel` → `RecentSuggestionsPanel`, `sugestoesRecentes`) para esta aba.
  - verify: abas mostram provas e sugestões do atleta; nenhum dado global; "Semana atual" inexistente.

## Seção 4 — `CoachInboxPage` (fiação)

- [ ] 4.1 Atualizar `TABS` de 5 para 3 entradas (`diagnosis`/`plan`/`races`) com labels e ícones; atualizar o tipo `TabKey`.
- [ ] 4.2 Atualizar o render dos painéis: `diagnosis → DiagnosisTabPanel`, `plan → PlanTabPanel`, `races → RacesSuggestionsTabPanel`.
- [ ] 4.3 **Parar de passar `dashboardInsights`/`dashboardCalendar`** aos painéis do drill-down (eles são da home do coach). Remover as derivações se ficarem órfãs.
- [ ] 4.4 Remover handlers mortos: `onMarkDone` ("Marcar como concluído"), `feedback` se ficar sem uso.
  - verify: `activeTab` default coerente; nenhuma aba referencia painel global; build verde.

## Seção 5 — Limpeza do view model / adapter / órfãos

> Mapeamento confirmado no código (init): `usePlanDraft` só é usado em `CoachInboxPage`;
> `DashboardInsightsPanel`/`DashboardCalendarPanel` só são usados nos TabPanels do drill-down;
> `decision`/`planStatus` são usados em `QueueRow` (lista) — **não remover**; `lastWorkouts` só em
> adapter + `ReviewTabPanel` + tipo.

- [ ] 5.1 Remover o card "Últimos treinos" e remover `lastWorkouts` de `CoachAthleteRow`, dos dois builders
  do adapter e do `ReviewTabPanel` (sem outros consumidores). Follow-up P1: preencher com treinos realizados
  reais (requer dado no agregador backend).
- [ ] 5.2 **Manter** `decision`/`planStatus` no view model — usados em `QueueRow` (lista de atletas). Apenas
  parar de consumi-los nas abas removidas (ex.: chip de status no antigo "Próximo treino" migra com o resumo).
- [ ] 5.3 Deletar o hook órfão `usePlanDraft` (e sua fiação no `CoachInboxPage`) após remover o "Ajuste rápido".
- [ ] 5.4 Deletar os componentes órfãos `DashboardInsightsPanel` e `DashboardCalendarPanel` após saírem do
  drill-down — o global segue acessível via `CoachInsightsPage` (`/coach/insights`) e `CoachCalendarPage`
  (`/coach/calendar`). Confirmar zero uso restante antes de deletar.
  - verify: `npm run build` e `npm run lint` sem referências quebradas nem imports órfãos.

## Seção 6 — Testes de comportamento

- [ ] 6.1 Teste por aba (Vitest + Testing Library): Diagnóstico renderiza métricas do **atleta** (não global); Plano mostra `CurrentWeekPlan`/empty-state; Provas & sugestões lista provas/sugestões do atleta.
- [ ] 6.2 Teste de regressão: nenhuma string hardcoded de "Semana atual"/"Impacto da alteração" presente; "Marcar como concluído" ausente.
  - verify: `npm run test:run` verde.

## Seção 7 — Validação final

- [ ] 7.1 `npm run lint && npm run build && npm run test:run`.
- [ ] 7.2 `/qa` (frontend-reviewer + clean-code-reviewer) sem achado Critical.
- [ ] 7.3 Marcar itens `[x]` neste `tasks.md`.

## Seção 8 — Entrega

- [ ] 8.1 Commits por seção lógica (Conventional Commits PT-BR).
- [ ] 8.2 Push + PR contra `develop` (não mergear local).

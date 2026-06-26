# Proposal — consolidate-coach-inbox-tabs

**Tamanho · Trilha:** M · Fast (frontend-only, zero mudança de API/DB)

## Why

O drill-down do atleta no `CoachInboxPage` tem 5 abas, mas hoje **falha no seu único trabalho: dar ao coach uma leitura rápida e confiável do atleta para decidir em segundos.**

Auditoria (product-reviewer + leitura do código) encontrou 6 problemas que custam tempo e erodem confiança — o oposto do ROI esperado de um dashboard de triagem:

1. **Abas mostram dados GLOBAIS, não do atleta selecionado.** `CoachDashboard.insights` e `.calendar` são obrigatórios (`Coach.ts:64-65`); os guards `if (dashboardInsights)` (`StatusTabPanel.tsx:85`) e `if (dashboardCalendar)` (`CalendarTabPanel.tsx:15`) nunca são null, então o coach seleciona o João, abre "Status do treinamento" e vê os agregados do roster inteiro. O bloco de métricas PMC por-atleta (carga, monotonia, Forma, ACWR, limiares — entregues em `fix-coach-inbox-metrics`) é **código morto na prática**.
2. **Conteúdo fabricado num painel de decisão.** O fallback "Ajuste rápido" (`PlanTabPanel`) exibe "Impacto da alteração" com números inventados (`draftDistance*4`, fadiga/recuperação hardcoded) e botões Mover/Duplicar/Substituir sem ação. Números falsos onde o coach decide carga é pior que ausência de dado.
3. **Card sempre vazio.** `lastWorkouts` é sempre `[]` no adapter → "Últimos treinos" nunca renderiza nada.
4. **"Semana atual" 100% hardcoded** (`CalendarTabPanel.tsx:79-112`): dias 24-30 fixos, "Fácil 8 km" etc.
5. **Ação fake.** "Marcar como concluído" só dá feedback local, sem persistência — e logar treino não é tarefa do coach.
6. **Redundância e excesso de cliques.** Aderência aparece como tile + aba + critério de ordenação; prova como tile + aba; sugestões na aba Revisão + página dedicada. 5 abas/atleta é muito para quem varre 20+ atletas.

**North Star:** otimizar a rotina do coach (decisão rápida, coach-in-the-loop). A consolidação remove ruído, corrige a incoerência global/atleta e devolve foco às 3 perguntas que o coach faz por atleta: *está bem? precisa ajustar o plano? há decisão pendente?*

## What Changes

Reduzir de **5 abas para 3**, todas alimentadas por dados do **atleta selecionado**, e remover todo conteúdo mock/morto.

### Mapeamento 5 → 3

| Nova aba | Conteúdo (tudo por-atleta, dado real) | De onde vem |
|---|---|---|
| **Diagnóstico** | Resumo do próximo treino · métricas PMC (carga aguda/monotonia/Forma/ACWR/recuperação) · tendência de carga · adesão semanal · limiares inferidos · sinais de atenção (read-only) | funde Status (corrigido p/ atleta) + Adesão + topo de Revisão |
| **Plano** | `CurrentWeekPlan` real (revisar/editar) + empty-state honesto quando não há plano vigente | Ajustes de plano **sem** o fallback "Ajuste rápido" |
| **Provas & sugestões** | Provas do atleta · sugestões recentes acionáveis | Calendário por-atleta (sem mock) + Sugestões da Revisão |

Os painéis globais (`DashboardInsightsPanel`, `DashboardCalendarPanel`) **saem do drill-down** — já existem na home do coach.

### Decisões de escopo (resolvendo o REFINE do product-reviewer)

- **D1 — "Ajuste rápido" removido** (P0). Edição real de plano já vive no `CurrentWeekPlan` / `CoachPlanReviewPage`. Um simulador de impacto só agrega valor com números reais (motor de IA) → fica no radar, não nesta change.
- **D2 — "Marcar como concluído" removido** (P0). Logar treino é do atleta (`manual-training-entry-lightweight`); no drill-down o coach **revisa plano**, não executa treino.
- **D3 — "Notas do treinador" → "Sinais de atenção"** (P0). O conteúdo já é system-generated (`avisos`/`sinaisRecentes`); renomear para refletir a semântica e mover para Diagnóstico. Campo de nota livre editável pelo coach é **feature nova fora de escopo** (radar).
- **D4 — Tile "Próxima prova" mantido** no cabeçalho (glance de 1 linha; complementar à aba, não redundante).
- **D5 — "Últimos treinos": card vazio removido** (P0). Preencher com treinos realizados reais exige novo dado no perfil agregador (backend) → **follow-up P1**.

## Acceptance Criteria

- **CA1** — Ao selecionar um atleta, todas as abas exibem dados **daquele atleta**; nenhum painel global (insights/calendário do roster) aparece no drill-down.
- **CA2** — O drill-down tem exatamente **3 abas**: Diagnóstico, Plano, Provas & sugestões.
- **CA3** — As métricas PMC por-atleta (carga aguda, monotonia, Forma, ACWR, limiares inferidos) **renderizam** na aba Diagnóstico (não mais código morto).
- **CA4** — **Zero conteúdo fabricado/hardcoded**: removidos "Ajuste rápido"/"Impacto da alteração", "Semana atual", "Marcar como concluído" e o card "Últimos treinos" vazio.
- **CA5** — A aba Plano mostra `CurrentWeekPlan` quando há plano vigente e um **empty-state honesto com CTA** quando não há.
- **CA6** — "Sinais de atenção" (ex-"Notas do treinador") aparece na aba Diagnóstico com rótulo coerente com a origem (system-generated).
- **CA7** — `npm run lint`, `npm run build` e `npm run test:run` verdes; testes de comportamento das abas atualizados.

## Success Metric

Cliques/scroll por ciclo de revisão de um atleta reduzidos (5→3 abas; remoção de dialogs e cards mortos). Proxy verificável: nenhuma string/valor hardcoded ou branch global remanescente no drill-down (CA1+CA4).

## Non-Goals

- Simulador de impacto de ajuste com números reais (depende do motor de IA) — radar.
- Campo de notas livres editável pelo coach — feature nova, radar.
- Preencher "Últimos treinos" com treinos realizados reais — requer dado no agregador backend (follow-up P1).
- Qualquer mudança de backend, contrato de API ou schema.

## Riscos e mitigações

- **Risco:** remover abas/ações que algum coach use. **Mitigação:** as ações removidas não persistem nada hoje (fake) ou duplicam fluxos reais existentes (edição de plano, log de treino); nenhum fluxo de valor real é perdido.
- **Risco:** o `CurrentWeekPlan` se tornar a única superfície de plano e faltar caminho quando não há plano. **Mitigação:** empty-state com CTA para gerar/revisar (CA5).
- **Risco:** regressão visual no layout responsivo ao mudar a grade de abas. **Mitigação:** cobrir com testes de render por aba e validar breakpoints.

## Dependências

- Consome o que `fix-coach-inbox-metrics` entregou (helpers `getAcwrZone`/`getTsbFormaTone`, métricas por-atleta) — já mergeado.
- Independente de `coach-training-strain` e `coach-race-form-prediction`; pode ir antes delas.

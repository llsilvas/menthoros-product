## Epic Decomposition

- [x] Decompor `post-workout-debrief` em change próprio → `add-post-workout-debrief` (ativo)
- [x] Decompor `coach-attention-queue` em change próprio → `add-coach-attention-queue` ✅ Sprint 9
- [x] Decompor `weekly-athlete-review` em change próprio → `add-weekly-athlete-review` (ativo)
- [x] Decompor `recommendation-explainability` em change próprio → `add-recommendation-explainability` ✅ Sprint 9
- [x] Decompor `zone-confidence-management` em change próprio → `add-zone-confidence-management` (ativo)

## 1. Capability: post-workout-debrief

- [ ] 1.1 Definir DTO/resultado estruturado de análise pós-treino
- [ ] 1.2 Implementar serviço para comparar planejado vs realizado
- [ ] 1.3 Incorporar análise por `EtapaRealizada` quando disponível
- [ ] 1.4 Persistir score, resumo, riscos e recomendação de sequência
- [ ] 1.5 Expor resultado no fluxo de treino realizado

## 2. Capability: coach-attention-queue

- [ ] 2.1 Definir modelo de item de atenção do treinador
- [ ] 2.2 Consolidar sinais de fadiga, aderência, ausência de estímulos e execução ruim
- [ ] 2.3 Implementar priorização por severidade e urgência
- [ ] 2.4 Expor endpoint/serviço de consulta da fila

## 3. Capability: weekly-athlete-review

- [ ] 3.1 Definir snapshot semanal estruturado do atleta
- [ ] 3.2 Consolidar aderência, carga, fadiga, evolução e foco recomendado
- [ ] 3.3 Persistir ou disponibilizar revisão semanal por atleta
- [ ] 3.4 Integrar revisão ao fluxo de geração do próximo plano
- [x] 3.5 Expor endpoint agregado do dashboard do coach com resumo, fila, roster, calendário e insights

## 4. Capability: recommendation-explainability

- [ ] 4.1 Definir estrutura de explicabilidade para recomendações
- [ ] 4.2 Expor evidências, skill/regra acionada e motivo do ajuste
- [ ] 4.3 Integrar explicabilidade à geração de plano e à análise pós-treino

## 5. Capability: zone-confidence-management

- [ ] 5.1 Definir status de confiança das zonas: confiável, estimada, desatualizada
- [ ] 5.2 Detectar zonas vencidas ou inconsistentes com histórico recente
- [ ] 5.3 Sugerir reavaliação/teste quando necessário
- [ ] 5.4 Expor status de confiança no contexto de prescrição

## 6. Testes e Integração

- [ ] 6.1 Criar testes unitários para análise pós-treino
- [ ] 6.2 Criar testes unitários para priorização da fila de atenção
- [ ] 6.3 Criar testes unitários para revisão semanal
- [ ] 6.4 Criar testes para explicabilidade e status de confiança das zonas
- [x] 6.5 Criar testes unitários para o endpoint agregado do dashboard do coach
- [x] 6.6 Conectar o Inbox do coach ao dashboard agregado em modo parcial
- [x] 6.7 Usar a fila e o roster do dashboard agregado na UI do Inbox
- [x] 6.8 Sincronizar filtros do dashboard com URL e request
- [x] 6.9 Remover filtros locais duplicados e expor paginação do roster no Inbox
- [x] 6.10 Ligar fila de atenção, calendário e insights do dashboard agregado no Inbox
- [x] 6.11 Usar perfil consolidado do atleta para o editor real de plano no Inbox
- [x] 6.12 Ligar aprovar e rejeitar plano do Inbox ao endpoint real de revisão
- [x] 6.13 Substituir `prompt` de rejeição por diálogo inline no Inbox

## 8. Triagem UI do coach (feature/coach-assistant-triage-ui — 2026-06-25)

- [x] 8.1 Endpoint agregado `GET /api/v1/coach/dashboard` com roster paginado, fila de atenção, calendário e insights
- [x] 8.2 `aderenciaPercentual` (últimas 4 semanas) adicionado ao `CoachAtletaResumoDto` e calculado em `montarResumo`
- [x] 8.3 Frontend conectado ao endpoint real via `useCoachDashboard` + `useAthleteProfile`
- [x] 8.4 `CoachInboxPage` decomposto: 3 hooks (`useDashboardFilters`, `usePlanDraft`, `usePlanReview`), 4 adapters, 5 painéis de aba
- [x] 8.5 `nivelExperiencia` exibido no cabeçalho do painel e na aba Revisão do treino
- [x] 8.6 `aderenciaPercentual` exibido na barra de cada atleta na listagem do roster
- [x] 8.7 `React.lazy` em `/coach/inbox` (−47 kB do bundle principal) + `React.memo` nos componentes de lista

## 7. Dados mock pendentes de substituição (follow-up)

- [ ] 7.1 **`CalendarTabPanel` — mini-calendário semanal hardcoded** (`CalendarTabPanel.tsx`): quando o atleta não tem dados de `dashboardCalendar`, exibe dias fixos (`{24 + index}`) e nomes inventados. Substituir por `planoVigente.treinos` via `useAthleteProfile` ou ocultar.

- [ ] 7.2 **`StatusTabPanel` — delta de carga estático** (`StatusTabPanel.tsx`): texto "+8% vs semana anterior" hardcoded. Substituir pelo delta real calculado a partir de `aderenciaSemanal` ou expor `deltaSemana` em `CoachDashboardInsights`.

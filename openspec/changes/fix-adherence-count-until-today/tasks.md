# Tasks — fix-adherence-count-until-today

Branch `feature/fix-adherence-count-until-today` nos dois repos. **Ordem:** backend (1) antes do front (2);
o PR do backend entra primeiro. Um commit por bloco.

## 1. Backend
- [ ] 1.1 `TreinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodoAte(atletaId, tenantId, inicio, fim)` — teto de data; a consulta antiga fica para Progressão e Revisão semanal (D1)
  - verify: IT contra o schema real — respeita o teto e o tenant
- [ ] 1.2 Predicado único de treino devido (não `DESCANSO`; antes de hoje, ou hoje com realizado) + testes (CA1–CA3)
  - verify: teste unitário do predicado com as bordas de hoje/ontem/amanhã e DESCANSO
- [ ] 1.3 `getAderenciaSemanal` usa o método novo, o predicado e o "hoje" do atleta (`AtletaHojeResolver`); semanas sem devido saem (D3)
  - verify: `AtletaProgressServiceImplTest` — CA1–CA4 e CA8; `AtletaProgressControllerTest` sem regressão
- [ ] 1.4 Função única `aderencia4Semanas(atleta, hoje)` — semana atual + 3 anteriores (D5) — usada pelo roster (`montarResumo`) e pelo perfil (campo novo `aderencia4Semanas`, ausente sem devido)
  - verify: teste da função (CA9, janela; CA6); `CoachDashboardServiceImplTest` — segunda-feira sem treino vencido não derruba a aderência; `CoachAthleteProfileServiceImplTest` — campo presente/ausente
- [ ] 1.4b IT de consistência roster × perfil para o mesmo atleta (CA5)
- [ ] 1.5 OpenAPI: descrição de `aderenciaSemanal` e do `/me/aderencia` diz "só semanas com treino devido"
- [ ] 1.6 Validação: `./mvnw clean verify`

## 2. Front
- [ ] 2.1 Tipo `aderencia4Semanas` no perfil; célula "Aderência · 4 sem" usa o campo; `buildAdherenceWindow` deixa de calcular a janela; fallback do roster só sem perfil; sem devido → "Sem treino vencido na janela" (D4, D6)
  - verify: `athleteKpiAdapters.test.ts` e `coachInboxAdapters.test.ts` — CA6; sem campo com perfil carregado não cai no roster
- [ ] 2.2 `describeWeek`: semana atual sem entrada → "Nada vencido ainda nesta semana"
  - verify: teste de `describeWeek` (CA7)
- [ ] 2.3 Tela do atleta (`buildAdherenceReading`): semana corrente sem entrada → "nada vencido ainda", não "Sem plano"; lista vazia com plano não é "Sem plano aprovado"
  - verify: `buildProgressReadings.test.ts` e `AthleteProgressPage.test.tsx`
- [ ] 2.4 Validação: `npm run lint && npm run build && npm run test:run`; E2E `tests/e2e/coach` sem regressão

## 3. Pós-deploy
- [ ] 3.1 Métrica de sucesso: no dia do deploy, comparar roster × perfil para todos os atletas do homelab — 0 divergências
- [ ] 3.2 Perguntar aos coaches do piloto se o número de aderência do painel bateu com o que sabem do atleta

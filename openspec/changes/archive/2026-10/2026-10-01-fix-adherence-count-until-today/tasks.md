# Tasks — fix-adherence-count-until-today

Branch `feature/fix-adherence-count-until-today` nos dois repos. **Ordem:** backend (1) antes do front (2);
o PR do backend entra primeiro. Um commit por bloco.

## 1. Backend

**Entregue via PR #151→#154 (`claude/trusting-clarke-t0y8mz` → `develop`, mergeado 2026-10-01),
com escopo reduzido em relação ao desenho original desta seção** — ver nota ao final.

- [x] 1.1 `TreinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodoAteData(atletaId, tenantId, inicio, fim)` — teto de data; a consulta antiga (`findComRealizadoByAtletaAndPeriodo`) fica para o chamador que já trata o limite em memória (D1)
  - entregue com assinatura levemente diferente da planejada (`AteData` em vez de `Ate`), mesmo efeito
- [ ] 1.2 Predicado único de treino devido (não `DESCANSO`; antes de hoje, ou hoje com realizado) + testes (CA1–CA3) — **não implementado**: o filtro de `DESCANSO` não entrou, só o teto de data
- [ ] 1.3 `getAderenciaSemanal` usa o método novo e o teto de data; **não usa** `AtletaHojeResolver` neste método (usa `LocalDate.now(clock)` direto) nem exclui semanas sem devido — **parcial**
- [ ] 1.4 Função única `aderencia4Semanas(atleta, hoje)` — **não implementada**; `CoachDashboardServiceImpl.montarResumo` passou a usar o método com teto de data (reduz o viés do roster), mas sem a função dedicada nem o campo novo `aderencia4Semanas` no perfil do coach — **parcial**
- [ ] 1.4b IT de consistência roster × perfil — **não implementado** (depende de 1.4)
- [ ] 1.5 OpenAPI — **não implementado**
- [x] 1.6 Validação: `./mvnw clean verify` — rodado localmente com Docker em 2026-10-01, BUILD SUCCESS (204 testes de integração, 0 falhas)

`ProgressaoTreinoServiceImpl.calcularHistorico` também foi migrado para o método com teto de data
(fora do escopo original desta seção, mas no mesmo PR) — corrige o mesmo viés no denominador de
`treinosPlanejados21d`/`calcularAderencia()` usado pela progressão.

**Resumo da entrega real:** só o teto de data (`dataTreino <= hoje`) nas três consultas de aderência
(`AtletaProgressServiceImpl`, `CoachDashboardServiceImpl`, `ProgressaoTreinoServiceImpl`). O predicado
de `DESCANSO`, a função `aderencia4Semanas`, o campo novo no perfil do coach e a documentação OpenAPI
ficam deferidos — não há change aberta para retomá-los ainda.

## 2. Front — deferido, sem PR aberto no `menthoros-front`
- [ ] 2.1 Tipo `aderencia4Semanas` no perfil; célula "Aderência · 4 sem" usa o campo; `buildAdherenceWindow` deixa de calcular a janela; fallback do roster só sem perfil; sem devido → "Sem treino vencido na janela" (D4, D6)
  - verify: `athleteKpiAdapters.test.ts` e `coachInboxAdapters.test.ts` — CA6; sem campo com perfil carregado não cai no roster
- [ ] 2.2 `describeWeek`: semana atual sem entrada → "Nada vencido ainda nesta semana"
  - verify: teste de `describeWeek` (CA7)
- [ ] 2.3 Tela do atleta (`buildAdherenceReading`): semana corrente sem entrada → "nada vencido ainda", não "Sem plano"; lista vazia com plano não é "Sem plano aprovado"
  - verify: `buildProgressReadings.test.ts` e `AthleteProgressPage.test.tsx`
- [ ] 2.4 Validação: `npm run lint && npm run build && npm run test:run`; E2E `tests/e2e/coach` sem regressão

## 3. Pós-deploy — depende do restante do escopo (seção 1 parcial + seção 2), ainda não aplicável
- [ ] 3.1 Métrica de sucesso: no dia do deploy, comparar roster × perfil para todos os atletas do homelab — 0 divergências
- [ ] 3.2 Perguntar aos coaches do piloto se o número de aderência do painel bateu com o que sabem do atleta

## Nota de arquivamento (2026-10-01)

Arquivada com entrega **parcial**: só o teto de data nas três consultas de aderência (seção 1,
itens 1.1 e 1.6). O restante do escopo desenhado aqui — predicado `DESCANSO`, `aderencia4Semanas`,
OpenAPI e toda a seção 2 (front) — não foi implementado e não há change aberta para retomá-lo. Se
o viés de `DESCANSO`/roster/perfil completo continuar sendo necessário, abrir uma nova change a
partir do que ficou `[ ]` aqui, em vez de reabrir esta.

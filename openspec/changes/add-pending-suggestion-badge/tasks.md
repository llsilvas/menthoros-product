# Tasks — add-pending-suggestion-badge

Validação por bloco: backend `./mvnw clean test` (IT classes exigem `./mvnw clean verify` no
gate final); frontend `npm run lint && npm run build && npm run test:run`. Branch
`feature/add-pending-suggestion-badge` nos dois repos antes de qualquer código. Backend mergeia
antes do front (front lê `temSugestaoPendente`, que só existe depois do PR backend).

## 1. Backend — query agregada

- [ ] 1.1 `SugestaoCoachRepository.findAtletaIdsByTenantIdAndStatus(tenantId, status, agora)`
      (design D1, revisado no pre-mortem): `Set<UUID>`, uma consulta, sem `JOIN FETCH`, excluindo
      `expiresAt` no passado (mesma regra de `SugestaoCoachServiceImpl.listar(PENDING)`).
      *verify:* IT — roster com sugestões `PENDING`/`APPROVED`/`REJECTED`/`PENDING`-expirada
      misturadas, só as `PENDING` não-expiradas do tenant certo voltam (CA2); tenant B não vaza
      para tenant A (CA6).

## 2. Backend — wiring no roster, calendário e dashboard agregado

- [ ] 2.1 `CoachDashboardServiceImpl`: método privado `resolverAtletasComSugestaoPendente(tenantId)`
      + overloads privados `getRoster(tenantId, set)` / `getCalendarioSemanal(from, set)` (design
      D2, revisado no pre-mortem) — as versões públicas resolvem e delegam; `getDashboard()`
      resolve uma vez e reusa nos dois. `CoachAtletaResumoDto` ganha `temSugestaoPendente`
      (boolean, design D4).
      *verify:* CA1, CA2, CA4 (uma query pro tenant inteiro em cada endpoint independente, sem
      N+1); CA8 (no máx. 2 execuções da query dentro de `getDashboard()` — assert de contagem de
      queries no teste, mesmo padrão já usado para `cobranca`).
- [ ] 2.2 `montarTreinoAgendado` recebe `atletasComSugestaoPendente` e substitui o `false`
      hardcoded (design D3).
      *verify:* CA3.
- [ ] 2.3 Teste de decisão subsequente: sugestão `PENDING` única do atleta é aprovada/rejeitada →
      próxima chamada de `getRoster()` retorna `temSugestaoPendente = false`.
      *verify:* CA5.
- [ ] 2.4 `SugestaoCoachRepository.findAllByAtletaIdAndTenantId` (design D6, achado do pre-mortem
      rodada 2): prioriza `PENDING` não-expirada antes de completar por `createdAt`, para o
      `RecentSuggestionsPanel` sempre mostrar a pendência que o badge sinalizou.
      *verify:* CA9 — teste com 1 `PENDING` antiga + 3 decididas mais recentes; a `PENDING`
      aparece nas 3 retornadas.

## 3. Frontend — roster

- [ ] 3.1 `CoachAtletaResumo` (`types/Coach.ts`) e `AthleteRow` (`CoachAthletesPage.tsx`) ganham
      `temSugestaoPendente: boolean`; mapeamento do DTO para a row atualizado.
      *verify:* `npm run build` verde.
- [ ] 3.2 `AthleteNameCell.tsx` ganha o indicador visual (design D5) — mesmo ponto
      (`primary[500]`, 5px) já usado em `CoachCalendarPage.tsx`, coexistindo com o indicador de
      "linha viva" de geração de plano sem colidir.
      *verify:* CA7; teste RTL — indicador aparece quando `temSugestaoPendente=true`, ausente
      quando `false`, e junto com o indicador de geração de plano sem sobrepor.

## 4. Integração e encerramento

- [ ] 4.1 Gate backend completo (`./mvnw clean verify`), gate front, `/qa` nos dois repos.
- [ ] 4.2 Validação manual em `develop` (Railway): atleta com sugestão `PENDING` real mostra o
      ponto no roster e no calendário; decidir a sugestão faz o ponto sumir ao recarregar.
- [ ] 4.3 Antes do PR `develop → main`: confirmar que `add-coach-suggestion-review-actions`
      (`menthoros-front#126`) já está em produção — sem os botões Aprovar/Rejeitar, o coach vê o
      badge e não acha onde agir. Se não estiver, segurar a promoção deste badge.

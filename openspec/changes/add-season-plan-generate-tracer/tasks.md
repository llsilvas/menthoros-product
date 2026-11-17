## 0. Reaproveitamento (levantado em 2026-11-16, não reescrever)

Backend (worktree `backend-add-season-plan-generate-tracer`, `src/main/java/br/com/menthoros/backend/`):

- Modelo do ticket 1 pronto: `PlanoTreino` já tem `seasonStatus`, `totalWeeks`, `version`,
  `versionReason`, `initialCtl`, `peakVolumeKm`, `shortPreparation`, `nome`/`descricao`/`objetivo`;
  `SeasonWeek` (`weekIndex`, `weekStart`, `phase`, `targetVolumeKm`, `targetTss`, `longRunKm`,
  `deload`, `valueSource`) + `SeasonWeekRepository.findBySeasonPlanIdAndTenantIdOrderByWeekIndexAsc`;
  `SeasonPlanStatus`; `TrainingPhase` (BASE, BUILD, PEAK, TAPER, RACE_WEEK); `WeekValueSource.ENGINE`.
  Nenhuma entidade ou migration nova de tabela.
- `RacePreparationRule.minimoSemanas` / `distanciaNominalKm` (faixa da `CUSTOMIZADA`).
- `LoadTargetResolver.MAX_CTL_RAMP_PER_WEEK` e `TETO_CTL_COLD_START` são `private`: o `SeasonPlanner`
  fica no mesmo pacote `domain/planner` e as constantes passam a package-private (sem duplicar valor).
- Bases: `MetricasDiariasRepository.findLatestByAtletaId` + `findDataPrimeiraMetrica`;
  `AthleteBaselineStateRepository.findByAtletaIdAndTenantId`;
  `PerfilOnboardingAtletaRepository.findByAtletaIdAndTenantId`;
  `TreinoRealizadoRepository.findByAtletaIdAndTenantIdAndDataTreinoBetween` + `contaNaCarga()`.
- `Clock` bean existe (`ClockConfig`, zona do JVM): usar `LocalDate.now(clock.withZone(America/Sao_Paulo))`.
- Flag: padrão `@Value("${...:false}")` de `PlanoServiceImpl` (`planner-engine.enabled`).
- Erros: `DomainRuleViolationException` → 422, `DomainConflictException` → 409,
  `ResourceNotFoundException` → 404 em `GlobalExceptionHandler`. Só falta o 404 com `code` (D12):
  uma exceção + um handler, no padrão do `LGPD_CONSENT_REQUIRED`.
- Controller: padrão de `RaceProjectionController` (`/api/v1/atletas/{atletaId}/...`,
  `hasAnyRole('TECNICO','ADMIN')`, `TenantContext.getRequiredTenantId()`,
  `AtletaRepository.findByIdAndTenantId`).
- Lock: copiar `AthleteContractRepository.findByIdAndTenantIdForUpdate` para `ProvaRepository`.
- Arquivamento: `PlanoTreinoRepository.archiveOpenSeasons` + constantes de motivo; falta só a constante
  "prova deixou de ser alvo" e a chamada em `ProvaServiceImpl.atualizarProva` (alvo → não-alvo sem
  cancelar hoje não arquiva).
- Testes: `AbstractIntegrationTest`, `ProvaTemporadaIT`, `AuthWebMvcTestConfig` (exemplo
  `IntervalsIcuConnectionControllerAuthTest`).

Front (worktree `front-add-season-plan-generate-tracer`):

- Abas: `TABS`/`TabKey` em `CoachInboxPage.tsx`; `selectedProfile.proximaProva` (`provaAlvo`);
  `calcularDiasAteProva` em `coachInboxAdapters.ts`.
- API: serviço à mão no estilo `CoachSemanaService` (`__request`), `ApiError.status`/`body.code`.
- Hook no padrão `useCoachAthleteRaces` (useState/useCallback, sem React Query).
- UI: `KpiStrip`, `Alert` com "Tentar de novo", `Skeleton`, MUI `Table size="small"`,
  `formatarDataCurta`, `formatKm`. `PhaseIndicator` não tem PEAK/RACE_WEEK → mapa local de 5 rótulos.
- Testes: Vitest + `vi.mock` do serviço (`useCoachAthleteRaces.test.ts`, `DiagnosisTabPanel.test.tsx`);
  E2E em `tests/e2e/coach/inbox.spec.ts` (`autenticarComPkce` + `page.route`). Gerenciador: npm.

## 1. Backend

- [x] 1.1 V118 só com índices: `(tenant_id, prova_id)` em `tb_plano_treino` e único parcial
  `(atleta_id) WHERE season_status = 'PROPOSED'`, no estilo do `uk_plano_treino_active_season` da V116
  - verify: `ProvaTemporadaIT`/`ddl validate` sobe; inserir 2 `PROPOSED` do mesmo atleta viola
- [x] 1.2 `SeasonPlanner` puro em `domain/planner` (sem Spring): template constante (D9/D14), horizonte
  (D3), corte condicionado ao CTL, curva (D10), arredondamento. Entrada: distância, data da prova,
  hoje, `S`, volume de partida. Constantes de `LoadTargetResolver` viram package-private
  - verify: testes parametrizados com os exemplos dos critérios de aceite (20 sem. KM_42 → 285/364/218/
    164; KM_21 curta com CTL ≥ 40 e < 40; KM_42 a 3 sem. com `n = 0`; limite de 2 sem.;
    `CUSTOMIZADA`); reprodutibilidade (mesma entrada → mesmas semanas)
- [x] 1.3 `SeasonPlanService`: bases de partida (D11, decaimento `e^(−dias/42)`, fallbacks, 422 por
  base faltando), lock da prova + revalidação de alvo (D13), 200/409 ao gerar de novo (D2), grava
  `PlanoTreino` (`nome`/`descricao`/`objetivo` da prova — épico 1.3b; `totalWeeks`, `initialCtl`,
  `peakVolumeKm`, `shortPreparation`) e `SeasonWeek` com `ENGINE`; leitura `current`; flag (D5)
  - verify: teste unitário com mocks (bases, decaimento de 10 dias, 409, 200, 422s, flag off)
- [x] 1.4 `SeasonPlanController` (`POST`, `GET current`, 201/200/204) + `SeasonPlanResponseDto` (D1) +
  exceção/handler do 404 com `code: SEASON_PLAN_DISABLED` (D12); `season-plan.enabled` no
  `application.yml` (`SEASON_PLAN_ENABLED:false`) (épico 4.1, 4.2, 4.12, 4.12a, 4.13)
  - verify: `@WebMvcTest` 201/200/204/409/422/404 + corpo do 404 da flag + 403 do `ATLETA`
- [x] 1.5 D7 + D13 nos caminhos de alvo: `ProvaServiceImpl.atualizarProva` (alvo → não-alvo arquiva com
  "prova deixou de ser alvo"), `cancelarProva`, `garantirAlvoUnica` e `OnboardingServiceImpl` carregam a
  prova com lock antes de `archiveOpenSeasons`
  - verify: testes unitários dos caminhos + casos no `ProvaTemporadaIT`
- [x] 1.6 `SeasonPlanIT`: POST → GET; `ATLETA` 403; assessoria B 403 (`@RequireTenant`); flag off 404 com
  código (no `SeasonPlanControllerTest`); dois POST concorrentes → uma só `PROPOSED`; POST × cancelar concorrentes → nenhuma temporada
  aberta (épico 4.12b). Achou um furo: cancelar mantém `provaAlvo = true`, então a revalidação
  pós-lock também recusa prova `CANCELADA` (`2ea6cab`)
  - verify: `*IT` verde
- [x] 1.7 Validar: `./mvnw clean verify` + OpenAPI com os dois endpoints (épico 4.14)
  - verify: BUILD SUCCESS — 6689 unit (1 skipped) + 336 IT, 0 falhas (2026-11-16). OpenAPI pelas anotações
    do controller; Swagger UI não aberto

## 2. Frontend

- [ ] 2.1 `src/api/services/SeasonPlanService.ts` (estilo `CoachSemanaService`) + `src/types/SeasonPlan.ts`;
  hook `useSeasonPlan(atletaId)` no padrão `useCoachAthleteRaces`: ler, gerar, refetch; 204 → sem
  temporada; 404 com `body.code === 'SEASON_PLAN_DISABLED'` → `disabled`; outro 404 → erro (D12;
  épico 7.12)
  - verify: teste do hook com `vi.mock` cobre 200/204/404 da flag/404 comum/erro/gerar
- [ ] 2.2 `SeasonTabPanel` em `features/coach/components/panels/` e aba **Temporada** entre Diagnóstico e
  Plano (some quando `disabled`): faixa de proposta (`Alert`), `KpiStrip` (semanas, dias até a prova
  via `calcularDiasAteProva`, fase corrente, volume de pico), `Table` (Semana, Início, Fase, Volume,
  TSS) com mapa local de fases (D6; épico 7.1, 7.3, 7.4)
  - verify: teste de componente renderiza KPIs e linhas
- [ ] 2.3 Estados: sem prova-alvo (`selectedProfile.proximaProva`), prova sem temporada com "Gerar
  temporada", proposta, `Skeleton`, erro com "Tentar de novo" (épico 7.7) + contraste/alvos da seção 9
  (épico 7.13)
  - verify: um teste por estado
- [ ] 2.4 E2E Playwright em `tests/e2e/coach/` (API interceptada): inbox → aba Temporada → gerar → tabela
  - verify: `npm run test:e2e` verde
- [ ] 2.5 Validar: `npm run lint && npm run build && npm run test:run` (épico 7.15)

## 3. Métrica (D8)

```sql
select a.tenant_id,
       count(distinct p.atleta_id) as atletas_com_alvo,
       count(distinct pt.atleta_id) as atletas_com_temporada,
       round(100.0 * count(distinct pt.atleta_id) / nullif(count(distinct p.atleta_id), 0), 1) as pct
from tb_prova p
join tb_atleta a on a.id = p.atleta_id
left join tb_plano_treino pt on pt.prova_id = p.id and pt.season_status in ('PROPOSED','ACTIVE')
where p.prova_alvo and p.data_prova >= current_date and p.status_prova <> 'CANCELADA'
group by a.tenant_id;
```

Nomes de coluna conferidos na task 1.1 contra o schema real.

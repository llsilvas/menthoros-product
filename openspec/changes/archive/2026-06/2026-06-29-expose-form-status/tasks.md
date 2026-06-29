# Tasks — expose-form-status

> Fatiada: só a forma **atual**. Ordem cross-repo: backend (1–2) → contrato (3) → frontend (4–5). Não mergear local; integrar via PR.
> Plano refinado contra o código real (`/implement init`). Branch backend: `feature/expose-form-status` (base `2e5b04e`).

## 1. Backend — resolver e expor `statusForma` nos DTOs

Records-alvo (todos `record`, `@JsonInclude(NON_NULL)` onde aplicável):
- `dto/output/PmcPontoDto.java` — `(data, ctl, atl, tsb, tss)` → add `String statusForma`.
- `dto/output/CoachAtletaResumoDto.java:15` — tem `Double tsb` (:30), `String status` (:36) → add `String statusForma` (distinto de `status`).
- `dto/output/AtletaHomeDto.java:39` (`MetricasChave`) — `Double tsb` (:48) → add `String statusForma`.

Pontos de construção a atualizar:
- `AtletaProgressServiceImpl.java:88` (`new PmcPontoDto(...)`) e `:198`/`:199` (`new AtletaHomeDto.MetricasChave(...)`, incl. o `.orElse(... null,null,null,null,null)`).
- `CoachDashboardServiceImpl.java:268` (`new CoachAtletaResumoDto(...)`).

- [x] 1.1 Adicionar `String statusForma` aos 3 records (com `@Schema`). ✅ append no fim de cada record.
- [x] 1.2 Helper de resolução null-safe — implementado como `FaixaTsb.classificarNome(Double)` (estático no domínio, reusa `classificar`, sem novos limiares). Aplicado em `AtletaProgressServiceImpl:89,200,201` e `CoachDashboardServiceImpl:270`.
- [x] 1.3 **verify:** compila — coberto pelo `./mvnw clean test` (2.3).

## 2. Backend — testes (TDD: escrever antes do 1.x onde fizer sentido)

- [x] 2.1 TDD: novo `FaixaTsbClassificarNomeTest` (14 casos: null→null + fronteiras min-exclusivo/max-inclusivo). `AtletaProgressServiceImplTest.getHistoricoPmc` agora assere `statusForma` (`extracting(PmcPontoDto::statusForma)`).
- [x] 2.2 `CoachDashboardServiceImplTest` não existe; a resolução é o mesmo helper testado em `FaixaTsbClassificarNomeTest` + wiring trivial em `montarResumo` (passthrough). `CoachDashboardControllerTest` fixtures atualizadas. Justificado: não criar teste de service pesado para passthrough (CLAUDE.md: não testar accessor/trivial).
- [x] 2.3 **verify:** `./mvnw clean test` → **BUILD SUCCESS, 1040 testes, 0 falhas**.

## 3. Contrato — portar para o cliente curado do front

- [x] 3.1 Regen não necessária: os tipos do contrato coach vivem em `src/types` (não em `src/api/models` gerado). Porte à mão direto.
- [x] 3.2 `statusForma?: FaixaTsbStatus` adicionado a `CoachAtletaResumo` (`types/Coach.ts`) e `PmcPontoRaw` (`types/AtletaPerfilCoach.ts`).
- [x] 3.3 `FaixaTsbStatus` (union dos 9 nomes) em `src/types/FaixaTsb.ts`.
- [x] 3.4 **verify:** `npm run build` → exit 0.

## 4. Frontend — apresentação + consumo da forma atual

> ⚠️ Bloqueada por decisão de produto (granularidade — ver Open Question). Resolver antes do 4.1.

- [x] 4.1 Decisão de produto: **9 rótulos distintos, 4 tons**. `FAIXA_APRESENTACAO: Record<FaixaTsbStatus, {label, tone}>` em `AthleteForm.ts` (sem números).
- [x] 4.2 `buildSelectedAthleteFromDashboard` e `buildRosterRowFromSummary` propagam `statusForma` (último PMC / roster) para `quickStats`; tipo `quickStats.statusForma` em `CoachInbox.ts`.
- [x] 4.3 `CoachInboxPage`: forma atual consome `quickStats.statusForma` + `FAIXA_APRESENTACAO` (label/tom); `formFromTSB`/`formVariantLabel`/`getTsbFormaTone` removidos do import da página.
- [~] 4.4 **Deferida**: `AthleteRow.tsx`/`AthleteUIModel` **não tem consumidor** (dead code; grep zero importadores). O `tsb < -30` ali está fora do fluxo ativo — não plumbar statusForma em componente morto. Registrado como follow-up (limpeza de dead code).
- [x] 4.5 `formFromTSB` mantido SÓ em `calcularPrevisaoForma` (projeção), com comentário de dívida + ref ao follow-up.
- [x] 4.6 **verify:** `npm run lint` (0), `npm run build` (0), `npm run test:run` (252 ok).

## 5. Frontend — testes

- [x] 5.1 Teste de `FAIXA_APRESENTACAO` (9 faixas → label/tom; mapeamento de severidade) em `AthleteForm.test.ts`.
- [x] 5.2 `AthleteForm.test.ts`: testes de `formFromTSB`/`getTsbFormaTone` mantidos (cobrem a projeção, que conserva esses helpers).
- [x] 5.3 **verify:** `npm run lint && npm run build && npm run test:run` → verdes (252 testes).

## 6. Verificação de aceite (DoD)

- [ ] 6.1 **verify:** `rg "formFromTSB" apps/menthoros-front/src/features` → única ocorrência em `calcularPrevisaoForma` (AC2).
- [ ] 6.2 Consistência backend↔UI da forma atual nas fronteiras (AC1, métrica de sucesso) — conferir amostra.
- [ ] 6.3 Campo aditivo não quebra clientes (AC3) — desserialização de payload sem `statusForma` ok.
- [x] 6.4 Tabela antes/depois (5→9) — AC4. Mudanças de tom relevantes para o coach (intencionais, refletem o motor `FaixaTsb`):

  | TSB | Antes (formFromTSB) | Depois (FaixaTsb) | Nota |
  |---|---|---|---|
  | > 25 | Excelente (success) | Muito descansado (**warning**) | passa a sinalizar overtaper/detraining |
  | 15–25 | Excelente (success) | Descansado (success) | só rótulo |
  | 5 (limite) | Boa (success) | Recuperando (**neutral**) | fronteira (0,5] |
  | -10 (limite) | Estável (neutral) | Acumulando fadiga (**warning**) | mais conservador |
  | -21 a -30 | Muito baixa (danger) | Fadiga moderada (**warning**) | menos alarmista |
  | ≤ -30 | Muito baixa (danger) | Fadiga alta/excessiva (danger) | mantém severidade |

  Demais faixas mantêm o tom. Confirmar no PR como alinhamento intencional ao motor.
- [ ] 6.5 PR backend e PR front abertos (backend primeiro); QA verde nos dois.

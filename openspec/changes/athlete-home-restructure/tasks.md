# Tasks — athlete-home-restructure

Repo: `apps/menthoros-front`, branch `feature/athlete-home-restructure` (base `develop@1edf714`).
Validação padrão de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado (check-in, registro e navegação são fluxos críticos). Cada task traz uma linha `verify:`
— como saber que funcionou.

Sequência: 0 → 1 → (2 ∥ 3) → 4 → 5 → 6. O bloco 2 e o 3 não compartilham arquivos além da
`AthleteHomePage`, que só é montada na 3.5/4.1.

## 0. Pré-condições (bloqueiam as demais)

- [ ] 0.1 Ler o cálculo do `readinessScore` em
      `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/helper/ReadinessService.java` e registrar aqui (caminho:linha)
      se o mapeamento 3 estados → 1–10 (D2) preserva a semântica. Se sensível a granularidade, o
      inline grava e o modal segue como precisão (D2 ajustado). Dono: executor da change.
      verify: esta task tem a evidência colada, com decisão explícita "mantém D2" ou "D2 ajustado".
- [ ] 0.2 Medir e registrar o baseline das duas métricas (4 semanas anteriores): `PlanoSemanal`/
      `TreinoRealizado` (treinos planejados com registro ≤24h) e `CheckinProntidao` (check-ins por
      atleta ativo/semana) — SQL no banco de dev/prod conforme acesso.
      verify: dois números e a query nesta task.
- [ ] 0.3 Gate: o founder confirma aqui se há atletas de assessoria piloto usando o shell. Negativo
      → change fica `[~]` com o gatilho "retomar quando houver ≥1 atleta de piloto no shell"; as
      tasks 1+ não começam.
      verify: linha assinada com data nesta task.

## 1. Tema e tokens do shell

- [ ] 1.1 `src/features/athlete/theme/athleteTheme.ts` — `createTheme(appTheme, {...})` no molde de
      `features/coach/theme/coachTheme.ts`: `fontFamily = font.text`, `h1–h4` em `font.display`,
      escala `typography` (11/13/14/16/18/24/32); `AthleteLayout` envolve o `Outlet` + nav com
      `ThemeProvider`. Teste `athleteTheme.test.ts` (famílias por variante) e teste do layout.
      verify: `getComputedStyle` de um `Typography` dentro do layout não contém "Syne"; coach e
      landing inalterados (`npm run test:run` verde nos testes deles).
- [ ] 1.2 Remover os 11 `fontFamily: 'Syne, sans-serif'` de `features/athlete/**` (Plano, Perfil,
      Progresso, Onboarding, `ManualTrainingFormPage`, `QuickCheckInModal`, `FitUploadResultCard`,
      `IntervalsIcuConnectionCard`, `PostWorkoutFeedbackCard`) → variante `h5`/`h6` do tema; em
      `shared/components/ConfirmDialog.tsx` e `CoachDialog.tsx` trocar o literal por
      `fontFamily: (t) => t.typography.h6.fontFamily`. Tamanhos `rem` fora da escala nos componentes
      tocados → tokens `typography`; raios `radius.lg`/`radius.md`; superfície `elevation.card` +
      `surface[700]`.
      verify: `rg "Syne" src/features/athlete src/shared/components --glob '!*.test.*'` vazio;
      snapshot visual do coach (`CoachDialog`) sem mudança de fonte (teste de tema do coach).

## 2. Check-in

- [ ] 2.1 `useInlineCheckin` (`src/features/athlete/hooks/`) sobre `useRegistrarCheckin` +
      `useCheckinAtual`: estado derivado do check-in existente (≤4 / 5–7 / ≥8, invertido para dores
      e estresse); **primeiro check-in: sem POST até os cinco terem estado** (`pending: N`);
      existente: POST completo por toque com debounce 600ms; falha reverte o item e expõe `error`;
      `refetchReadiness` chamado após sucesso. `InlineCheckIn` (componente): cinco alvos de 48px,
      três estados, "N de 5" / "Salvo", link "Mais detalhes" → `QuickCheckInModal`.
      verify: testes do hook — `null` → 4 seleções sem chamada a `registrar` → 5ª dispara com os
      cinco valores mapeados; existente → 1 toque → `registrar` com DTO completo; falha → estado
      anterior. Teste do componente: 5 alvos com `role="button"` e `aria-pressed`.
- [ ] 2.2 `CheckInStatusRow`: "Fazer check-in" (abre inline expandido) / "Check-in de hoje feito ·
      Editar" (abre o modal com `initialData`). Sem horário.
      verify: teste de componente nos dois estados; nenhum texto "às".

## 3. Hero, prontidão e "Sua semana"

- [ ] 3.1 `TodayHeroCard`: remover `motivationalMessage`; chip do tipo com
      `workoutTypeColor(proximoTreino.tipoTreino)`; ação primária "Registrar treino" →
      `ROUTES.ATHLETE_TRAINING_LOG`; link "Ver plano da semana" (`RouterLink`, `#/athlete/plan`).
      Atualizar `TodayHeroCard.test.tsx` e `AthleteHomePage.test.tsx`.
      verify: único `button` com `variant="contained"` na Home é "Registrar treino"; link com
      `href="#/athlete/plan"` (router real, não `MemoryRouter`).
- [ ] 3.2 `ReadinessCard` em layout de linha: anel SVG 56px, rótulo + score, recomendação, origem
      "com base no seu check-in" quando há check-in hoje.
      verify: teste de componente; altura do card < 100px em 358px (jsdom: estrutura, não px).
- [ ] 3.3 Adapter puro `buildWeekOverview(plano, treinos, provas, streak)` em
      `features/athlete/adapters/` → `{ streak, volumeRealizadoKm, volumePlanejadoKm, dias[7]:
      {date, status, color}, proximaProva }`; cor por `workoutTypeColor(treinoPlanejado.tipoTreino)`
      (enum do backend; **não** `mapTipoTreino`). `WeekOverviewCard` com regiões `data-testid`
      `home-streak`, `home-next-workout` (no hero), `home-form`. Remover `WeeklySummaryCard`, o
      card de streak e o de prova da Home (e seus testes, se sem outro consumidor).
      verify: `buildWeekOverview.test.ts` (semana sem plano, com descanso, concluído, hoje);
      `rg WeeklySummaryCard src` vazio.
- [ ] 3.4 Kudos em linha (`KudosCard` compacto); linha "Forma: <statusForma em PT-BR>" + link
      "Ver progresso" (`#/athlete/progress`); remover o grid "Métricas de hoje" da Home.
      `buildHomeMetrics`: manter se `AthleteProgressPage` consumir, senão remover com o teste.
      verify: teste de página — nenhum texto `CTL|ATL|TSB|pts`; link para progresso presente.
- [ ] 3.5 Cabeçalho com data por extenso (`date-fns` `format(..., "EEEE, d 'de' MMMM", {locale: ptBR})`)
      e saudação por `timeOfDayNow`.
      verify: teste com `vi.setSystemTime` em duas datas/horas.

## 4. Erros consolidados

- [ ] 4.1 `useAthleteHomeErrors` agregando `{error, refetch}` de readiness, treinos, provas,
      checkinAtual, kudos, plano e **`useCalibracao().error` (hoje não lido pela Home)**; um
      `Alert` no topo com "Recarregar" (`retryAll`). Erro de `useAthleteHome` mantém a tela
      bloqueante. Remover os sete `Alert` inline.
      verify: teste de página com kudos + provas falhando → exatamente um `role="alert"`; só
      calibração falhando → um `Alert`; `useAthleteHome` falhando → tela de erro atual.

## 5. Barra inferior

- [ ] 5.1 Remover `ITEM_SAIR` de `AthleteBottomNav`; "Sair" no `AthleteProfilePage` com o mesmo
      `ConfirmDialog` e `useAuth().logout` (extrair `useLogoutConfirm` se o nav já tiver essa
      lógica, para não duplicar).
      verify: teste do nav — 5 `button`, nenhum "Sair"; teste do perfil — "Sair" abre confirmação
      e chama `logout`.
- [ ] 5.2 `AthleteLayout` passa `unreadCoachMessages={0}` com comentário apontando o ponto de
      injeção (mensageria, Sprint 28).
      verify: teste do badge com `unreadCoachMessages={2}` mostra "2".

## 6. E2E e smoke

- [ ] 6.1 `tests/e2e/athlete/home.spec.ts` (criar a pasta; auth e `page.route` no padrão de
      `tests/e2e/coach/inbox.spec.ts`), viewport 390×844: "Registrar treino" visível sem scroll
      (`boundingBox().y + height ≤ 844`); check-in inline — **mockar `POST /api/v1/checkins` e o
      `GET` de readiness**, asserir o payload do POST (cinco campos) e o score novo vindo do GET;
      falha parcial (kudos 500) → um `Alert`; barra com 5 itens, "Sair" no Perfil; varredura de
      nós de texto visíveis: nenhuma `font-family` com "Syne", todo `font-size` na escala.
      verify: `npm run test:e2e -- tests/e2e/athlete/home.spec.ts` verde.
- [ ] 6.2 Smoke visual de Progresso, Coach, Perfil e Registro em 390px com o tema novo. Corrigir
      **só** estouro (texto cortado, `scrollWidth > innerWidth`, controle < 44px); o resto vira
      follow-up listado aqui.
      verify: lista de telas inspecionadas com resultado; E2E existentes verdes.

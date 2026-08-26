# Tasks — athlete-home-restructure

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test:run` quando a task toca lógica; E2E onde indicado). Fluxos críticos (check-in,
registro de treino, navegação) exigem E2E.

## 0. Pré-condições (bloqueiam as demais)

- [ ] 0.1 Ler o cálculo do `readinessScore` em `apps/menthoros-backend` e registrar aqui
      (caminho:linha) se o mapeamento 3 estados → 1–10 (D2) preserva a semântica. Se sensível a
      granularidade, o inline grava e o modal segue como precisão (D2 ajustado). Dono: executor da
      change. Validação: evidência nesta task.
- [ ] 0.2 Medir e registrar o baseline das duas métricas de sucesso (4 semanas anteriores): query
      sobre `PlanoSemanal`/`TreinoRealizado` e `CheckinProntidao`. Validação: números nesta task.
- [ ] 0.3 Gate: o founder confirma aqui se há atletas de assessoria piloto usando o shell. Negativo
      → change fica `[~]` com o gatilho "retomar quando houver ≥1 atleta de piloto no shell"; as
      tasks 1+ não começam. Validação: linha assinada nesta task.

## 1. Tema e tokens do shell

- [ ] 1.1 Criar `features/athlete/theme/athleteTheme.ts` estendendo `appTheme` com `font.text` como
      `fontFamily` e `font.display` nos títulos; envolver o `AthleteLayout` com `ThemeProvider`.
      Validação: lint+build; teste de que `AthleteLayout` renderiza texto sem `Syne`.
- [ ] 1.2 Remover os 11 `fontFamily: 'Syne, sans-serif'` literais de `features/athlete/**` (viram
      variante do tema) e trocar os 2 de `shared/components` (`ConfirmDialog`, `CoachDialog`) por
      `fontFamily` da variante do tema (D3); substituir tamanhos em `rem` fora da escala nos
      componentes tocados pelos tokens `typography`; unificar raios e superfície. Validação:
      lint+build + `rg "Syne" src/features/athlete src/shared/components` vazio (fora de testes).

## 2. Check-in

- [ ] 2.1 `InlineCheckIn` (componente) + `useInlineCheckin` (hook sobre `useRegistrarCheckin`/
      `useCheckinAtual`): cinco itens de 48px, três estados; **primeiro check-in: sem POST até os
      cinco terem estado ("N de 5")**; existente: POST completo por toque com debounce 600ms;
      reversão em falha; "Salvo"; "Mais detalhes" abre o `QuickCheckInModal`. Validação: testes de
      hook e componente (inicial `null` → 4 seleções sem POST → 5ª dispara; estado derivado de
      check-in existente; ciclo; falha reverte).
- [ ] 2.2 Linha de estado do check-in quando já feito ("Check-in de hoje feito · Editar").
      Validação: teste de componente.

## 3. Hero, prontidão e "Sua semana"

- [ ] 3.1 `TodayHeroCard`: remover `motivationalMessage`; chip do tipo com `workoutTypeColor`;
      ação primária "Registrar treino" → `ROUTES.ATHLETE_TRAINING_LOG`; link "Ver plano da semana".
      Validação: teste de componente + atualizar testes existentes.
- [ ] 3.2 `ReadinessCard` em layout de linha (anel 56px, rótulo, recomendação, origem). Validação:
      teste de componente.
- [ ] 3.3 `WeekOverviewCard` ("Sua semana"): streak, volume realizado/planejado (`useAthletePlan`),
      sete pontos de dia (status + cor do tipo), próxima prova. Adapter puro
      `buildWeekOverview(plano, treinos, provas, streak)` com teste. Remover `WeeklySummaryCard`, o
      card de streak e o de prova da Home. Validação: `test:run`.
- [ ] 3.4 Kudos em linha; forma em linguagem simples (`statusForma`) + link Progresso; remover o
      grid "Métricas de hoje" da Home (manter `buildHomeMetrics` se Progresso o usar; senão remover).
      Validação: teste de página assegurando ausência de "CTL/ATL/TSB/pts".
- [ ] 3.5 Cabeçalho com data por extenso e saudação por período (`timeOfDayNow`). Validação: teste.

## 4. Erros consolidados

- [ ] 4.1 `useAthleteHomeErrors` agregando erros/refetch dos hooks secundários — **incluindo
      `useCalibracao().error`, que a Home hoje não lê**; um `Alert` no topo com "Recarregar". Erro
      de `useAthleteHome` mantém a tela bloqueante. Validação: teste de página com dois hooks
      falhando → um `Alert`; teste com só calibração falhando → `Alert` presente.

## 5. Barra inferior

- [ ] 5.1 Remover "Sair" de `AthleteBottomNav`; adicionar "Sair" (mesmo `ConfirmDialog`) no
      `AthleteProfilePage`. Validação: testes do nav e do perfil.
- [ ] 5.2 `AthleteLayout` passa `unreadCoachMessages` (fonte: `0` até a mensageria; ponto de injeção
      documentado). Validação: teste do badge com valor > 0.

## 6. E2E e smoke

- [ ] 6.1 `tests/e2e/athlete/home.spec.ts` em 390×844: botão "Registrar treino" visível sem scroll;
      check-in inline — **mockar `POST /api/v1/checkins` e o `GET` de readiness** e asserir o
      payload do POST e o score novo vindo do GET (não aceitar estado otimista); um `Alert` em
      falha parcial (mock de rede);
      barra com cinco itens e "Sair" no Perfil; varredura de fontes/tamanhos (CA 8). Validação:
      `npm run test:e2e` verde.
- [ ] 6.2 Smoke visual de Progresso, Coach, Perfil e Registro em 390px com o tema novo. Corrigir
      **só** o que o proposal define como estouro (texto cortado, scroll horizontal, controle
      < 44px); o resto vira follow-up listado aqui. Validação: inspeção + E2E existentes.

**Tamanho:** M · **Trilha:** Full

## Why

O atleta abre o Menthoros em dois momentos: de manhã (planejar) e na calçada antes de correr
(executar). Hoje as duas situações recebem a mesma Home-painel. E depois do treino, o ciclo não
fecha: registrei → como foi? → o coach viu → o plano mudou → eu soube. `PostWorkoutFeedbackCard` e
`PlanAdjustmentCard` existem, mas soltos entre cards, e o registro por sync (intervals.icu) não
pede nada ao atleta — o coach só recebe RPE quando o registro é manual.

A revisão de design de 2026-08-26 desenhou o ciclo na página "Ciclo do treino" do canvas
<https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d>: **modo treino** (1) e
**pós-treino "Como foi?"** (2a). A prancheta 2b ("o coach reagiu") **não está nesta change** — ver
Non-Goals.

**Por que isso importa para o treinador.** O RPE e a sensação pós-treino são o insumo mais barato e
mais preditivo que o coach tem para ajustar a semana — e hoje ele os recebe só de quem registra à
mão. O modo treino leva a prescrição (com alvos de FC/pace que o backend já calcula para o push ao
intervals.icu) para a hora da execução, reduzindo treino fora da zona. Fechar o ciclo é o que faz o
atleta continuar alimentando o coach.

## What Changes

Backend + frontend. Duas fatias, entregáveis em sequência (ver `design.md` D0 para o corte):

**A · Modo treino (front + backend read-only)**
- Tela cheia `AthleteWorkoutPage` (`/athlete/workout/today`): perfil do treino na variante full,
  etapas com duração, zona e **alvo de FC/pace**, ação "Concluí o treino" (abre o registro
  pré-preenchido com o planejado) e "Não vou conseguir hoje" (marca o dia como pulado e sinaliza o
  coach na fila de atenção — reaproveita o sinal de aderência existente).
- Backend: `GET /api/v1/atletas/me/treinos/hoje` devolve o `TreinoPlanejado` do dia com etapas e
  os alvos de FC resolvidos por `IntervalsIcuFcAlvoResolver.resolver(FcAlvoBruto, Atleta)` a partir
  do alvo declarado de cada etapa (`fcAlvoEtapa` parseado por `IntervalsIcuTargetParser`) — a mesma
  cadeia do push, sem recalcular no front. Etapa sem alvo confiável (`descartadoPorFaltaDeDado`)
  vem sem os campos; quando há FC e pace, **FC é o alvo primário e o pace vai como texto** — a
  mesma precedência do push. O contrato traz `hoje` no fuso do atleta. `POST .../me/treinos/hoje/pular`
  marca o planejado como `PERDIDO` com `motivoPulo` (sem status novo).
- Entradas: "Ver etapas e começar" na Home e toque no dia de hoje no Plano.

**B · Pós-treino "Como foi?" (front + backend)**
- Após registro (manual, `.fit` ou sync), o hero da Home é substituído até o fim do dia por
  "Treino feito" (dados + origem) com: RPE 1–10, chips de sensação (`PERNAS_PESADAS`,
  `RITMO_TRANQUILO`, `CALOR`, `DOR`, `DORMI_MAL` — lista fechada, extensível), frase opcional (texto
  ou áudio via `AudioRecorder` existente). Um envio.
- Backend: `TreinoRealizado` **já tem `percepcaoEsforco`** (RPE, consumido por
  `TssCalculatorService.calcularTssRpe` e pelo `ultimoRpe` do readiness) **e `feedbackAtleta`**
  (texto). A change adiciona `sensacoes[]` e `feedbackRegistradoEm` — **não cria segundo RPE nem
  segundo campo de texto** — via `POST /api/v1/atletas/me/realizados/{id}/feedback`, que exige RPE,
  grava os quatro e carimba a data (completude = carimbo). O feedback aparece no drilldown do coach
  (`CoachAthleteProfilePage`, treinos recentes).
- Quando o treino chega por sync, o botão "Registrar treino" da Home some para aquele dia.

## Non-Goals

- **"O coach reagiu" (prancheta 2b) não está aqui, em definitivo.** A task 0.1 foi resolvida na
  criação da change: **não existe entidade de ajuste de plano no backend** — `PlanAdjustmentCard` é
  consumido só pelo `CoachChatPanel`, herança do mock. O bloco na Home + "Entendi" + "Responder"
  nasce completo, como change própria, **depois** de `add-athlete-coach-messaging` (Sprint 28),
  que é quem cria o `plan_adjustment`. Registrado no Radar do `SPRINTS.md`.
- Não muda o cálculo de prontidão nem o `WorkoutAnalysisListener` — o feedback é insumo novo, não
  substitui análise.
- Não faz notificação push (item 8 da revisão; sem change).
- Não redesenha a Home fora do hero (é `athlete-home-restructure`, pré-requisito).

## Critérios de aceite

**A**
1. Given treino planejado hoje com etapas, When `GET /me/treinos/hoje`, Then cada etapa traz
   `alvoPrimario` e os campos de FC/pace **iguais ao `WorkoutStep` que o `IntervalsIcuWorkoutConverter`
   produziria** para o mesmo atleta (FC vence; pace vira `textoSecundario`); Given atleta em fuso
   diferente do servidor às 23:50 locais, Then `hoje` é a data local do atleta.
2. Given a tela de modo treino em 390×844, Then perfil, três etapas e o botão "Concluí o treino"
   são visíveis sem scroll para treinos de até 4 etapas; acima disso, o botão fica fixo no rodapé.
3. Given "Concluí o treino", Then o registro abre com tipo, data e duração planejada preenchidos.
4. Given "Não vou conseguir hoje", Then o planejado fica `PERDIDO` com `motivoPulo`, aparece assim
   com motivo no Plano do atleta e no drilldown do coach **no mesmo dia**; nunca cria
   `TreinoRealizado`. Given registro posterior no mesmo dia por um caminho **que vincula ao
   planejado** — manual, sync do intervals.icu, reconciliação manual — Then o planejado vai a
   `REALIZADO` e `motivoPulo` é limpo. Upload `.fit` e Strava **não vinculam planejado** hoje
   (`FitTreinoPersister`, `Strava*ServiceImpl` só passam pela ingestão) **nem nesta change** —
   decisão 0.4, follow-up no Radar. (A fila de atenção não muda por um pulo isolado —
   comportamento existente da fila, ver `design.md` D4.)

**B**
5. Given `TreinoRealizado` de hoje (qualquer origem) sem `feedbackRegistradoEm`, Then a Home mostra
   "Treino feito · Como foi?" no lugar do hero — pré-preenchido com o RPE se já existir; Given
   carimbo presente, Then mostra o resumo do feedback até o fim do dia (no fuso do atleta).
6. Given envio com RPE 5 e chip `PERNAS_PESADAS`, Then `GET` do realizado devolve o feedback e o
   perfil do atleta no coach (`AtletaPerfilCoachOutputDto.realizadosRecentes`, seção "Treinos
   recentes" da `CoachAthleteProfilePage` — ambos novos, ver `design.md`) o exibe; `ultimoRpe` do
   readiness reflete 5; Given segundo POST, Then substitui; Given payload sem RPE, Then 400.
7. Given treino chegado por sync, Then o botão "Registrar treino" não aparece para aquele dia.

**Transversal**
8. Isolamento multi-tenant e por atleta em todos os endpoints novos (testes `@RequireTenant` +
   atleta de outro tenant → 404).
9. Backend `./mvnw verify` verde; front `lint + build + test:run` verdes; E2E
   `tests/e2e/athlete/training-loop.spec.ts` cobrindo 2, 3 e 5 em 390×844.

## Métrica de sucesso

- **Treinos com feedback (RPE + sensação) / treinos realizados** — hoje só registros manuais têm RPE;
  meta: > 60% dos realizados no piloto, incluindo os que chegam por sync.
- **Treinos dentro da zona alvo** (já calculado) — subir para quem usa o modo treino.

## Open Questions & Assumptions

- **Resolvido na criação (0.1):** não há entidade de ajuste de plano; a fatia C saiu (ver Non-Goals).
- **Verificado:** `IntervalsIcuFcAlvoResolver` é um helper sem estado (`resolver(FcAlvoBruto,
  Atleta)` sobre `ZonaTreinoService`) — invocável fora do push. **Premissa que fica:** o alvo por
  etapa depende de `fcAlvoEtapa` declarado; etapa só com zona textual e sem FC declarada pode
  resultar em `descartadoPorFaltaDeDado` — nesse caso a tela mostra a zona e omite o bpm, sem
  inventar faixa. Medir na 0.2 quantas etapas dos planos ativos têm alvo resolvível.
- **Premissa:** adicionar colunas a `TreinoRealizado` não altera `calcularTssRpe` nem o
  `ultimoRpe` — teste de regressão explícito na B.1.
- **Premissa:** o feedback por áudio reaproveita o armazenamento/transcrição que a mensageria vai
  introduzir; até lá, B grava só texto e o `AudioRecorder` fica desligado nesta tela.
- **Resolvido (0.3, founder, 2026-08-27):** motivo **opcional**, lista de 4 (`SEM_TEMPO`,
  `CANSADO`, `DOR`, `OUTRO`) — é o dado que o coach usa para ajustar, sem virar fricção.
- **Em aberto (fora desta change):** um pulo com motivo `DOR` merece sinal próprio na fila de
  atenção? Hoje a fila corta abaixo de ALTA e um pulo isolado não entra. Decisão da fila
  (`CoachAttentionSignalEvaluator`), não daqui — registrar no Radar se o piloto pedir.
- **Pré-mortem Codex (2026-08-26):** cinco achados, todos confirmados e incorporados — ver
  `design.md`, "Riscos e mitigações".
- **DoR (2026-08-27, `spec-reviewer` + Codex, ambos NOT READY):** convergiram em dois pontos —
  o upload `.fit` (e o Strava) nunca vinculou planejado, então "qualquer caminho" no CA4 era
  falso; e 0.3 é decisão humana que trava o contrato de `motivoPulo`. Só o Codex: D1 dizia
  `feedback == null` contradizendo D3 (corrigido para o carimbo); o drilldown do coach não tem
  realizados nem feedback (escopo explicitado); `/athlete/workout/today` não existe em `ROUTES`
  nem no `App.tsx` (task A.4); spec deltas em `openspec/specs/` eram condicionais (agora 0.5,
  antes de A.1). Só o `spec-reviewer`: `selectTodayState` não tinha fonte para "realizado de hoje"
  (D1: `me/home` devolve `realizadoHoje`); faltava rollback (design). Tudo verificado no código.
- **Sequência:** depende de `athlete-home-restructure` (hero) e `athlete-home-workout-profile`
  (etapas no contrato da Home; o modo treino usa endpoint próprio, mas o `WorkoutProfile` no front
  já estará ligado ao atleta).
- **Resolvido (0.3, 2026-08-27):** o founder é o atleta piloto — a métrica é medida no HomeLab,
  mesmo override de `athlete-home-restructure`.

## Referências

- Canvas, página "Ciclo do treino": pranchetas 1 (modo treino) e 2a (pós-treino). A 2b (o coach
  reagiu) espera a mensageria; a 3 (check-in inline) entrou em `athlete-home-restructure`.
- `fix-fc-alvo-base-inconsistente` (arquivada 2026-08-22): `IntervalsIcuFcAlvoResolver`, meta de
  intensidade declarada.
- `add-athlete-coach-messaging` (Sprint 28): pré-requisito da change futura "o coach reagiu".
- `add-post-workout-debrief`: fechada como redundante (CPO 2026-07-24) — esta change **não** é
  debrief por IA; é o insumo do atleta que o debrief/análise consome.

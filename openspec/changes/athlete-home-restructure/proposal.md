**Tamanho:** M · **Trilha:** Full

## Why

A revisão de design da tela do atleta (2026-08-26, canvas
<https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d>, página "Revisão Home e
Plano") reconstruiu a Home a partir do código e encontrou oito problemas — nenhum de dado, todos de
apresentação e de ação:

1. **A ação principal tem rótulo errado.** O botão do hero diz "Iniciar treino", mas abre o
   `QuickCheckInModal` (sono, humor, dores, energia, estresse); quando o check-in já foi feito, vira
   "Editado hoje". A ação que alimenta o motor — **Registrar treino** — fica no fim da página, em
   botão outlined, depois de ~1400px de scroll.
2. **O mesmo dado aparece em três lugares.** Streak (card próprio + resumo semanal), próximo treino
   (hero + resumo), forma (resumo + "Métricas de hoje").
3. **Sem hierarquia, sem data.** Nove blocos com o mesmo tratamento glass; a página não diz que dia é
   hoje; o hero abre com uma frase motivacional fixa (`MENSAGEM_HERO`, copy hardcoded).
4. **Jargão para o atleta.** CTL/ATL/TSB como "48 pts", explicados só em `Tooltip` de hover — que não
   existe no toque.
5. **O shell não consome os próprios tokens.** Todo texto MUI sai em Syne (só 700/800 carregadas);
   `font.text` = Inter existe em `theme.premium.ts` e não é usado; tamanhos em `rem` fora da escala
   de 7 níveis; raios 8/12/16 misturados; `ReadinessCard` sólido entre cards glass.
6. **Cor do tipo de treino diverge entre telas.** Hero usa `workoutTypeColor` (FACIL → slate);
   `DayCard` usa `categorical.cat1` (azul) para o mesmo treino.
7. **Barra inferior.** Seis alvos em 390px; "Sair" como destino de navegação; o badge do Coach existe
   em `AthleteBottomNav` (`unreadCoachMessages`) e nenhum consumidor o passa.
8. **Oito fetches, sete Alerts.** Cada hook falha com um `Alert` próprio; em falha parcial a Home vira
   uma pilha de avisos entre os cards.

**Por que isso importa para o treinador.** A Home é onde o atleta decide registrar o treino e fazer
o check-in — os dois dados que alimentam prontidão, fila de atenção e a próxima prescrição. Uma Home
que esconde o registro e mente no rótulo do check-in produz menos dado, e o coach compensa cobrando
por mensagem. O ganho é do treinador: mais registros sem cobrança, e menos "qual é o treino de hoje?".

## What Changes

Somente `apps/menthoros-front`, shell `features/athlete/`. Versão proposta desenhada no canvas
(prancheta "Home — proposta"):

- **Cabeçalho** com data por extenso e saudação por período do dia; a frase motivacional fixa sai.
- **Check-in vira linha de estado** com rótulo honesto: "Fazer check-in" / "Check-in de hoje feito ·
  às 07:12 · Editar". Continua abrindo o `QuickCheckInModal` existente.
- **Check-in inline (XS dentro desta change):** os cinco sliders 1–10 do modal ganham uma
  alternativa de três estados por item, na própria Home, salvando a cada toque; o modal fica atrás de
  "Mais detalhes". Mapeamento para `CheckinProntidaoInputDto` definido no `design.md`.
- **Hero = o treino de hoje**, com **uma** ação primária: "Registrar treino" (`ROUTES.ATHLETE_TRAINING_LOG`).
  Chip do tipo com cor de `workoutTypeColor`. Link secundário "Ver plano da semana".
- **Prontidão em uma linha** (anel 56px + rótulo + recomendação + origem "com base no seu check-in").
- **Um card "Sua semana"** absorve streak, volume realizado/planejado (do `useAthletePlan`), 7 pontos
  de dia e próxima prova. `KudosCard` vira uma linha. `WeeklySummaryCard`, o card de streak e o de
  prova deixam de existir como blocos separados.
- **CTL/ATL/TSB saem da Home** — fica "Forma: <statusForma>" em linguagem simples + link "Ver
  progresso". `buildHomeMetrics` deixa de ser consumido pela Home.
- **Erros parciais consolidados**: um único `Alert` de "alguns dados não carregaram · Recarregar" no
  topo, em vez de um por hook; erro do resumo principal (`useAthleteHome`) continua bloqueante.
- **Tokens**: `font.display` (Space Grotesk) para títulos e números, `font.text` (Inter) para texto,
  via `ThemeProvider` próprio do shell do atleta (precedente: `features/coach/theme/coachTheme.ts`);
  escala `typography` de 7 níveis; dois raios (`radius.lg` externo, `radius.md` interno); superfície
  `elevation.card` + borda `surface[700]`.
- **`AthleteBottomNav`**: "Sair" sai da barra e vai para o Perfil (com o mesmo `ConfirmDialog`);
  cinco destinos; `unreadCoachMessages` passa a ser alimentado quando houver fonte (hoje não há —
  ver Open Questions).

## Non-Goals

- Não muda contrato de API nem backend. Os dados são os mesmos hooks de hoje.
- Não traz o perfil do treino ao hero — é `athlete-home-workout-profile` (depende de contrato).
- Não redesenha Plano, Progresso, Coach ou Perfil (Plano é `athlete-plan-agenda`).
- Não troca a fonte global do `appTheme` — o tema do atleta é local ao shell.
- Não implementa notificações nem o ciclo pós-treino (`athlete-training-loop`).

## Critérios de aceite

1. **Ação honesta** — Given a Home carregada sem check-in hoje, When o atleta lê a tela, Then o
   único botão primário sólido é "Registrar treino" e o check-in aparece como "Fazer check-in";
   Given check-in feito, Then a linha mostra "Check-in de hoje feito" com horário e "Editar".
2. **Check-in inline** — Given a Home, When o atleta toca um item do check-in inline, Then o estado
   cicla (3 estados), o `POST /api/v1/checkins` é enviado com os valores mapeados e a prontidão é
   refetchada; Given falha no POST, Then o item volta ao estado anterior e um erro é exibido.
3. **Sem repetição** — Given a Home, Then streak, próximo treino e forma aparecem **uma** vez cada
   (asserção por texto único no teste de página).
4. **Sem jargão** — Given a Home, Then não há texto "CTL", "ATL", "TSB" nem unidade "pts"; existe
   link para `ROUTES.ATHLETE_PROGRESS`.
5. **Data** — Given a Home, Then o cabeçalho exibe a data corrente por extenso em PT-BR.
6. **Erros consolidados** — Given falha em dois hooks secundários (ex.: kudos e provas), Then a Home
   exibe **um** `Alert` com ação "Recarregar" que refetcha os que falharam; Given falha em
   `useAthleteHome`, Then o estado de erro bloqueante atual se mantém.
7. **Barra** — Given qualquer rota do atleta, Then a barra tem cinco itens, sem "Sair"; "Sair" existe
   no Perfil com confirmação; Given `unreadCoachMessages > 0`, Then o badge aparece no item Coach.
8. **Tokens** — Given a Home renderizada, Then nenhum texto usa `font-family` Syne; todos os
   `font-size` pertencem à escala `typography` (teste mecânico varrendo nós de texto visíveis,
   mesmo padrão de `tests/e2e/coach/inbox.spec.ts`).
9. **Cor do tipo** — Given próximo treino FACIL, Then o chip usa a mesma cor que o `DayCard` do
   Plano usará (`workoutTypeColor`) — asserção compartilhada com `athlete-plan-agenda`.
10. **Regressão** — `npm run lint && npm run build && npm run test:run` verdes; E2E
    `tests/e2e/athlete/home.spec.ts` (novo) cobrindo 1, 2, 6 e 7 em 390×844.

## Métrica de sucesso

- **Taxa de registro de treino sem cobrança do coach**: proporção de treinos planejados com registro
  (manual, `.fit` ou sync) em até 24h, medida em `PlanoSemanal`/`TreinoRealizado`. **Baseline medido
  nas 4 semanas anteriores ao rollout** (query registrada na task 0.2); alvo: **+15 pp** nas 4
  semanas seguintes. Proxy do tempo que o coach gasta cobrando dado.
- **Check-ins por atleta ativo por semana** — baseline nas mesmas 4 semanas; alvo **+30%** com o
  check-in inline (o modal de cinco sliders é a hipótese de abandono).
- **O que esta change não é:** não alimenta o loop `WeekSuggestion` (proposta da IA vs. edição do
  coach). É infraestrutura de qualidade do dado de entrada — check-in e registro — que esse loop e
  a fila de atenção consomem. Não conta como avanço de moat.
- Proxy mecânico: E2E dos critérios 1–8 verdes em 390×844.

## Open Questions & Assumptions

- **Pré-condição de entrada (task 0.1, bloqueia o resto):** o mapeamento 3 estados → slider 1–10
  (ruim/médio/bom = 3/6/9; dores e estresse invertidos 0/4/8) preserva a semântica do cálculo de
  prontidão no backend (`ReadinessService`). Se o cálculo for sensível a granularidade, o inline
  grava e o modal segue como caminho de precisão — decidido **antes** da primeira task de código.
- **Pré-condição (task 0.3):** confirmar com o founder se há assessoria piloto com atletas usando o
  shell hoje. Se não houver, a change é candidata a pós-piloto — a métrica de sucesso não teria
  como ser medida.
- **Premissa:** `useAthletePlan` já traz `volumeRealizadoKm`/`volumePlanejadoKm` — o card "Sua
  semana" não precisa de endpoint novo.
- **Em aberto:** fonte de `unreadCoachMessages`. Não existe até `add-athlete-coach-messaging`
  (Sprint 28, 0%). Esta change liga a prop no `AthleteLayout` com valor `0` e deixa o ponto de
  injeção; o badge real vem com a mensageria.
- **Em aberto:** o `ThemeProvider` do atleta muda a fonte de todo o shell, inclusive telas que esta
  change não redesenha (Progresso, Coach, Perfil). Assumido como aceitável, com critério objetivo
  no smoke (task 6.2): conta como "estouro" — e é corrigido aqui — texto cortado/truncado, scroll
  horizontal (`scrollWidth > innerWidth`) ou controle abaixo de 44px; qualquer outra diferença
  (peso, espaçamento, quebra de linha diferente) é registrada como follow-up, não corrigida nesta
  change.
- **Premissa que pode cair:** "Sair" no Perfil é encontrável. Se o piloto mostrar atletas presos
  logados em aparelho compartilhado, reavaliar.

## Referências

- Canvas da revisão: <https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d>
  (página "Revisão Home e Plano": prancheta "Home — atual" com notas 1–8; "Home — proposta").
- Changes anteriores do shell: `refine-athlete-shell-ux` (2026-06-01), `wire-athlete-shell-to-endpoints`
  (2026-07-03), `wire-readiness-checkin-to-athlete` (2026-07-04) — em `changes/archive/`.

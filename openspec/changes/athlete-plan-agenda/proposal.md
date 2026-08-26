**Tamanho:** M · **Trilha:** Full

## Why

A revisão de design da tela do atleta (2026-08-26, canvas
<https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d>, prancheta "Plano — atual")
encontrou cinco problemas no `AthletePlanPage`:

1. **A semana não cabe.** `WeeklyPlanList` é um scroll horizontal de `DayCard` de 160–200px:
   ~2 dias visíveis em 390px. A visão da semana — o motivo da tela — exige arrastar.
2. **Toque sem resposta.** Os cards têm `cursor: pointer` e hover, mas `handleDayPress` é no-op
   ("Futuramente: abrir detalhe do treino").
3. **Unidades desencontradas.** Cards falam "45 min" e "TSS estimado: 52"; o rodapé fala km — e os
   14,5 km da Home viram 14 km aqui (`Math.round` em `AthletePlanPage`). Dias futuros a 60% de
   opacidade esmaecem justamente o que o atleta abriu a tela para ver.
4. **A leitura da carga julga cedo.** Na quarta, 14/42 km rende "Semana leve — abaixo do planejado"
   (`getTSSInterpretation` ignora o dia da semana). A cor da barra fica verde a partir de 0,8, mas o
   texto diz "moderada" até 0,85.
5. **Codificação tripla.** Hoje = borda esquerda lime + badge HOJE + fundo tingido; concluído = borda
   verde + check. Cores de tipo por `categorical.cat*`, divergentes do `workoutTypeColor` da Home.

**Por que isso importa para o treinador.** O plano é o artefato que o coach aprovou; se o atleta não
consegue vê-lo inteiro no celular, o coach recebe a pergunta por mensagem. "Semana leve — abaixo do
planejado" na quarta é uma cobrança que o coach não fez e que o atleta atribui a ele.

## What Changes

Somente `apps/menthoros-front`. Versão proposta desenhada no canvas (prancheta "Plano — proposta"):

- **Agenda vertical**: os sete dias em linhas (data · ponto de cor do tipo · título · "45 min · ~8 km
  · Zona 2" · status). Hoje expandido com descrição e ação "Registrar treino". Descanso como linha
  curta. Futuro em opacidade cheia. `WeeklyPlanList`/`DayCard` são substituídos por `WeekAgenda`/
  `WeekAgendaRow`.
- **Toque no dia** abre o detalhe do treino (drawer/página) com descrição completa e etapas quando o
  contrato as trouxer — ver Open Questions. Sem detalhe disponível, o toque expande a linha.
- **Navegação de semana** (anterior/próxima) — gated pela existência de endpoint (Open Questions);
  sem ele, os controles não aparecem.
- **Volume em km** nos dois lugares, com uma casa decimal (`toFixed(1)`), e marcador do "esperado
  até hoje" na barra; texto neutro "Dia N de 7 · X de Y treinos feitos" substitui a interpretação
  qualitativa. `getTSSInterpretation`/`getTSSBarColor` saem.
- **Status por ícone** (check / chevron / traço de descanso), sem borda lateral colorida.
- **Cor do tipo** por `workoutTypeColor` (mesma fonte da Home) + legenda.

## Non-Goals

- Não muda contrato de API. Semanas passadas e etapas por treino só entram se o contrato já expuser
  (verificar na task 0.1); caso contrário ficam registradas como follow-up.
- Não redesenha a Home (`athlete-home-restructure`) nem o registro de treino.
- Não implementa "modo treino" (tela de execução) — `athlete-training-loop`.

## Critérios de aceite

1. **Semana inteira visível** — Given viewport 390×844, When o Plano carrega, Then as sete linhas
   estão no fluxo vertical, sem scroll horizontal (`scrollWidth === innerWidth` no documento e no
   container da agenda).
2. **Hoje em destaque** — Given a semana corrente, Then a linha de hoje está expandida, com a ação
   "Registrar treino" navegando para `ROUTES.ATHLETE_TRAINING_LOG`; When a Home é aberta a partir
   de outro dia da semana, Then só o dia corrente está expandido.
3. **Toque responde** — Given uma linha, When tocada, Then ela expande/colapsa (ou abre o detalhe,
   se disponível); nenhuma linha tem `cursor: pointer` sem comportamento.
4. **Unidades** — Given plano com 14,5 km realizados, Then o Plano exibe "14,5 / 42 km" (mesmo
   valor da Home); nenhum texto "TSS" na tela do atleta.
5. **Leitura neutra** — Given quarta-feira e 14,5/42 km, Then o rodapé exibe "Dia 3 de 7" e a
   contagem de treinos feitos, sem juízo ("leve", "abaixo do planejado").
6. **Status** — Given treino concluído/pulado/futuro, Then o status é um ícone; nenhum elemento usa
   `border-left` colorido como codificação de estado.
7. **Cor do tipo** — Given treino FACIL, Then o ponto de cor é `workoutTypeColor('FACIL')` — o mesmo
   hex do chip da Home.
8. **Regressão** — `npm run lint && npm run build && npm run test:run` verdes; E2E
   `tests/e2e/athlete/plan.spec.ts` (novo) cobrindo 1, 2, 3 e 5 em 390×844.

## Métrica de sucesso

- **Mensagens "qual é o treino de hoje/amanhã?"** recebidas pelo coach — cair após a entrega.
  Até a mensageria existir a contagem é manual e **tem dono e lugar**: o coach do piloto anota
  por semana (WhatsApp) numa linha do `artifacts/` do piloto; 2 semanas antes e 4 depois do
  rollout. Se não houver coach piloto disposto a contar, a métrica cai para o proxy mecânico.
- Proxy mecânico: E2E dos critérios 1–7 verdes.

## Open Questions & Assumptions

- **Em aberto:** `GET /api/v1/atletas/me/plano` (via `useAthletePlan`) devolve só a semana corrente?
  Task 0.1 verifica; se sim, navegação de semana fica de fora e vira follow-up no backend.
- **Em aberto:** o plano do atleta traz etapas por treino? Se `useAthletePlan` já expõe as etapas
  (`EtapaTreino`), o detalhe do dia mostra a lista; se não, o toque só expande a linha e o detalhe
  completo entra com `athlete-training-loop`.
- **Premissa:** a distância estimada por treino (~8 km) pode ser derivada de duração × pace alvo
  quando o contrato trouxer pace; sem isso, a linha mostra só duração e zona. Não fabricar valor.
- **Premissa:** o `Math.round` do volume era só apresentação — o backend devolve `BigDecimal`.

## Referências

- Canvas: <https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d> (pranchetas
  "Plano — atual" com notas 1–5 e "Plano — proposta").
- `athlete-home-restructure` — compartilha `workoutTypeColor` como fonte única de cor (D5 lá).

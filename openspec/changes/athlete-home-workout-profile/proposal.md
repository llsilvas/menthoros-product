**Tamanho:** S · **Trilha:** Full

## Why

O coach vê o perfil do treino (`features/workout/profile/WorkoutProfile`) no `DetalheTreinoDialog`
ao selecionar um atleta: blocos por zona, rampas de aquecimento/desaquecimento, eixo de tempo e
distribuição. O atleta — quem vai executar aquele treino — não vê. Na Home, o próximo treino chega
como tipo + descrição em texto (`AthleteProximoTreino { data, tipoTreino, descricao }`).

Pedido do founder na revisão de design de 2026-08-26: o gráfico "entraria muito bem no treino do
dia". A prancheta "Home — proposta" do canvas já o mostra no hero, na variante compacta.

**Por que isso importa para o treinador.** O perfil é a prescrição do coach em forma visual. Quando
o atleta o vê, executa o que foi prescrito (e não a descrição em prosa que ele interpretou) — menos
"não entendi o treino" e menos treino fora da zona para o coach corrigir na revisão.

## What Changes

**Backend (`apps/menthoros-backend`):**
- `AtletaHomeDto.proximoTreino` passa a incluir `etapas` (lista de `EtapaTreinoDto` já usada pelo
  detalhe do coach — mesmo DTO, sem duplicar), `duracaoMin` e `zonaAlvo` quando existirem. Campos
  ausentes continuam omitidos (`@JsonInclude(NON_NULL)`).
- Sem migration, sem endpoint novo: `GET /api/v1/atletas/me/home` ganha campos.

**Frontend (`apps/menthoros-front`):**
- `AthleteProximoTreino` ganha `etapas?`, `duracaoMin?`, `zonaAlvo?` (cliente curado, portado à mão).
- `buildNextWorkout` monta `profile` via `selectWorkoutProfile(etapas.map(fromEtapaTreino))` e
  `estimatedDuration` de `duracaoMin`.
- `TodayHeroCard` renderiza `<WorkoutProfile variant="compact" />` quando `profile.blocks.length >
  0`; sem etapas, nada é renderizado (sem placeholder).

## Non-Goals

- Não muda o `WorkoutProfile` — reuso puro. Ajustes de legibilidade em 390px, se aparecerem, viram
  follow-up na linha `polish-workout-profile-*`.
- Não expõe alvos de FC/pace por etapa ao atleta — `athlete-training-loop` (modo treino).
- Não traz o perfil ao Plano (o `WorkoutDetailDrawer` de `athlete-plan-agenda` o reutiliza se
  existir).

## Critérios de aceite

1. **Contrato** — Given próximo treino com etapas, When `GET /api/v1/atletas/me/home`, Then
   `proximoTreino.etapas[]` vem com os mesmos campos do detalhe do coach; Given treino sem etapas,
   Then o campo é omitido. Teste de controller/serialização.
2. **Isolamento** — Given atleta A, Then o endpoint nunca devolve etapas de plano de outro atleta
   (teste existente de `me/home` estendido).
3. **Hero** — Given etapas, Then o hero renderiza o `WorkoutProfile` compacto (data-testid
   `workout-profile`); Given sem etapas, Then não há placeholder nem espaço reservado.
4. **Regressão** — backend `./mvnw verify` verde; front `lint + build + test:run` verdes; E2E de
   Home (de `athlete-home-restructure`) estendido para asserir o perfil presente com fixture de etapas.

## Métrica de sucesso

- **Treinos executados dentro da zona alvo** (tempo em zona vs. prescrito, já calculado pelo
  `WorkoutAnalysisListener`) — subir para atletas com o perfil visível. Menos correção na revisão.

## Open Questions & Assumptions

- **Premissa:** o `EtapaTreinoDto` do detalhe do coach não carrega campo sensível ao atleta (ex.:
  anotação interna do coach). Verificar na task 1.1; se carregar, criar projeção.
- **Premissa:** `selectWorkoutProfile` + `fromEtapaTreino` aceitam o DTO sem adaptação (mesma
  origem). Se o adapter do coach depender de campos que o `me/home` não traz, o adapter do atleta
  absorve.
- **Sequência:** entra **depois** de `athlete-home-restructure` (o hero é reescrito lá). Pode ser
  feito em paralelo no backend.

## Referências

- Canvas: <https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d> ("Home — proposta").
- `refactor-workout-profile-chart`, `polish-workout-profile-legibilidade` (arquivadas) — o componente.

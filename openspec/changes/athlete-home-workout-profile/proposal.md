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
- `AtletaHomeDto.ProximoTreino` (hoje só `data`, `tipoTreino`, `descricao` — `:25`) passa a incluir
  `etapas` (lista de `EtapaTreinoDto` já usada pelo detalhe do coach — mesmo DTO, sem duplicar;
  traz `blocoId`/`blocoRepeticoes`, **sem índice de repetição**), `duracaoMin` como **inteiro de
  minutos** (no modelo `TreinoBase.duracaoMin` é `Duration`; o front espera número) e `zonaAlvo`.
  Campos ausentes continuam omitidos (`@JsonInclude(NON_NULL)`). `getHome` já é
  `@Transactional(readOnly)` (`AtletaProgressServiceImpl:209`): as etapas `LAZY` carregam no mapper.
- **Regra do "próximo treino" não muda** — continua o primeiro treino planejado entre hoje e D+14
  (`AtletaProgressServiceImpl:212`), **sem filtro de status**: o treino de hoje aparece no hero
  mesmo depois de `REALIZADO`, porque o hero é "treino de hoje", e o estado "feito / como foi?" é
  de `athlete-training-loop` (D1 lá). Desempate quando há mais de um treino no mesmo dia: a query
  ganha ordenação secundária por `createdAt` para o resultado ser estável.
- Sem migration, sem endpoint novo: `GET /api/v1/atletas/me/home` ganha campos.

**Frontend (`apps/menthoros-front`):**
- `AthleteProximoTreino` ganha `etapas?`, `duracaoMin?`, `zonaAlvo?` (cliente curado, portado à mão).
- `buildNextWorkout` monta `profile` com o **mesmo caminho do `WorkoutDetailDrawer`**
  (`athlete-plan-agenda`): `selectWorkoutProfile(indexarRepeticoes(etapas.map(fromEtapaTreino)),
  { sport: 'run', tss, if, zonaAlvoTreino })` — sem `indexarRepeticoes` a série cai em índice 1;
  `estimatedDuration` de `duracaoMin`.
- `TodayHeroCardProps.nextWorkout` ganha `profile?: WorkoutProfileData`; o card renderiza
  `<WorkoutProfile variant="compact" />` quando `profile.blocks.length > 0`; sem etapas, nada é
  renderizado (sem placeholder). O hero cresce ~150px: o gate "Registrar treino visível sem
  scroll em 390×844" do E2E da Home passa a rodar **com** fixture de etapas.

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
4. **Série** — Given etapas de um bloco 2× (4 linhas com o mesmo `blocoId`), Then o perfil no hero
   mostra o bracket "2×" (`repeat-bracket`) — `indexarRepeticoes` aplicado.
5. **Regressão** — backend `./mvnw verify` verde; front `lint + build + test:run` verdes; E2E de
   Home (de `athlete-home-restructure`) estendido: fixture **com etapas**, `workout-profile`
   presente **e** "Registrar treino" ainda visível sem scroll em 390×844.

## Métrica de sucesso

- **Treinos executados dentro da zona alvo** (tempo em zona vs. prescrito, já calculado pelo
  `WorkoutAnalysisListener`) — subir para atletas com o perfil visível. Menos correção na revisão.

## Open Questions & Assumptions

- **Premissa:** o `EtapaTreinoDto` do detalhe do coach não carrega campo sensível ao atleta (ex.:
  anotação interna do coach). Verificar na task 1.1; se carregar, criar projeção.
- **Verificado (DoR):** `EtapaTreinoDto` não tem campo sensível ao atleta — reuso sem projeção
  (D1). `fromEtapaTreino`/`indexarRepeticoes` já consomem esse DTO no drawer do Plano.
- **Sequência:** entra **depois** de `athlete-home-restructure` (o hero é reescrito lá). Pode ser
  feito em paralelo no backend.

## Definition of Ready (2026-08-26)

- `spec-reviewer`: **READY** — task 1.1 resolvida (sem campo sensível; `getHome` em transação);
  dois detalhes de execução incorporados (`indexarRepeticoes` + `ProfileContext` na 2.2; `profile`
  na interface do hero na 2.3).
- Codex, rodada 1: **NOT READY**. Incorporados: `indexarRepeticoes` obrigatório; `duracaoMin` é
  `Duration` no modelo → inteiro de minutos no DTO; regra do próximo treino explicitada (sem
  filtro de status, por desenho — o estado "feito" é da `training-loop`) com desempate por
  `createdAt`; E2E com fixture de etapas mantendo o gate do botão visível; racional do
  `variant="compact"` corrigido (`useResolvedVariant` só resolve `full` a partir de 560px — o
  explícito fica por determinismo, não por risco). **Refutado:** "o DTO não expõe os campos" — é o
  escopo da change, não uma premissa falsa.

## Referências

- Canvas: <https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d> ("Home — proposta").
- `refactor-workout-profile-chart`, `polish-workout-profile-legibilidade` (arquivadas) — o componente.

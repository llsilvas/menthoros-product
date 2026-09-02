# Design — prova-no-plano-semanal

Motivação em `proposal.md`; requisitos em `specs/prova-no-plano-semanal/spec.md`. Depende de
`atleta-cadastra-prova` (`distanciaKm` sempre preenchido, posse, flag de ciência).

## Context

Levantado em 2026-09-02:

- Geração (`PlanoServiceImpl.gerarPlanoTreino`): contexto → LLM (`IaServiceImpl`, com
  `validarENormalizarPlanoGerado` ainda em DTO) → `PlanGenerationPersister.persist`. No
  persister, `obterTreinosParaPlano` (redistribuição em `SEMANA_ATUAL` + validação) e
  `criarPlanoComTreinos` (DTO → `TreinoPlanejado` via `TreinoMapper`, `dataTreino` calculada
  do `diaSemana`) são o último ponto em DTO antes do cálculo de volume e do `save`.
  `PlannerEngine` roda em shadow puro: nunca altera plano.
- `TreinoPlanejado` obrigatórios: `diaSemana`, `dataTreino`, `tipoTreino`, `duracaoMin`,
  `planoSemanal`, `atleta`, `tenantId`; opcionais `distanciaKm`, `descricao`, `ritmoAlvo`,
  `zonaAlvo`, `etapas`. `TipoTreino.PROVA` existe (IF 1.3, "Zona 3-4 race pace").
- `reviewStatus`: nasce `AGUARDANDO_REVISAO`; `PlanoReviewServiceImpl.aprovarTransicao` é o
  único caminho para `APROVADO`; `validarTransicao` só permite sair de `AGUARDANDO_REVISAO`.
  **Não existe volta.** O atleta (`PlanoServiceImpl.java:218`) recebe o último plano `APROVADO`
  por `semanaInicio` desc — um plano reaberto sumiria e ele veria a semana anterior.
- Vínculo realizado ↔ planejado em três pontos: `TreinoServiceImpl.registrarTreinoManual`
  (match por data + tipo, `findFirstForManualMatch`), `TreinoServiceImpl.lancarTreino` (id
  explícito, coach) e `ReconciliationDecisionExecutor` / `ManualReconciliationServiceImpl`
  (FIT e Strava). Status de execução gravado é `REALIZADO`. `TreinoRegistradoEvent` é publicado
  na ingestão, antes do vínculo, e só alimenta a análise IA.
- `ProvaServiceImpl` não publica evento. `PlanoSemanalRepository.findByAtletaIdAndSemana(atletaId, data)`
  encontra a semana que contém uma data.
- Prompt: `PlanoTreinoPromptBuilder.java:211` chama `formatarEventoCompetitivoSemana`, único
  call site; golden `taper-semana-prova.txt` congela o bloco `[SIM]`.
- Front: `buildWeekAgenda.ts` resolve `title` e `color` por `tipoTreino`; `workoutTypeColor`
  cai em `DEFAULT` para `PROVA`; `TIPO_TREINO_LABEL` já tem `PROVA: 'Prova'`.

## Goals / Non-Goals

**Goals:**
- Um único componente responsável por "prova ↔ treino planejado" (`ProvaNoPlanoService`),
  chamado pela geração e pelo CRUD de prova.
- Reabertura de revisão como transição explícita e auditável, sem mudar o significado de
  `reviewStatus` nos demais fluxos.
- Fechamento do resultado por um único método chamado nos três pontos de vínculo.

**Non-Goals:**
- Mexer no `PlannerEngine`, no shadow ou na divergência `RACE_WEEK`/`PÓS-PROVA`.
- Regras de conflito entre provas.
- Alterar a tela de revisão além de mostrar o motivo.

## Decisions

### D1. Vínculo persistido `TreinoPlanejado.prova`

Migration `V86`: `ALTER TABLE tb_treino_planejado ADD COLUMN prova_id uuid NULL REFERENCES
tb_prova(id) ON DELETE SET NULL` + índice parcial `WHERE prova_id IS NOT NULL`. Campo
`@ManyToOne(optional = true) Prova prova` na entidade e `provaId` no DTO de saída.

*Por que persistir:* sem o vínculo, "qual planejado é a prova" seria inferido por data + tipo, e
duas provas na semana ou uma prova movida quebram a inferência. `ON DELETE SET NULL` cobre a
deleção física por `ADMIN`.

### D2. `ProvaNoPlanoService` como único dono da regra

Componente em `services/plano/` com três operações:

```
garantirProvasNaSemana(List<TreinoPlanejadoLlmDto> treinos, PlanoContext ctx) -> List<TreinoPlanejadoLlmDto>
   // chamado por PlanGenerationPersister.obterTreinosParaPlano, ainda em DTO
aplicarProvaEmSemanaExistente(Prova prova)         // chamado por ProvaServiceImpl após criar/atualizar
removerProvaDeSemanaExistente(Prova prova, LocalDate dataAntiga)  // após cancelar/mover
```

`garantirProvasNaSemana`: para cada prova não cancelada em `[semanaInicio, semanaFim]`, remove
os DTOs do mesmo `diaSemana` e adiciona um `TreinoPlanejadoLlmDto` `PROVA` construído por
`construirTreinoProva(prova, atleta)`. Marca o DTO com `provaId` para o mapper preencher o
vínculo. Roda **depois** da redistribuição (`SEMANA_ATUAL`) e **antes** de `validarTreinosGerados`
e do cálculo de volume, para que o volume inclua a prova e a validação veja o resultado final.

*Por que em DTO e não na entidade:* é o mesmo nível em que a redistribuição já trabalha, o
`TreinoMapper` continua sendo o único construtor de entidade, e o `volumePlanejadoKm` é calculado
logo depois sem código extra.

`construirTreinoProva`: `tipoTreino = PROVA`, `descricao = nomeProva`, `distanciaKm` da prova,
`ritmoAlvo = tempoObjetivo / distanciaKm` (min/km) quando há tempo objetivo, `duracaoMin =
tempoObjetivo` ou, sem ele, `paceLimiar × distância` (o contexto já carrega zonas/pace do
atleta); `zonaAlvo = "Zona 3-4"` (do enum); sem etapas. `adicionadoPeloCoach = false`,
`editadoPeloCoach = false`.

### D3. Prompt: instrução explícita, golden regenerado

`formatarEventoCompetitivoSemana` ganha, no bloco `[SIM]`, as linhas:
"- Prescreva no dia <dia da semana> (<data>) um único treino do tipo PROVA com o nome <nome>. Não
prescreva outro treino nesse dia." — uma por prova da semana. Golden regenerado com
`-Dgolden.update=true` e diff revisado no PR (só as linhas novas devem mudar).

*Por que manter a instrução se há garantia determinística:* o LLM planeja o resto da semana em
função do que acha que está no domingo; sem a instrução ele pode colocar o longo no sábado. A
garantia corrige o dia; a instrução corrige a semana.

### D4. Reabertura de revisão como transição própria

`PlanoSemanal` ganha `motivoReabertura` (enum `MotivoReaberturaRevisao { PROVA_INSERIDA,
PROVA_REMOVIDA }`, nullable) e `reabertoEm` (timestamp, nullable). Migration `V87` aditiva.

`PlanoReviewServiceImpl.reabrirRevisao(planoId, motivo)`: permitido só de `APROVADO` para
`AGUARDANDO_REVISAO` em semana não encerrada; grava motivo e `reabertoEm`; publica
`PlanoReabertoEvent` (novo, para a fila de atenção poder consumir depois — fora do escopo aqui).
`aprovarTransicao` e `rejeitar` limpam `motivoReabertura` e `reabertoEm`. `validarTransicao`
continua recusando qualquer outra volta.

**Visibilidade do atleta** (o achado do levantamento): a query de `PlanoServiceImpl` para
`ATLETA` passa a "último plano por `semanaInicio` desc com `reviewStatus = APROVADO` **ou**
(`AGUARDANDO_REVISAO` e `motivoReabertura IS NOT NULL`)". Um plano reaberto foi aprovado uma vez;
o atleta continua vendo a versão vigente com a prova inserida. Plano nunca aprovado continua
invisível como hoje.

*Alternativa descartada:* manter `APROVADO` e só sinalizar com uma flag. Deixaria o coach fora do
circuito num plano que mudou de conteúdo — o oposto do coach-in-the-loop. Também descartado
"status novo `REABERTO`": espalharia um quarto estado por todos os filtros do front e do back.

### D5. Gatilho a partir do CRUD de prova, síncrono e na mesma transação

`ProvaServiceImpl.criarProva` / `atualizarProva` / `cancelarProva` chamam
`ProvaNoPlanoService` **depois** do `save`, na mesma transação:

- criar: `aplicarProvaEmSemanaExistente(prova)` se `findByAtletaIdAndSemana(atletaId, dataProva)`
  encontra plano não encerrado.
- atualizar com mudança de data: `removerProvaDeSemanaExistente(prova, dataAntiga)` e depois
  `aplicarProvaEmSemanaExistente(prova)`; mudança só de nome/tempo objetivo: atualiza
  `descricao`/`ritmoAlvo`/`duracaoMin` do treino vinculado sem reabrir revisão.
- cancelar: `removerProvaDeSemanaExistente`.

`aplicarProvaEmSemanaExistente`: remove treinos `PENDENTE` do dia (o `PROVA` de outra prova no
mesmo dia é mantido — ver riscos), cria o `TreinoPlanejado` `PROVA` direto na entidade (mesmo
`construirTreinoProva`, via mapper), recalcula `volumePlanejadoKm`, e se `APROVADO` chama
`reabrirRevisao(PROVA_INSERIDA)`. `removerProvaDeSemanaExistente`: remove o `PROVA` vinculado se
`PENDENTE`/`PERDIDO` (nunca `REALIZADO`), recalcula volume, reabre com `PROVA_REMOVIDA`.

*Por que síncrono e não evento:* o atleta que acabou de salvar a prova abre o plano em seguida
e precisa ver a prova; e o CRUD já está numa transação. Evento assíncrono ficaria para a
notificação do coach, que a fila de atenção da change anterior já cobre.

### D6. Fechamento do resultado por um único método

`ProvaResultadoSyncer.aoVincular(TreinoPlanejado planejado, TreinoRealizado realizado)`:
se `planejado.tipoTreino == PROVA` e `planejado.prova != null`, grava `prova.foiRealizada =
true` e `prova.tempoRealizado = realizado.duracao`. Chamado nos três pontos de vínculo:
`TreinoServiceImpl` (manual, `:584`; coach, `:123`), `ReconciliationDecisionExecutor` (`:121`) e
`ManualReconciliationServiceImpl` (`:83`). Desvincular não mexe na prova.

*Por que não `TreinoRegistradoEvent`:* ele dispara na ingestão, antes de existir vínculo (FIT e
Strava só vinculam na reconciliação). O ponto certo é onde `treinoPlanejado` é setado.

**Match manual**: `findFirstForManualMatch(…, tipo = PROVA)` já encontra o planejado `PROVA` do
dia quando o atleta registra com tipo `PROVA`. O front do registro manual precisa oferecer
`PROVA` no seletor de tipo (verificar; se o seletor é fechado, adicionar).

### D7. Front

- `theme.premium.ts` `trainingType.PROVA = '#BDDE5A'` (lime da marca; é o dia mais importante e
  a agenda já usa lime para "hoje"). `buildWeekAgenda.ts` passa `provaId`, `distanciaKm` e
  `ritmoAlvo` para a row.
- `WeekAgendaRow`: quando `tipoTreino === 'PROVA'`, renderiza bandeira (SVG inline) no lugar do
  dot, borda `alpha(primary, .45)` e fundo `alpha(primary, .10)`, título = `descricao` (nome da
  prova), meta = "`{distanciaKm} km · Prova · meta {tempoObjetivo}`" (meta só com `ritmoAlvo`).
- `AthletePlanPage`: `RaceTargetBanner` (da change anterior) ganha o estado "Prova nesta semana ·
  <nome> · <dia> · faltam N dias", com prioridade sobre o estado de prova-alvo.
- `CoachPlanReviewPage`: chip "Reaberto: prova inserida/removida" quando `motivoReabertura` vem
  no `PlanoSemanalOutputDto`.

## Risks / Trade-offs

- [Duas provas no mesmo dia] → `garantirProvasNaSemana` cria dois `PROVA`; a UI mostra as duas
  linhas. Caso raro, sem regra especial.
- [Volume da semana estoura o teto de progressão com a prova somada] → o prompt já pede redução
  de 30-50%; a garantia só soma a prova. Alerta existente de volume continua valendo para o
  coach revisar.
- [Redistribuição (`SEMANA_ATUAL`) mexe no dia da prova depois da garantia] → a garantia roda
  depois da redistribuição; teste cobre `SEMANA_ATUAL` com prova.
- [Plano reaberto some para o atleta] → query ajustada (D4) com teste dedicado.
- [Golden do prompt quebra em massa] → só o bloco `[SIM]` muda; diff revisado no PR.
- [Reconciliação vincula atividade errada ao `PROVA` e marca a prova realizada] → o tempo segue
  o vínculo (refazer o vínculo corrige); `foiRealizada` nunca volta sozinho, o coach edita.
- [`removerProvaDeSemanaExistente` apaga treino editado pelo coach no dia] → só remove o treino
  vinculado à prova (`prova_id`), nunca outros treinos do dia.
- [Prova inserida em semana encerrada] → `findByAtletaIdAndSemana` filtra semana não encerrada;
  encerrada não é tocada.

## Migration Plan

1. `V86` (FK `prova_id`) e `V87` (`motivo_reabertura`, `reaberto_em`) aditivas.
2. Backend primeiro; o front tolera `provaId`/`motivoReabertura` ausentes.
3. Rollback: reverter deploy; colunas ficam nulas e inertes.

## Open Questions

- Duração do `PROVA` sem tempo objetivo: `paceLimiar × distância` assumido; se o contexto não
  tiver pace de limiar, usar 6:00 min/km. Não muda specs nem tasks.
- Se o seletor de tipo do registro manual do atleta é fechado (verificar na task 4.4); se for,
  entra `PROVA` nele.

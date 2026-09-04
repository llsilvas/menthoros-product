# prova-no-plano-semanal — A prova aparece no plano da semana como o treino do dia

**Tamanho:** M · **Trilha:** Full
**Status:** proposta (grilling concluído em 2026-09-02)
**Criado:** 2026-09-02
**Depende de:** `atleta-cadastra-prova` (posse por `atletaId`, `distanciaKm` derivado, flag de ciência)
**Design visual:** [canvas "Provas do Atleta"](https://claude.ai/code/artifact/98c34b33-9ad1-4dca-83a2-53a8733eb81a), artboard "Semana da prova"

## Why

Quando a semana tem prova, o prompt já manda reduzir volume, proibir intervalado pesado nas 48-72h
anteriores e diz que a prova "substitui o treino-chave". Mas **nunca manda prescrever a prova no
dia**: o LLM decide sozinho o que fazer com o domingo, e o resultado observado é uma semana de
meia maratona com treinos seg/ter/qui/sáb e o domingo sem a prova — ou com um "longo" no lugar.
O tipo de treino `PROVA` existe no enum desde o início e nenhum caminho de geração o usa.

Sem a prova no plano, o atleta não a vê na agenda, não registra a execução contra ela, o coach
revisa uma semana incompleta e a prova fica `PLANEJADA` para sempre — o alerta de preparação da
change anterior nunca encerra.

## What Changes

- **Treino tipo `PROVA` garantido no dia da prova**, por pós-processamento determinístico na
  persistência do plano: toda prova não cancelada do atleta que cai na semana gerada vira um
  `TreinoPlanejado` `PROVA` naquele dia (nome da prova, distância, ritmo objetivo quando houver),
  substituindo o que o LLM tiver colocado ali. Vínculo persistido `TreinoPlanejado → Prova`.
- **Prompt ganha a instrução explícita** "o dia X é a prova Y; não prescreva outro treino nesse
  dia", para o restante da semana continuar coerente; o pós-processamento é a garantia.
- **Prova cadastrada em semana já gerada**: exceção à regra "prova não altera plano existente".
  O treino `PROVA` é inserido no dia (substituindo o treino planejado), o volume do plano é
  recalculado, e o plano **volta para revisão do coach** com motivo registrado. O atleta continua
  vendo a versão vigente até o coach reaprovar — nunca cai na semana anterior.
- **Registrar a execução do treino `PROVA` fecha o resultado na prova**: em qualquer caminho que
  vincule um realizado ao planejado (registro manual, lançamento do coach, reconciliação de FIT
  e Strava), o sistema marca `foiRealizada = true` e copia o tempo para `tempoRealizado`.
  Posição, TSS, percepção e feedback continuam com o coach.
- **Agenda do atleta com tratamento próprio para o dia da prova**: bandeira no lugar do dot,
  borda destacada, título com o nome da prova e meta "21 km · Prova · meta 1:45:00"; faixa
  "Prova nesta semana" no topo do Plano. Cor e label do tipo `PROVA` entram nos mapas do front.

## Capabilities

### New Capabilities
- `prova-no-plano-semanal`: presença garantida da prova como treino do dia no plano semanal,
  reabertura de revisão quando a prova entra em semana já gerada, e fechamento do resultado da
  prova a partir da execução do treino.

### Modified Capabilities
_Nenhuma._ `athlete-today-workout` já renderiza qualquer tipo de treino; `prova-crud` não muda
de contrato. A visibilidade do plano reaberto pelo atleta é requisito novo, dentro da capability
acima.

## Impact

- **Backend**: `PlanGenerationPersister` (ponto de inserção, ainda em DTO), `PlanoTreinoPromptBuilder`
  / `PeriodizacaoPromptFormatter` (instrução nova, golden `taper-semana-prova.txt` regenerado),
  `TreinoPlanejado` (FK `prova_id`, migration), `PlanoSemanal` (motivo de reabertura, migration),
  `PlanoReviewServiceImpl` (transição nova APROVADO → AGUARDANDO_REVISAO), `PlanoServiceImpl`
  (query do atleta), `ProvaServiceImpl` (dispara a inserção em semana existente),
  `TreinoServiceImpl`, `ReconciliationDecisionExecutor`, `ManualReconciliationServiceImpl`
  (fechamento do resultado), `TreinoMapper`.
- **Frontend**: `theme.premium.ts` (`trainingType.PROVA`), `buildWeekAgenda.ts`,
  `WeekAgendaRow.tsx`, `AthletePlanPage` (faixa "Prova nesta semana"), `CoachPlanReviewPage`
  (motivo da reabertura visível ao coach).
- **Banco**: duas migrations aditivas (`V88`, `V89`) e uma de tipo (`V90`: `tempo_objetivo` e
  `tempo_realizado` de `time` para `interval`, recriando a view `v_historico_provas_completadas`).
- **Contrato de API**: `PlanoSemanalOutputDto` ganha `motivoReabertura`; `TreinoPlanejado` no
  DTO ganha `provaId`. `tempoObjetivo`/`tempoRealizado` continuam `"HH:mm:ss"` no JSON, apesar de
  virarem `Duration` no domínio. Sem breaking.
- **Sem dependência nova.**

## Fora do escopo

- Corrigir a divergência `RACE_WEEK` × `PÓS-PROVA` entre `PeriodizationPlanner` e o formatter.
- Tirar o `PlannerEngine` do modo shadow.
- Regras de conflito entre duas provas na mesma semana (entram as duas; o prompt já ordena).
- Preencher posição, TSS e percepção da prova automaticamente.
- Alinhar `TEMPO_RUN`/`TIRO`/`SUBIDA` no mapa de cores do front (mesmo bug, outra change).
- Macrociclo (`add-macrociclo-structure`).

## Dependências e ordem

- **Depende de `atleta-cadastra-prova`**: usa `distanciaKm` sempre preenchido, a posse por
  `atletaId` e a flag `revisadaPeloCoach` (a reabertura da revisão e a ciência da prova são
  sinais independentes; o coach pode dar ciência da prova e ainda ter o plano para reaprovar).
- Nenhuma outra change bloqueia. **`planner-engine-enforcement`** (Sprint 25, 0/27 tasks, sem
  branch em 2026-09-03) vai transformar o `PeriodizacaoPromptFormatter` em renderer do skeleton;
  esta change só acrescenta linhas ao bloco `[SIM]` de `formatarEventoCompetitivoSemana`. Esta
  entra primeiro; quem implementar a outra rebaseia o bloco.

## Critérios de aceite

1. **Given** atleta com prova não cancelada no domingo da semana a gerar **When** o plano é
   gerado **Then** o plano tem exatamente um `TreinoPlanejado` `PROVA` no domingo, com
   `provaId`, nome da prova em `descricao`, `distanciaKm` da prova e `ritmoAlvo` derivado do
   tempo objetivo quando houver; nenhum outro treino no mesmo dia.
2. **Given** o LLM devolveu um `LONGO` no domingo da prova **Then** o `LONGO` é descartado e o
   `PROVA` fica no lugar; `volumePlanejadoKm` do plano inclui a distância da prova.
3. **Given** duas provas na mesma semana **Then** cada uma tem seu `PROVA` no respectivo dia.
4. **Given** prova cancelada na semana **Then** nenhum `PROVA` é criado para ela.
5. **Given** o prompt para uma semana com prova **Then** contém a instrução com dia e nome da
   prova e a proibição de outro treino no dia; golden `taper-semana-prova.txt` regenerado e
   revisado no diff.
6. **Given** plano `APROVADO` para a semana corrente **When** o atleta cadastra prova para o
   sábado dessa semana **Then** o treino do sábado é substituído por `PROVA`, o plano volta a
   `AGUARDANDO_REVISAO` com `motivoReabertura = PROVA_INSERIDA`, e `GET` do atleta continua
   devolvendo esse plano (não o da semana anterior).
7. **Given** plano reaberto **When** o coach aprova **Then** `APROVADO`, `motivoReabertura`
   limpo, evento de aprovação publicado como hoje.
8. **Given** plano `AGUARDANDO_REVISAO` nunca aprovado **When** a prova é cadastrada na semana
   **Then** o `PROVA` é inserido e o status não muda.
9. **Given** o atleta move a prova para outra semana ou a cancela **Then** o `PROVA` da semana
   antiga é removido (se ainda `PENDENTE`) e o plano volta para revisão com motivo
   `PROVA_REMOVIDA`; se a nova data cai em semana gerada, aplica-se o critério 6 lá.
10. **Given** treino `PROVA` **When** o atleta registra execução manual no dia com tipo `PROVA`
    **Then** o realizado vincula ao planejado, `statusTreino = REALIZADO`, e a prova fica
    `foiRealizada = true` com `tempoRealizado` igual à duração do realizado.
11. **Given** treino `PROVA` **When** um FIT ou atividade Strava é reconciliado a ele **Then**
    o mesmo fechamento do critério 10.
12. **Given** prova já `foiRealizada` **When** o vínculo é desfeito ou refeito **Then**
    `tempoRealizado` segue o realizado vinculado; sem vínculo, a prova não volta a
    `foiRealizada = false` automaticamente (o coach decide).
13. **Front**: a linha do dia da prova mostra bandeira, nome da prova e "21 km · Prova · meta
    1:45:00"; a faixa do Plano mostra "Prova nesta semana · <nome> · <dia> · faltam N dias"; a
    tela de revisão do coach mostra "Reaberto: prova inserida" no plano.

## Métrica de sucesso

- **100% dos planos gerados para semana com prova têm o treino `PROVA` no dia** (query
  semanal; hoje é 0%).
- **Tempo do coach para reaprovar um plano reaberto por prova ≤ 1 dia**, medido de
  `reabertoEm` até a aprovação, nos primeiros 30 dias — medição manual por query, sem task de
  instrumentação nesta change.
- Provas com `foiRealizada = true` passam a ser preenchidas sem intervenção do coach na
  maioria dos casos (meta: ≥ 80% das provas realizadas com tempo vindo da execução).

## Open Questions & Assumptions

**Premissas (fechadas no grilling de 2026-09-02):**
- Garantia determinística no service, não confiança no prompt; o prompt é complemento.
- Toda prova da semana entra, não só a alvo.
- Reabrir revisão é a exceção deliberada à regra "prova não altera plano existente".
- O atleta continua vendo o plano reaberto: descoberta do levantamento (hoje ele veria a semana
  anterior), tratada como requisito e não como pergunta.

**Em aberto (não muda specs nem tasks):**
- `ritmoAlvo` do `PROVA` quando não há tempo objetivo: assumido vazio.
- Duração planejada do `PROVA`: assumida a partir do tempo objetivo ou, sem ele, do pace de
  limiar do atleta × distância.

# Tasks — prova-no-plano-semanal

Pré-requisito: `atleta-cadastra-prova` mergeada em `develop` (usa `distanciaKm` derivado, posse e
`cancelarProva`). Validação por bloco: backend `./mvnw clean test`; frontend
`npm run lint && npm run build && npm test`. Branch `feature/prova-no-plano-semanal` nos dois
repos antes de qualquer código.

## 1. Backend — modelo e vínculo

- [x] 1.1 Migration `V88__add_prova_id_to_tb_treino_planejado.sql` (FK nullable `ON DELETE SET
      NULL`, índice parcial) e campo `prova` em `TreinoPlanejado`; `provaId`, `descricao` e
      `zonaAlvo` em `TreinoPlanejadoLlmDto` (`NON_NULL`, nunca vêm do LLM) e `provaId` no DTO de
      saída; `TreinoMapper` copia os três para a entidade.
      Achado do TDD: `@Mapping(target = "prova.id", source = "provaId")` do MapStruct instancia
      `Prova` mesmo com `provaId` nulo (quebraria todo treino comum) — trocado por
      `provaFromId(UUID)`, default method com guarda de nulo. `provaId` entrou no FIM dos dois
      records (não no meio) para não quebrar ~24 call sites posicionais existentes; a
      `TreinoPlanejadoLlmDto` ganhou um overload de 11 args (delegando com os 3 novos campos
      nulos) pelo mesmo motivo — nenhum dos dois altera o formato de nenhum teste existente.
      *verify:* `TreinoPlanejadoProvaVinculoTest` (Testcontainers): índice parcial existe,
      vínculo sobrevive a reload, `ON DELETE SET NULL` desvincula o treino, mapper nos dois
      sentidos com e sem `provaId`. Suíte completa: `./mvnw test` — 3134/3134 verde.
- [x] 1.2 Migration `V89__add_reabertura_to_tb_plano_semanal.sql` (`motivo_reabertura` varchar
      nullable, `reaberto_em` timestamp nullable); enum `MotivoReaberturaRevisao`; campos na
      entidade e `motivoReabertura` em `PlanoSemanalOutputDto`.
      `motivoReabertura` entrou no FIM do record (2 call sites posicionais em teste, `+1 null`);
      `PlanoSemanalMapper.toOutputDto` mapeia por nome automático — sem `@Mapping` explícito.
      *verify:* `PlanoSemanalReaberturaMigrationTest` (Testcontainers): plano nasce com as duas
      colunas nulas, motivo e carimbo sobrevivem a reload. `PlanoSemanalOutputDtoMotivoReaberturaTest`:
      JSON inclui `motivoReabertura` só quando presente (`NON_NULL`).
- [x] 1.3 Migration `V90__prova_tempos_para_interval.sql`: `DROP VIEW v_historico_provas_completadas`,
      `ALTER TABLE tb_prova ALTER COLUMN tempo_objetivo TYPE interval USING (...)`, idem
      `tempo_realizado`, `CREATE VIEW` igual à V9. `Prova.tempoObjetivo`/`tempoRealizado` viram
      `Duration` (`@JdbcTypeCode(SqlTypes.INTERVAL_SECOND)`); os cinco campos de DTO
      (`ProvaInputDto` ×2, `ProvaAtletaInputDto` ×1, `ProvaOutputDto` ×2) ganham
      `DurationHhMmSsSerializer`/`Deserializer` novos (`dto/jackson/`) — contrato JSON continua
      `"HH:mm:ss"`, front intacto.
      Achado do TDD: `PeriodizacaoPromptFormatter.formatarProvas` usava `LocalTime.toString()`
      (omite `:00` quando os segundos são zero — "01:28", não "01:28:00") e o golden
      `taper-semana-prova.txt` trava esse formato exato. Trocar por
      `DurationHhMmSsFormat.format` (sempre `HH:mm:ss`) quebrava o golden — fora do escopo desta
      task (2.3 regenera o golden pela instrução nova, não por isso). Mantido um formatter
      local no próprio `PeriodizacaoPromptFormatter` que replica o comportamento antigo;
      `DurationHhMmSsFormat` ficou reservado ao contrato JSON. `ThresholdInferenceService` e
      `RaceProjectionServiceImpl` trocaram `LocalTime.toSecondOfDay()` por `Duration.getSeconds()`.
      6 arquivos de teste com `LocalTime.of(...)` literal migrados para `Duration`.
      *verify:* `ProvaTemposIntervalMigrationTest` (Testcontainers): colunas são `interval`, view
      sobrevive, round-trip com e sem tempo; `ProvaOutputDtoTempoDurationTest`: JSON sai
      `"01:45:00"` (não `PT1H45M`), omite quando nulo; `PlanoTreinoPromptBuilderGoldenTest`
      intacto (golden não regenerado). Suíte completa: `./mvnw test` — 3144/3144 verde.

## 2. Backend — garantia na geração

- [x] 2.1 `ProvaNoPlanoService.construirTreinoProva(Prova, Atleta)`: `PROVA`, descrição =
      nome, `distanciaKm`, `ritmoAlvo` e `duracaoMin` do tempo objetivo (`Duration`, após 1.3;
      fallback pace de limiar × distância; sem limiar, 6:00 min/km), `zonaAlvo` = "Zona 3-4",
      sem etapas, `provaId`.
      *verify:* `ProvaNoPlanoServiceTest`: com tempo objetivo 1:45:00 em 21,1 km → ritmo 4:59;
      sem tempo objetivo usa limiar; sem limiar usa 6:00; dia da semana vem da data da prova.
- [x] 2.2 `ProvaNoPlanoService.garantirProvasNaSemana(List<TreinoPlanejadoLlmDto>, Atleta,
      semanaInicio, semanaFim)`: reusou `ProvaRepository.findByAtletaAndDataProvaBetweenOrderByDataProvaAsc`
      (já existia, já exclui `CANCELADA` — sem query nova); remove DTOs do dia de cada prova e
      insere o `PROVA`; integrado em `PlanGenerationPersister.obterTreinosParaPlano` **depois** da
      redistribuição e **antes** de `validarTreinosGerados`. `prepararMetadados` passou a receber
      `(DadosPlanoDto, double volumePlanejadoKm)` — o volume recalculado da lista final de DTOs
      (`calcularVolumeTotalPlanejadoDto`), não `planoDto.volumePlanejadoKm()` — fecha o Major do
      DoR. `PlanGenerationPersister` ganhou o campo `ProvaNoPlanoService`; dois testes existentes
      (`PlanoServiceImplTest`, `PlanoServiceTenantTest`) precisaram de um mock novo com stub
      pass-through.
      *verify:* `PlanGenerationPersisterProvaTest`: `garantirProvasNaSemana` chamado com
      atleta/período corretos após a redistribuição; `volumePlanejadoKm` do plano inclui a
      distância da prova; `PlanoMetaDados.volumePlanejado` usa o recalculado, não o bruto do LLM.
      Suíte completa: `./mvnw test` — 3151/3151 verde.
- [x] 2.3 Prompt: `formatarEventoCompetitivoSemana` ganha a linha "Prescreva no dia … um único
      treino do tipo PROVA … Não prescreva outro treino nesse dia" por prova (todas as provas de
      `eventosSemana`, não só a principal); golden `taper-semana-prova.txt` regenerado com
      `-Dgolden.update=true`.
      *verify:* `PeriodizacaoPromptFormatterEventoCompetitivoTest`: uma prova → uma linha; duas
      provas → duas linhas; sem prova → nenhuma linha. `PlanoTreinoPromptBuilderGoldenTest` verde;
      diff do golden mostrou só a linha nova. Suíte completa: `./mvnw test` — 3154/3154 verde.

## 3. Backend — semana já gerada e reabertura

- [x] 3.1 `PlanoReviewServiceImpl.reabrirRevisao(plano, motivo, tenantId)`: recebe a entidade
      já carregada (mesmo padrão de `aprovarTransicao`, não busca por id); só de `APROVADO`,
      semana não encerrada; grava motivo e `reabertoEm`; publica `PlanoReabertoEvent`; `aprovar`
      e `rejeitar` limpam os dois campos (`limparReabertura`).
      *verify:* `PlanoReviewServiceReaberturaTest`: APROVADO → AGUARDANDO com motivo e evento;
      AGUARDANDO/REJEITADO/semana `CONCLUIDO` → recusa sem salvar; aprovar e rejeitar limpam
      motivo/carimbo de um plano reaberto.
- [x] 3.2 `PlanoSemanalRepository.findVisiveisParaAtletaOrderBySemanaInicioDesc` (nova):
      `APROVADO` **ou** (`AGUARDANDO_REVISAO` com `motivoReabertura` não nulo); `buscarPlanoPorAtleta`
      (`apenasAprovados=true`, ramo do `ATLETA`) troca `findTopByAtletaIdAndAssessoriaIdAndReviewStatusOrderBySemanaInicioDesc`
      por ela + `.stream().findFirst()`.
      *verify:* `PlanoSemanalVisibilidadeAtletaTest` (Testcontainers): plano reaberto da semana
      corrente vem primeiro (à frente do aprovado antigo); plano nunca aprovado não aparece;
      isolamento de tenant. Dois testes existentes de `PlanoServiceImplTest` migrados para o
      método novo.
- [x] 3.3 `ProvaNoPlanoService.aplicarProvaEmSemanaExistente(prova)`: localiza a semana por
      `findSemanaAbertaParaProva(atletaId, tenantId, data)` (método novo: tenant, `status <>
      CONCLUIDO`, `reviewStatus <> REJEITADO`), remove treinos `PENDENTE` do dia (mantém `PROVA` de
      outra prova), cria o `PROVA` na entidade via `TreinoMapper.toEntity(construirTreinoProva(...))`,
      recalcula volume, reabre com `PROVA_INSERIDA` se `APROVADO`.
      *verify:* `ProvaNoPlanoServiceAplicarTest`: semana aprovada → substitui e reabre; semana
      aguardando nunca aprovada → substitui sem mudar status; mantém `PROVA` de outra prova no
      mesmo dia; semana sem plano → no-op. `PlanoSemanalSemanaAbertaParaProvaTest`: query nova —
      encontra semana aberta, exclui `CONCLUIDO` e `REJEITADO`, isolamento de tenant.
- [x] 3.4 `ProvaNoPlanoService.removerProvaDeSemanaExistente(prova, dataAntiga)`: remove só o
      `PROVA` vinculado (por `provaId`) se `PENDENTE`/`PERDIDO`, recalcula volume, reabre com
      `PROVA_REMOVIDA`.
      *verify:* `ProvaNoPlanoServiceRemoverTest`: remove e reabre; remove `PERDIDO` (não só
      `PENDENTE`); treino `REALIZADO` não é removido e plano não muda; outros treinos do dia
      intactos; sem semana aberta → no-op.
- [x] 3.5 Integrado em `ProvaServiceImpl`, mesma transação: `criarProva` → `aplicarProvaEmSemanaExistente`
      (se não nasce `CANCELADA`); `atualizarProva` com `dataProva` mudou → `removerProvaDeSemanaExistente`
      (data antiga) + `aplicarProvaEmSemanaExistente` (data nova); `atualizarProva` com
      `statusProva = CANCELADA` → `removerProvaDeSemanaExistente`; `atualizarProva` sem mudança de
      data → `ProvaNoPlanoService.atualizarTreinoVinculado` (método novo: atualiza
      descrição/zona/ritmo/duração/distância do treino vinculado, sem reabrir); `cancelarProva` →
      `removerProvaDeSemanaExistente`.
      *verify:* `ProvaNoPlanoServiceAtualizarVinculadoTest` (atualiza sem reabrir; não toca
      `REALIZADO`); 4 testes novos em `ProvaServiceImplTest` verificando a chamada certa por
      cenário. `ProvaNoPlanoSemanalIT` (Testcontainers, ponta a ponta): cadastro de prova na
      semana corrente aprovada reabre o plano (`motivoReabertura = PROVA_INSERIDA`) e
      `PlanoServiceImpl.buscarPlanoPorAtleta` devolve essa versão com o `PROVA`.
      `./mvnw verify` completo: 3184 unitários + 171 de integração, 0 falhas.

## 4. Backend — resultado da prova pela execução

- [ ] 4.1 `ProvaResultadoSyncer.aoVincular(planejado, realizado)`: se `PROVA` com prova
      vinculada, `foiRealizada = true` e `tempoRealizado = realizado.duracao` (`Duration`, após
      1.3). Nunca desmarca.
      *verify:* testes: PROVA → marca; tipo diferente → nada; vínculo refeito → tempo segue;
      desvincular → prova intacta; duração 1h45 sai como `"01:45:00"` no DTO.
- [ ] 4.2 Chamar o syncer nos pontos de vínculo: `TreinoServiceImpl.registrarTreinoManual` e
      `TreinoServiceImpl.addTreino` (o `lancarTreino` não vincula planejado e fica fora),
      `ReconciliationDecisionExecutor`, `ManualReconciliationServiceImpl.linkManually` — este
      último trocando `findById` por `findByIdAndTenantId` antes de ganhar a chamada.
      *verify:* teste por ponto de entrada: registro manual tipo `PROVA` no dia da prova vincula
      e fecha o resultado; `addTreino` do coach idem; reconciliação FIT idem; Strava idem;
      `linkManually` com planejado de outro tenant → não encontrado.
- [ ] 4.3 `findFirstForManualMatch` passa a ordenar `prova IS NOT NULL` primeiro (um simulado
      `PROVA` do coach no mesmo dia não rouba o vínculo); `TreinoManualInputDto` já aceita o enum
      inteiro — confirmar no teste do controller.
      *verify:* teste de repositório com `PROVA` vinculado + `PROVA` sem prova no mesmo dia →
      devolve o vinculado; teste do controller aceita `tipo = PROVA`.
- [ ] 4.4 Suíte completa do backend verde; revisão de segurança dos pontos tocados (o gatilho do
      CRUD roda com o principal do atleta e altera plano do próprio atleta apenas).
      *verify:* `./mvnw clean test`; checklist de `security-reviewer` sem item aberto.

## 5. Frontend — atleta

- [ ] 5.1 `theme.premium.ts` `trainingType.PROVA`; `buildWeekAgenda.ts` repassa `provaId`,
      `distanciaKm`, `ritmoAlvo`, `descricao`; tipos de `TreinoPlanejado` ganham `provaId`.
      *verify:* `activeTheme.test.ts` cobre `PROVA`; teste do adapter.
- [ ] 5.2 `WeekAgendaRow`: ramo `PROVA` com bandeira, borda e fundo em lime, título = nome da
      prova, meta "N km · Prova · meta hh:mm:ss" (meta só quando houver).
      *verify:* testes de componente com e sem meta; snapshot dos demais tipos inalterado.
- [ ] 5.3 `RaceTargetBanner`: estado "Prova nesta semana · nome · dia · faltam N dias" com
      prioridade sobre o estado de prova-alvo.
      *verify:* teste do estado novo; os três estados anteriores continuam verdes.
- [ ] 5.4 `types/TreinoManual.ts`: `TipoTreino` e `TIPO_TREINO_LABELS` ganham `PROVA` ('Prova');
      o seletor de `ManualTrainingForm` é fechado e passa a oferecê-lo (confirmado 2026-09-03).
      *verify:* teste do formulário lista o tipo; payload envia `PROVA`.
- [ ] 5.5 Lint, build e suíte do front verdes.
      *verify:* `npm run lint && npm run build && npm test`.

## 6. Frontend — coach

- [ ] 6.1 `CoachPlanReviewPage`: chip "Reaberto: prova inserida" / "prova removida" a partir de
      `motivoReabertura`; `PlanoDetalhePanel` mostra o `PROVA` com o mesmo destaque da agenda.
      *verify:* teste de componente com e sem motivo.
- [ ] 6.2 Lint, build, suíte e E2E do coach verdes.
      *verify:* `npm run lint && npm run build && npm test`; `npm run test:e2e` no CI.

## 7. Integração e encerramento

- [ ] 7.1 Fluxo ponta a ponta em `develop`: gerar semana com prova → `PROVA` no dia; cadastrar
      prova na semana corrente aprovada → plano reaberto, atleta vê o `PROVA`, coach vê o chip e
      reaprova; atleta registra treino `PROVA` → prova realizada com tempo.
      *verify:* roteiro executado e registrado aqui com data.
- [ ] 7.2 PRs backend e frontend (`feature/prova-no-plano-semanal` → `develop`), CI verde,
      `tasks.md` atualizado, arquivar após merge.
      *verify:* `openspec validate prova-no-plano-semanal`; change em `changes/archive/2026-09/`.

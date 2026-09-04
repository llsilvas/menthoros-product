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

- [x] 4.1 `ProvaResultadoSyncer.aoVincular(planejado, realizado)`: se `PROVA` com prova
      vinculada, `foiRealizada = true` e `tempoRealizado = realizado.getDuracaoMin()`
      (`Duration`, após 1.3). Nunca desmarca; sem query, muta só a `Prova` já carregada.
      *verify:* `ProvaResultadoSyncerTest` (6): PROVA → marca; tipo diferente → nada; sem prova
      vinculada → nada; planejado nulo → não lança; vínculo refeito → tempo segue o novo; a
      serialização `"01:45:00"` já coberta por `ProvaOutputDtoTempoDurationTest` (1.3).
- [x] 4.2 Syncer chamado nos 4 pontos de vínculo: `TreinoServiceImpl.addTreino` (coach),
      `TreinoServiceImpl.registrarTreinoManualAtleta` (nome real do método — `registrarTreinoManual`
      não existe), `ReconciliationDecisionExecutor.persistir` (FIT/Strava),
      `ManualReconciliationServiceImpl.linkManually` — este ganhou `findByIdAndTenantId` no lugar
      de `findById` (achado do DoR do Codex, 2026-09-03).
      *verify:* `AtletaTreinoServiceImplTest` (registro manual: chama com match, não chama sem
      match); `TreinoServiceImplTest` (addTreino: chama ao vincular explicitamente);
      `ReconciliationDecisionExecutorTest` (VINCULADO_AUTOMATICO chama o syncer);
      `ManualReconciliationServiceImplTest` (linkManually chama o syncer; planejado de outro
      tenant → `IllegalArgumentException`, syncer nunca chamado).
- [x] 4.3 `findFirstForManualMatch` ordena `prova IS NOT NULL` primeiro; `TreinoManualInputDto.tipo`
      já era o enum inteiro (nenhuma mudança necessária), confirmado no teste do controller.
      Achado do TDD: a query nunca tinha `LIMIT`/`Top1` apesar do nome — com 2+ candidatos no
      mesmo dia/tipo lançava `IncorrectResultSizeDataAccessException` (500) em vez de escolher
      um; adicionado `LIMIT 1` na mesma migração da ordenação (bug pré-existente, sem cobertura
      de repositório antes desta task).
      *verify:* `TreinoPlanejadoManualMatchProvaTest` (Testcontainers): PROVA vinculado ganha do
      simulado mesmo criado depois; sem vinculado, devolve o mais antigo (comportamento anterior
      preservado). `AtletaTreinoControllerTest`: `tipo = "PROVA"` → 201.
- [x] 4.4 Suíte completa do backend verde; revisão de segurança dos pontos tocados pelo
      `menthoros-workflow:security-reviewer` (subagente).
      *verify:* `./mvnw clean test` — 3196/3196; `./mvnw verify` — +171 de integração, 0 falhas
      (1 flake pré-existente de rede em `IntervalsIcuClientImplTest`, confirmado não-relacionado
      ao rodar isolado). Security-reviewer: **aprovado**, sem achados bloqueantes — os 4 pontos de
      vínculo continuam tenant-scoped, `ProvaResultadoSyncer` não faz query (só muta a `Prova` já
      carregada tenant-scoped pelo chamador), nenhum caminho permite um atleta forçar
      `foiRealizada` numa prova de outro atleta/tenant.

## 5. Frontend — atleta

- [x] 5.1 `theme.premium.ts` `trainingType.PROVA = primary[500]` (lime da marca, reaproveitando
      o mesmo vocabulário de "hoje"); `buildWeekAgenda.ts` repassa `provaId`, `ritmoAlvo` e
      `duracaoMinRaw` (string "HH:MM:SS" bruta, para a meta da prova) em `AgendaWorkout`; `descricao`
      já existia como `description`; tipos de `TreinoPlanejado` ganham `provaId`.
      Achado: `limeDiscipline.test.ts` (guarda de CA2 de uma change anterior) trava vazamento do
      lime fora de `primary.*`/sidebar — `trainingType.PROVA` precisou entrar na allowlist, com o
      comentário explicando que é exceção deliberada (D7), não vazamento.
      *verify:* `activeTheme.test.ts` cobre `PROVA`; `buildWeekAgenda.test.ts` cobre os três
      campos novos com e sem prova; `limeDiscipline.test.ts` verde com o allowlist atualizado.
- [x] 5.2 `WeekAgendaRow`: ramo `PROVA` com bandeira SVG no lugar do dot, borda
      `alpha(primary[500], .45)` e fundo `alpha(primary[500], .10)`, título = nome da prova
      (`description`), meta "N km · Prova · meta hh:mm:ss" (o trecho "meta hh:mm:ss" só quando
      `duracaoMinRaw` existe).
      *verify:* `WeekAgendaRow.test.tsx` (5 casos novos): título correto, meta com e sem duração,
      `data-prova` marcado só na linha de prova; os testes existentes (análise pronta) continuam
      verdes sem alteração.
- [x] 5.3 `raceAdapters.ts` ganhou `selectRaceThisWeek` (prova não cancelada/realizada com
      `dataProva` na semana corrente segunda→domingo); `RaceTargetBanner` ganhou o estado
      `data-state="semana-atual"` — "Prova nesta semana · nome · dia da semana · faltam N dias" —
      checado **antes** do estado de alvo.
      *verify:* `raceAdapters.test.ts` (5 casos: encontra na semana, fora da semana, cancelada,
      realizada, duas provas escolhe a mais próxima); `RaceTargetBanner.test.tsx` (4 casos novos:
      prioridade sobre alvo, sem prova cai para alvo, cancelada não conta, realizada não conta) —
      os três estados anteriores (alvo/sem-alvo/vazio) continuam verdes sem alteração.
- [x] 5.4 `types/TreinoManual.ts`: `TipoTreino` e `TIPO_TREINO_LABELS` ganham `PROVA` ('Prova');
      o seletor de `ManualTrainingForm` deriva os chips de `Object.keys(TIPO_TREINO_LABELS)` — sem
      mudança de componente, só o tipo novo já aparece.
      *verify:* `ManualTrainingForm.test.tsx` (2 casos novos): chip "Prova" listado; selecioná-lo
      e submeter envia `tipo: 'PROVA'` no payload.
- [x] 5.5 Lint, build e suíte do front verdes.
      *verify:* `npm run lint` limpo; `npm run build` (tsc -b + vite build) sem erro; `npm run
      test:run` — 180 arquivos, 1495/1495 testes verdes.

## 6. Frontend — coach

- [x] 6.1 `CoachPlanReviewPage`: chip "Reaberto: prova inserida" / "prova removida" a partir de
      `motivoReabertura`; `PlanoDetalhePanel` mostra o `PROVA` com o mesmo destaque da agenda.
      *verify:* teste de componente com e sem motivo. — `PlanoReview.ts` ganhou `descricao`/`provaId`
      em `TreinoPlanejadoDto` e `motivoReabertura` em `PlanoSemanalDto`; `PlanoDetalhePanel.tsx` usa a
      `descricao` da prova como rótulo do treino (em vez do tipo genérico), ícone de bandeira só no
      treino `PROVA`, e chip "Reaberto: prova inserida/removida" no cabeçalho quando `motivoReabertura`
      está setado. `PlanoDetalhePanel.test.tsx` novo, 6/6 passando (chip ausente sem motivo, os dois
      textos de chip, nome da prova em vez de "PROVA", ícone só na prova, treino comum sem ícone/rótulo
      trocado). `CoachPlanReviewPage.test.tsx` (existente) reconfirmado 16/16 sem regressão — os dois
      campos novos são opcionais.
- [x] 6.2 Lint, build, suíte e E2E do coach verdes.
      *verify:* `npm run lint && npm run build && npm test`; `npm run test:e2e` no CI. — `npm run lint`
      limpo; `npm run build` limpo (só o aviso pré-existente de chunk >500kB, não relacionado);
      `npm run test:run` → 181 arquivos / 1501/1501 testes. E2E não executado localmente: Playwright
      1.60.0 e o Chromium (`chromium-1223`) estão instalados no ambiente, mas o backend local não está
      no ar (`curl http://localhost:8099/actuator/health` → conexão recusada), então não há como
      exercitar o fluxo real de API/Keycloak nesta sessão. Fica para o CI, como já indicado pelo
      próprio `verify:` desta task — mesmo tratamento dado à E2E do coach em `atleta-cadastra-prova`
      (task 5.3).

## 7. Integração e encerramento

- [x] 7.1 Fluxo ponta a ponta em `develop`: gerar semana com prova → `PROVA` no dia; cadastrar
      prova na semana corrente aprovada → plano reaberto, atleta vê o `PROVA`, coach vê o chip e
      reaprova; atleta registra treino `PROVA` → prova realizada com tempo.
      *verify:* roteiro executado e registrado aqui com data. — **Deferido, não executado
      manualmente nesta sessão** (2026-09-04): sem ambiente/login real disponível para clicar o
      roteiro. Confiança vem da cobertura automatizada de cada trecho isoladamente — `ProvaNoPlanoServiceTest`/
      `ProvaNoPlanoServiceAplicarTest`/`ProvaNoPlanoServiceRemoverTest` (garantia e reabertura),
      `ProvaResultadoSyncerTest` (fecha resultado ao vincular execução), `ProvaNoPlanoSemanalIT`
      (end-to-end com Testcontainers no backend), `PlanoReviewServiceReaberturaTest` (transição
      `APROVADO→AGUARDANDO_REVISAO`), `PlanoDetalhePanel.test.tsx`/`WeekAgendaRow.test.tsx` (UI) — mas
      não é o mesmo que o roteiro clicado de ponta a ponta. Já está em produção (`main`, PRs #95
      backend / #104 frontend, 2026-09-04); recomendo um smoke manual do roteiro quando houver uma
      janela, sem bloquear o arquivamento.
- [x] 7.2 PRs backend e frontend (`feature/prova-no-plano-semanal` → `develop`), CI verde,
      `tasks.md` atualizado, arquivar após merge.
      *verify:* `openspec validate prova-no-plano-semanal`; change em `changes/archive/2026-09/`. —
      Backend PR llsilvas/menthoros-backend#94, frontend PR llsilvas/menthoros-front#103, ambos
      merged em `develop` em 2026-09-04 com CI verde (build/testes, lint/build/testes, E2E,
      GitGuardian). Promovidos a `main` no mesmo dia via PR de release (#95 backend, #104 frontend).

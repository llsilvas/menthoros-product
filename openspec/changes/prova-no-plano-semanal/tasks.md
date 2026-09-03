# Tasks — prova-no-plano-semanal

Pré-requisito: `atleta-cadastra-prova` mergeada em `develop` (usa `distanciaKm` derivado, posse e
`cancelarProva`). Validação por bloco: backend `./mvnw clean test`; frontend
`npm run lint && npm run build && npm test`. Branch `feature/prova-no-plano-semanal` nos dois
repos antes de qualquer código.

## 1. Backend — modelo e vínculo

- [ ] 1.1 Migration `V88__add_prova_id_to_tb_treino_planejado.sql` (conferir o último número livre) (FK nullable `ON DELETE SET
      NULL`, índice parcial) e campo `prova` em `TreinoPlanejado`; `provaId`, `descricao` e
      `zonaAlvo` em `TreinoPlanejadoLlmDto` (`NON_NULL`, nunca vêm do LLM) e `provaId` no DTO de
      saída; `TreinoMapper` copia os três para a entidade.
      *verify:* teste de migration (Testcontainers, CI); mapper com e sem `provaId`; DTO LLM com
      os campos nulos serializa igual a hoje (golden do prompt intacto).
- [ ] 1.2 Migration `V89__add_reabertura_to_tb_plano_semanal.sql` (`motivo_reabertura` varchar
      nullable, `reaberto_em` timestamp nullable); enum `MotivoReaberturaRevisao`; campos na
      entidade e `motivoReabertura` em `PlanoSemanalOutputDto`.
      *verify:* teste de migration; serialização do DTO com e sem motivo.

## 2. Backend — garantia na geração

- [ ] 2.1 `ProvaNoPlanoService.construirTreinoProva(Prova, contexto)`: `PROVA`, descrição =
      nome, `distanciaKm`, `ritmoAlvo` e `duracaoMin` do tempo objetivo (fallback pace de limiar
      × distância; sem limiar, 6:00 min/km), `zonaAlvo` do enum, sem etapas.
      *verify:* testes: com tempo objetivo 1:45:00 em 21,1 km → ritmo 4:59; sem tempo objetivo
      usa limiar; sem limiar usa 6:00.
- [ ] 2.2 `ProvaNoPlanoService.garantirProvasNaSemana(List<TreinoPlanejadoLlmDto>, ctx)`:
      busca as provas não canceladas da semana no `ProvaRepository` (query nova, tenant-scoped,
      por intervalo de datas — o contexto só tem `proximaProva`), remove DTOs do dia de cada uma e
      insere o `PROVA`; integrar em `PlanGenerationPersister.obterTreinosParaPlano` **depois** da
      redistribuição e **antes** de `validarTreinosGerados`; `prepararMetadados` e
      `atualizarProgressao` passam a usar o volume recalculado da lista final, não o do DTO.
      *verify:* testes: LLM devolve LONGO no domingo → sai LONGO, entra PROVA; LLM já devolveu
      PROVA → um só; duas provas → dois dias; prova cancelada → nada; modo `SEMANA_ATUAL` com
      redistribuição mantém o PROVA no dia; `volumePlanejadoKm` e `PlanoMetaDados.volumePlanejado`
      incluem a distância; prova de outro tenant na mesma data não entra.
- [ ] 2.3 Prompt: `formatarEventoCompetitivoSemana` ganha a linha "Prescreva no dia … um único
      treino do tipo PROVA … Não prescreva outro treino nesse dia" por prova; regenerar golden
      `taper-semana-prova.txt` com `-Dgolden.update=true`.
      *verify:* `PlanoTreinoPromptBuilderGoldenTest` verde; diff do golden mostra só as linhas
      novas; teste unitário do formatter com duas provas gera duas linhas.

## 3. Backend — semana já gerada e reabertura

- [ ] 3.1 `PlanoReviewServiceImpl.reabrirRevisao(planoId, motivo)`: só de `APROVADO`, semana
      não encerrada; grava motivo e `reabertoEm`; publica `PlanoReabertoEvent`; `aprovar` e
      `rejeitar` limpam os dois campos.
      *verify:* testes: APROVADO → AGUARDANDO com motivo; de AGUARDANDO nunca aprovado → recusa;
      semana encerrada → recusa; aprovar limpa motivo e publica `PlanoAprovadoEvent`.
- [ ] 3.2 Query do atleta em `PlanoServiceImpl`: último plano `APROVADO` **ou** (`AGUARDANDO_REVISAO`
      com `motivoReabertura` não nulo).
      *verify:* teste: plano da semana corrente reaberto é devolvido; plano da semana corrente
      nunca aprovado continua invisível e cai no aprovado anterior.
- [ ] 3.3 `ProvaNoPlanoService.aplicarProvaEmSemanaExistente(prova)`: localiza a semana por
      `findSemanaAbertaParaProva(atletaId, tenantId, data)` (método novo: tenant, `status <>
      CONCLUIDO`, `reviewStatus <> REJEITADO`), remove treinos `PENDENTE` do dia (mantém `PROVA` de outra
      prova), cria o `PROVA` na entidade, recalcula volume, reabre com `PROVA_INSERIDA` se
      `APROVADO`.
      *verify:* testes: semana aprovada → substitui e reabre; semana aguardando nunca aprovada →
      substitui sem mudar status; semana sem plano → no-op; semana encerrada → no-op; plano
      rejeitado → no-op; teste de repositório da query nova com outro tenant.
- [ ] 3.4 `ProvaNoPlanoService.removerProvaDeSemanaExistente(prova, dataAntiga)`: remove só o
      `PROVA` vinculado se `PENDENTE`/`PERDIDO`, recalcula volume, reabre com `PROVA_REMOVIDA`.
      *verify:* testes: remove e reabre; treino `REALIZADO` não é removido e plano não muda;
      outros treinos do dia intactos.
- [ ] 3.5 Integrar em `ProvaServiceImpl`: criar → aplicar; atualizar com data nova → remover da
      antiga + aplicar na nova; atualizar só nome/tempo → atualiza descrição/ritmo/duração do
      treino vinculado sem reabrir; cancelar → remover. Mesma transação.
      *verify:* testes de service por caso; teste de integração: cadastro de prova na semana
      corrente aprovada deixa o plano reaberto e o `GET` do atleta devolve o `PROVA`.

## 4. Backend — resultado da prova pela execução

- [ ] 4.1 `ProvaResultadoSyncer.aoVincular(planejado, realizado)`: se `PROVA` com prova
      vinculada, `foiRealizada = true` e `tempoRealizado = LocalTime.MIDNIGHT.plus(duração)`, teto
      `23:59:59`. Nunca desmarca.
      *verify:* testes: PROVA → marca; tipo diferente → nada; vínculo refeito → tempo segue;
      desvincular → prova intacta; duração 1h45 → `01:45:00`; duração ≥ 24 h → `23:59:59`.
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

> Repo principal: `apps/menthoros-backend`, branch `feat/add-pain-attention-signal`; cada bloco
> termina com `./mvnw clean test`. Blocos marcados **front** rodam no `apps/menthoros-front`
> (mesma branch) e terminam com `npm run lint && npm run build && npm run test:run`; **E2E**
> termina também com `npm run test:e2e`.
>
> **Fatia 1 = Fases 1–3.** **Fatia 2 = Fases 4–6**, só começa após a validação da task 3.7.
>
> Tasks marcadas **[P1]**, **[P2]** ou **[P3]** seguem a recomendação da Decisão pendente de mesmo
> nome no `proposal.md`; se a decisão for outra, reescrever a task antes de começar.
> Identificadores novos em inglês (ADR-0007 do backend).

## Fase 0 — Antes do `/implement`
- [ ] 0.1 Fechar P1, P2 e P3 no `proposal.md`
- [ ] 0.2 Combinar com `redesign-coach-athlete-profile` o chip de `CRITICA` ("Atenção alta") e o
      comportamento de "Ajustar" em sugestão com `proposedAction` (rejeitar + `TreinoEditDialog`)
- [ ] 0.3 Conferir a ordem de merge com `add-attention-reason-sem-sincronizacao`,
      `add-aviso-mensalidade` e `add-retention-radar-lite` (mesmos pontos: `MotivoAtencao`,
      `MOTIVOS_IGNORADOS`/`MOTIVO_TIPO`, `REASON_LABEL`/`MOTIVO_TEXTO`) e o número da migration
      (`V116`–`V119` reservadas por `add-season-plan-macrocycle`)

## Fase 1 — Enums, config, migrations (PR 1)

### 1. Base
- [ ] 1.1 `MotivoAtencao.DOR_RECORRENTE(55, "Dor relatada em treinos seguidos: trocar o próximo intensivo por leve e confirmar com o atleta.")`
- [ ] 1.2 `TipoSugestao.PAIN_ADJUST`; `StatusSugestao.EXPIRED`, `SUPERSEDED` (transições só a
      partir de `PENDING`). `SugestaoCoachServiceImpl.aprovar`/`rejeitar`: casos `EXPIRED` e
      `SUPERSEDED` no `switch` → `422` como `REJECTED` (hoje cairiam em `IllegalStateException`/500)
- [ ] 1.3 Migration `V120__sugestao_coach_pain_adjust_status_terminais.sql` (ou o próximo número
      livre no momento do PR): recria `chk_sugestao_tipo` (+`PAIN_ADJUST`) e
      `chk_sugestao_status` (+`EXPIRED`, `SUPERSEDED`); atualiza o `COMMENT ON COLUMN
      tb_sugestao_coach.rejection_reason` (V100 diz "só em REJECTED") para incluir o código
      sistêmico de `EXPIRED`/`SUPERSEDED`; sem tocar dados
- [ ] 1.4 `@ConfigurationProperties("app.coach.atencao.dor")`: `modo` (`DESLIGADO|SOMBRA|ATIVO`),
      `janelaDias=7`, `minimoDias=2`, validados; `@ConfigurationProperties("app.coach.sugestao.acao")`:
      `enabled` (default `false`); `application-cloud.yml` (profile de produção):
      `modo=SOMBRA`, `acao.enabled=false`
- [ ] 1.5 Testes: Flyway sobe em `clean test`; binding e validação das propriedades; transições
      de `StatusSugestao`; `aprovar`/`rejeitar` em `EXPIRED`/`SUPERSEDED` → `422`

## Fase 2 — Evaluator e fila (PR 1)

### 2. Evaluator puro
- [ ] 2.1 `record PainOccurrence(realizadoId, date, tipo, rpe, comment, treinoPlanejadoId)`
- [ ] 2.2 `CoachAttentionSignalEvaluator.evaluateRecurringPain(occurrences, daysToTargetRace)`:
      conta dias distintos; abaixo de `minimoDias` → empty; `ALTA`; `CRITICA` só com dias
      consecutivos no plano; RPE e prova entram nas evidências (≤ 3)
- [ ] 2.3 Testes: 1 dia → empty; 2 sessões no mesmo dia → empty; 2 dias não consecutivos →
      `ALTA`; consecutivos → `CRITICA`; RPE 4→6 e prova em 11 dias aparecem como evidência sem
      mudar severidade; comentário nulo; comentário de 1000 caracteres; ordem das evidências

### 3. Fila, episódio, modo sombra
- [ ] 3.1 `TreinoRealizadoRepository.findPainInWindow(tenantId, atletaId, inicio, fim)` com
      `@EntityGraph(attributePaths = "sensacoes")`; `@DataJpaTest` prova ausência de N+1 e
      isolamento de tenant
- [ ] 3.2 Query nova da prova-alvo em `ProvaRepository` (próxima prova-alvo futura do atleta, por
      tenant) — `montarItem` hoje só carrega provas pendentes de revisão
      (`findPendentesRevisaoByAssessoria`/`ByAtleta`), que não servem para "prova em N dias"
- [ ] 3.3 `CoachAttentionQueueServiceImpl.montarItem`: chamar o evaluator quando `modo != DESLIGADO`;
      em `SOMBRA`, logar e não adicionar o sinal. Vale para `getAttentionQueue` e
      `getSinaisParaAtleta`, ambos `readOnly` — nada é escrito aqui
- [ ] 3.4 **[P2]** Episódio `(atletaId, primeiroDiaComDor)` contado por consulta de relatório
      sobre `tb_treino_realizado` + sensações (sem escrita na fila): SQL versionado na change,
      com episódios/semana, t0 (dia do segundo `DOR` distinto) e ação do coach (decisão em
      `tb_sugestao_coach`, edição em `PlannedWorkoutPostApprovalEdit`); log estruturado com
      atleta, severidade e modo na avaliação. Teste da consulta com dados fixos
- [ ] 3.5 Testes de serviço: com a mesma severidade, dor vence fadiga (55 > 50) e fadiga vira
      evidência; dor `ALTA` com `FADIGA` `CRITICA` → principal é `FADIGA` e dor aparece como
      evidência (regra atual: severidade antes do peso); outro tenant não aparece; `SOMBRA` não
      lista; `DESLIGADO` não avalia
- [ ] 3.6 Teste ArchUnit (D6): nenhuma classe `*PromptDataBuilder`/`*PromptBuilder` acessa
      `TreinoRealizado#getFeedbackAtleta`, `SinalAtencao#evidencias` nem
      `CoachAttentionItemOutputDto#evidence`. Não usar grep de texto (o javadoc de
      `WorkoutAnalysisPromptDataBuilder` cita `feedbackAtleta`)
- [ ] 3.7 **Validação do piloto (gate da fatia 2):** ligar `SOMBRA` em testes e produção; após 2–4
      semanas, registrar no `proposal.md` episódios/semana e a taxa de falso positivo (episódios
      sem edição do plano nem ciência em 7 dias ÷ episódios), medidos pela consulta da 3.4;
      passar a `ATIVO` se ≤ 30%

### 3f. Front — rótulos (PR front, junto da fatia 1)
- [ ] 3f.1 **front** `DOR_RECORRENTE` na união de motivos (`types/Coach.ts`), "Dor recorrente" em
      `REASON_LABEL` e texto neutro em `MOTIVO_TEXTO`
      (`features/coach/components/coachInboxHelpers.ts:135-153`; o `MOTIVO_TEXTO` vai para o
      rascunho de mensagem ao atleta, então segue B6: sem região do corpo nem termo clínico);
      `PAIN_ADJUST` em `SugestaoTipo` e `EXPIRED`/`SUPERSEDED` em `SugestaoStatus`
      (`types/SugestaoCoach.ts:4,7`); "Ajuste por dor" em `TIPO_LABELS`
      (`RecentSuggestionsPanel.tsx:28`, `DashboardSuggestionsPanel.tsx:13`); status terminais
      com rótulo e sem ações; se `redesign-coach-athlete-profile` ainda não mergeou, aplicar em
      `RecentSignalsPanel`, `RecentSuggestionsPanel` e no Inbox; fallback para enum desconhecido
      onde o tipo não for `Record` exaustivo
- [ ] 3f.2 **front** Testes de componente para 3f.1

## Fase 4 — Estados terminais e rotina (PR 2)

### 4. Encerramento idempotente
- [ ] 4.1 `ProposedAction`/`TargetSnapshot`/`ReplacementPrescription` records + `parse(reasoningJson)`
      tolerante a campos desconhecidos e a JSON antigo sem `proposedAction`. O formato mantém
      `rationale`, `sourceRules` e `confidence` na raiz; `SugestaoCoachMapper` continua lendo
      `RecommendationExplanation` e ignora `episode`/`proposedAction` (teste de regressão do mapper)
- [ ] 4.2 `PainAdjustSuggestionRoutine.closeStale(atletaId)`: `PENDING` com `proposedAction`
      → `EXPIRED` (`expiresAt` vencido) ou `SUPERSEDED` (alvo não `PENDENTE`, removido ou versão
      ≠ snapshot), `reviewedAt = now`, `rejectionReason` sistêmico; `SELECT … FOR UPDATE`
- [ ] 4.3 Testes: alvo realizado; alvo removido; alvo editado; expiração; duas execuções
      concorrentes → uma transição

## Fase 5 — Sugestão com patch completo, rotina por atleta e gatilho por evento (PR 3)

### 5. Builder e rotina
- [ ] 5.1 `PainAdjustSuggestionBuilder.build(sinal, planoAprovado, hoje)`: treino-alvo (B2: só
      plano aprovado; pula realizado e `TODAY_ON_WATCH`; `AGUARDANDO_REVISAO` → sem ação),
      `targetSnapshot` com `versao`, `prescription` completa (1 etapa `CONTINUO` Z1 30 min,
      `zonaAlvo`, `percepcaoEsforcoEsperada` leve, `clearDistanciaKm = true`, `descricao` neutra),
      `summary` derivado da prescrição (template de observação, dias em `EEE dd/MM` pt-BR),
      `reasoningJson` = `RecommendationExplanation` + `episode` + `proposedAction`; sem candidato
      ou alvo bloqueado → sem `proposedAction` e `summary` de ajuste manual
- [ ] 5.2 **[P1]** `PainAdjustSuggestionRoutine.run(atletaId, hoje)`: `closeStale` → 
      `findPainInWindow` + `evaluateRecurringPain` + prova-alvo → builder; só em `modo = ATIVO`;
      `confidence` pela severidade. Não lê `getAttentionQueue` nem `primaryReason`
- [ ] 5.3 **[P1]** `SugestaoCoachGeneratorJob`: depois do laço atual, iterar
      `TreinoRealizadoRepository.findAthletesWithPainInWindow(tenantId, inicio, fim)` e chamar a
      rotina por atleta (não usar o corte `MAX_ITENS = 20` de `getAttentionQueue`); `MOTIVO_TIPO`
      e `MOTIVOS_IGNORADOS` não mudam por causa da dor
- [ ] 5.4 `PainFeedbackRecordedEvent` publicado em `AtletaTreinoFeedbackServiceImpl` (único
      escritor de `sensacoes`, `:53`) quando o feedback salvo contém `DOR`; listener
      `@TransactionalEventListener(AFTER_COMMIT)` roda a rotina para o atleta (idempotente:
      `uk_sugestao_pending` + encerramento)
- [ ] 5.5 Testes: alvo = próximo intensivo pendente; alvo bloqueado → sem ação e texto de ajuste
      manual; plano `AGUARDANDO_REVISAO` → sem ação; `uk_sugestao_pending` não conflita com
      `RECOVERY`; dor `ALTA` com `FADIGA` `CRITICA` ainda gera `PAIN_ADJUST`; atleta fora do top 20
      da fila ainda gera; template com/sem segundo intensivo; nenhum texto gerado contém região do
      corpo/termo clínico (lista negra no teste); evento às 20h gera a sugestão no mesmo dia; cron
      não duplica
- [ ] 5.6 Atualizar OpenAPI (`SugestaoCoachOutputDto.tipo`/`status`, `proposedAction` resumida com
      diff legível para o front: alvo, de → para)

## Fase 6 — Aprovar aplica o patch (PR 4)

### 6. `aprovar`, `editar`, "Ajustar"
- [ ] 6.1 `CodedConflictException(code, message)` + handler no `GlobalExceptionHandler` que
      responde `409` com `code` no corpo (`DomainConflictException` não tem `code`); teste do handler
- [ ] 6.2 `TreinoPlanejadoPatchDto` ganha limpeza explícita de `distanciaKm` (`clearDistanciaKm`,
      mesma ideia de `zonaAlvo` vazio = limpar) e `aplicarPatch` a respeita; o `PATCH` manual de
      treino continua igual quando o campo não vem
- [ ] 6.3 `aprovar`: `expiresAt` vencido → `409 SUGESTAO_EXPIRADA` (hoje só `listar` filtra); sem
      `proposedAction` → fluxo atual; `acao.enabled=false` → `409 ACAO_DESABILITADA`; alvo ausente →
      `409 ALVO_INEXISTENTE`; versão ≠ snapshot → `409 ALVO_ALTERADO`;
      `ApprovedWorkoutEditPolicy.avaliar(treino, hoje, hasWatch)` (com `hasWatch` de
      `ApprovedWorkoutEditContext.resolve(...)`) → `409` com o código da recusa; então
      `TreinoPlanejadoServiceImpl.editarTreino(planoId, treinoId, patchCompleto)` com
      `editReason = PAIN_INJURY` na mesma transação; `APPROVED` + audit (treino, versão
      antes/depois, reason)
- [ ] 6.4 `editar(summary)` (`PUT /api/v1/coach/sugestoes/{id}`) com `proposedAction` →
      `409 SUGESTAO_COM_ACAO_NAO_EDITAVEL`
- [ ] 6.5 Métrica `coach_sugestao_pain_adjust_aplicada_total`; audit de
      `coach-suggestion-decision-audit` registra aceita/ajuste manual/rejeitada + `rejectionReason`
- [ ] 6.6 Testes de integração: aprovação substitui o treino (tipo, duração, etapas, `zonaAlvo`,
      `distanciaKm` limpa, TSS recalculado com a percepção nova, `editedAfterApprovalAt`,
      `PlannedWorkoutPostApprovalEdit.reason = PAIN_INJURY`) e publica
      `WorkoutEditedAfterApprovalEvent` (reenvio depois do commit); **payload exportado ao relógio
      a partir de intervalado com repetições não tem etapa acima de Z2**; alvo realizado →
      `409 NOT_PENDING`; alvo alterado → `409`; falha no `editarTreino` → rollback; segunda
      aprovação no-op; expirada → `409`; `RECOVERY` antiga aprova só status; flag de ação
      desligada → `409`
- [ ] 6.7 **front** card de decisão/painel (o de `redesign-coach-athlete-profile` se já mergeado,
      senão `RecentSuggestionsPanel`): "Aceitar" mostra o diff (`Qui 12/11: Intervalado 60 min →
      Regenerativo 30 min`) e confirma; "Ajustar" = `rejeitar(AJUSTE_MANUAL)` + abre
      `TreinoEditDialog` no alvo; `409` mantém o card com a mensagem; chip "Atenção alta" em
      `CRITICA`; **[P3]** chips "RPE 4 → 6"/"Prova em N dias" das evidências
- [ ] 6.8 **[P3]** Backend: `SinalRecenteDto` ganha `evidence` (repassado do item da fila) e
      `sugestaoId` preenchido pela `PENDING` do mesmo atleta e do tipo mapeado
      (`DOR_RECORRENTE → PAIN_ADJUST`); hoje vem `null` em `CoachAthleteProfileServiceImpl`. Se
      `redesign-coach-athlete-profile` já tiver adicionado o campo, só reusar
- [ ] 6.9 **front** Testes de componente para 6.7
- [ ] 6.10 **E2E** `tests/e2e/coach/sugestao-dor.spec.ts`: sugestão `PAIN_ADJUST` pendente → Aceitar
      → diff → confirma → `POST .../aprovar` → linha de Qui vira "Regenerativo · 30 min" com selo
      de edição pós-aprovação; `409 ALVO_ALTERADO` mantém o card com erro; Ajustar rejeita e abre
      o diálogo — fluxo que escreve no plano do atleta, E2E obrigatório

## Fase 7 — Entrega
- [ ] 7.1 Fatia 1: `./mvnw clean test` + front verdes; `modo=SOMBRA` em testes e produção
- [ ] 7.2 Revisão do template, da `descricao` e do `MOTIVO_TEXTO` por alguém com formação em
      educação física/fisiologia antes da fatia 2; registrar quem revisou no `proposal.md`
- [ ] 7.3 Fatia 2: `./mvnw clean test && npm run lint && npm run build && npm run test:run && npm run test:e2e`
      verdes; `acao.enabled=true` só em testes (Railway `develop`) até validar com um atleta real
- [ ] 7.4 Atualizar `specs/coach-pain-attention/spec.md` e o delta de
      `coach-suggestion-decision-audit` com o que divergiu; follow-ups: lista fechada de motivos de
      rejeição; editar a prescrição pela UI; integração com `rag-injury-aware-prescription`;
      limiares por assessoria

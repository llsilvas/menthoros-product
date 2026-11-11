> Repo principal: `apps/menthoros-backend`, branch `feat/add-pain-attention-signal`; cada bloco
> termina com `./mvnw clean test`. Blocos marcados **front** rodam no `apps/menthoros-front`
> (mesma branch) e terminam com `npm run lint && npm run build && npm run test:run`; **E2E**
> termina também com `npm run test:e2e`.
>
> **Fatia 1 = Fases 1–3.** **Fatia 2 = Fases 4–6**, só começa após a validação da task 3.6.

## Fase 1 — Enums, config, migrations (PR 1)

### 1. Base
- [ ] 1.1 `MotivoAtencao.DOR_RECORRENTE(55, "Dor relatada em treinos seguidos: trocar o próximo intensivo por leve e confirmar com o atleta.")`
- [ ] 1.2 `TipoSugestao.PAIN_ADJUST`; `StatusSugestao.EXPIRED`, `SUPERSEDED` (transições só a
      partir de `PENDING`; `aprovar`/`rejeitar` em terminal → `409`)
- [ ] 1.3 Migration `V<next>__sugestao_coach_pain_adjust_status_terminais.sql`: recria
      `chk_sugestao_tipo` (+`PAIN_ADJUST`) e `chk_sugestao_status` (+`EXPIRED`, `SUPERSEDED`); sem
      tocar dados
- [ ] 1.4 `@ConfigurationProperties("app.coach.atencao.dor")`: `modo` (`DESLIGADO|SOMBRA|ATIVO`),
      `janelaDias=7`, `minimoDias=2`, validados; `@ConfigurationProperties("app.coach.sugestao.acao")`:
      `enabled` (default `false`); `application-prod`: `modo=SOMBRA`, `acao.enabled=false`
- [ ] 1.5 Testes: Flyway sobe em `clean test`; binding e validação das propriedades; transições
      de `StatusSugestao`

## Fase 2 — Evaluator e fila (PR 1)

### 2. Evaluator puro
- [ ] 2.1 `record RealizadoDorSinal(realizadoId, data, tipo, rpe, comentario, treinoPlanejadoId)`
- [ ] 2.2 `CoachAttentionSignalEvaluator.avaliarDorRecorrente(ocorrencias, diasAteProvaAlvo)`:
      conta dias distintos; abaixo de `minimoDias` → empty; `ALTA`; `CRITICA` só com dias
      consecutivos no plano; RPE e prova entram nas evidências (≤ 3)
- [ ] 2.3 Testes: 1 dia → empty; 2 sessões no mesmo dia → empty; 2 dias não consecutivos →
      `ALTA`; consecutivos → `CRITICA`; RPE 4→6 e prova em 11 dias aparecem como evidência sem
      mudar severidade; comentário nulo; ordem das evidências

### 3. Fila, episódio, modo sombra
- [ ] 3.1 `TreinoRealizadoRepository.findComDorNaJanela(tenantId, atletaId, inicio, fim)` com
      `@EntityGraph("sensacoes")`; `@DataJpaTest` prova ausência de N+1 e isolamento de tenant
- [ ] 3.2 `CoachAttentionQueueServiceImpl.montarItem`: chamar o evaluator quando `modo != DESLIGADO`;
      dias até prova-alvo a partir da prova já carregada; em `SOMBRA`, não adicionar o sinal
- [ ] 3.3 Episódio `(atletaId, primeiroDiaComDor)`: persistir a chave no item de audit da fila;
      `coach_atencao_dor_episodio_total` incrementa uma vez por episódio novo, em `SOMBRA` e
      `ATIVO`; log estruturado com atleta, severidade, modo
- [ ] 3.4 Testes de serviço: dor vence fadiga no desempate (55 > 50) com fadiga como evidência;
      outro tenant não aparece; `SOMBRA` conta e não lista; `DESLIGADO` não avalia; mesmo
      episódio em duas execuções conta uma vez
- [ ] 3.5 Teste de arquitetura (D6): nenhum `*PromptDataBuilder`/`*PromptBuilder` referencia
      `feedbackAtleta` nem `SinalAtencao.evidencias`
- [ ] 3.6 **Validação do piloto (gate da fatia 2):** ligar `SOMBRA` em testes e produção; após 2–4
      semanas, registrar no `proposal.md` episódios/semana e a taxa de falso positivo (episódios
      sem edição do plano nem ciência em 7 dias ÷ episódios); passar a `ATIVO` se ≤ 30%

### 3f. Front — rótulos (PR front, junto da fatia 1)
- [ ] 3f.1 **front** `labelMotivoAtencao(DOR_RECORRENTE) = "Dor recorrente"`, `SuggestionTypeBadge`
      `PAIN_ADJUST = "Ajuste por dor"`, status `EXPIRED`/`SUPERSEDED` com rótulo e sem ações; se
      `redesign-coach-athlete-profile` ainda não mergeou, aplicar em `RecentSignalsPanel`,
      `RecentSuggestionsPanel` e no Inbox; fallback para enum desconhecido em todo `switch`
- [ ] 3f.2 **front** Testes de componente para 3f.1

## Fase 4 — Estados terminais e rotina (PR 2)

### 4. Encerramento idempotente
- [ ] 4.1 `AcaoProposta`/`AlvoSnapshot`/`PrescricaoSubstituta` records + `parse(reasoningJson)`
      tolerante a campos desconhecidos e a JSON antigo sem `acaoProposta`
- [ ] 4.2 `PainAdjustSuggestionRoutine.encerrarObsoletas(atletaId)`: `PENDING` com `acaoProposta`
      → `EXPIRED` (`expiresAt` vencido) ou `SUPERSEDED` (alvo não `PENDENTE`, removido ou versão
      ≠ snapshot), `reviewedAt = now`, `rejectionReason` sistêmico; `SELECT … FOR UPDATE`
- [ ] 4.3 Testes: alvo realizado; alvo removido; alvo editado; expiração; duas execuções
      concorrentes → uma transição; `aprovar` em `EXPIRED`/`SUPERSEDED` → `409`

## Fase 5 — Sugestão com prescrição completa e gatilho por evento (PR 3)

### 5. Builder e rotina
- [ ] 5.1 `PainAdjustSuggestionBuilder.build(item, planoVigente, hoje)`: treino-alvo (B2; pula
      realizado e `TODAY_ON_WATCH`), `alvoSnapshot` com `versao`, `prescricao` completa (1 etapa
      `CONTINUO` Z1 30 min, `metas = []`, `descricao` neutra), `summary` derivado da prescrição
      (template de observação, dias em `EEE dd/MM` pt-BR), `reasoningJson` com episódio +
      evidências + `acaoProposta`; sem candidato ou alvo bloqueado → sem `acaoProposta` e `summary`
      de ajuste manual
- [ ] 5.2 `SugestaoCoachGeneratorJob`: `MOTIVO_TIPO[DOR_RECORRENTE] = PAIN_ADJUST`; chama
      `encerrarObsoletas` antes de gerar; `confidence` pela severidade; só em `modo = ATIVO`
- [ ] 5.3 `FeedbackTreinoRegistradoEvent` publicado em `POST /me/realizados/{id}/feedback` e na
      reconciliação que grava `sensacoes`; listener `AFTER_COMMIT` roda a mesma rotina para o
      atleta (idempotente: `uk_sugestao_pending` + encerramento)
- [ ] 5.4 Testes: alvo = próximo intensivo pendente; alvo bloqueado → sem ação e texto de ajuste
      manual; `uk_sugestao_pending` não conflita com `RECOVERY`; template com/sem segundo
      intensivo; nenhum texto gerado contém região do corpo/termo clínico (lista negra no teste);
      evento às 20h gera a sugestão no mesmo dia; cron não duplica
- [ ] 5.5 Atualizar OpenAPI (`SugestaoCoachOutputDto.tipo`/`status`, `acaoProposta` resumida com
      diff legível para o front: alvo, de → para)

## Fase 6 — Aprovar aplica a prescrição (PR 4)

### 6. `aprovar`, `editar`, "Ajustar"
- [ ] 6.1 `aprovar`: sem `acaoProposta` → fluxo atual; `acao.enabled=false` → `409 ACAO_DESABILITADA`;
      alvo ausente → `409 ALVO_INEXISTENTE`; versão ≠ snapshot → `409 ALVO_ALTERADO`; policy →
      `409` com o código; `PostApprovalEditCoordinator.substituir(treino, prescricao, PAIN_INJURY, coachId)`
      recalculando derivados; `APPROVED` + audit (treino, versão antes/depois, reason) — uma
      transação
- [ ] 6.2 `editar(summary)` com `acaoProposta` → `409 SUGESTAO_COM_ACAO_NAO_EDITAVEL`
- [ ] 6.3 Métrica `coach_sugestao_pain_adjust_aplicada_total`; audit de
      `coach-suggestion-decision-audit` registra aceita/ajuste manual/rejeitada + `rejectionReason`
- [ ] 6.4 Testes de integração: aprovação substitui o treino (tipo, duração, etapas, metas,
      `editedAfterApprovalAt`, `editReason`) e dispara reenvio; **payload exportado ao relógio a
      partir de intervalado com repetições e metas não tem etapa acima de Z2**; alvo realizado →
      `409`; alvo alterado → `409`; falha no coordinator → rollback; segunda aprovação no-op;
      expirada → `409`; `RECOVERY` antiga aprova só status; flag de ação desligada → `409`
- [ ] 6.5 **front** `DecisionCard`/painel: "Aceitar" mostra o diff (`Qui 12/11: Intervalado 60 min
      → Regenerativo 30 min`) e confirma; "Ajustar" = `rejeitar(AJUSTE_MANUAL)` + abre
      `TreinoEditDialog` no alvo; `409` mantém o card com a mensagem; chip "Atenção alta" em
      `CRITICA`; chips "RPE 4 → 6"/"Prova em N dias" das evidências
- [ ] 6.6 **front** Testes de componente para 6.5
- [ ] 6.7 **E2E** `tests/e2e/coach/sugestao-dor.spec.ts`: sugestão `PAIN_ADJUST` pendente → Aceitar
      → diff → confirma → `POST .../aprovar` → linha de Qui vira "Regenerativo · 30 min" com selo
      de edição pós-aprovação; `409 ALVO_ALTERADO` mantém o card com erro; Ajustar rejeita e abre
      o diálogo — fluxo que escreve no plano do atleta, E2E obrigatório

## Fase 7 — Entrega
- [ ] 7.1 Fatia 1: `./mvnw clean test` + front verdes; `modo=SOMBRA` em testes e produção
- [ ] 7.2 Revisão do template e da `descricao` por alguém com formação em educação física/fisiologia
      antes da fatia 2; registrar quem revisou no `proposal.md`
- [ ] 7.3 Fatia 2: `./mvnw clean test && npm run lint && npm run build && npm run test:run && npm run test:e2e`
      verdes; `acao.enabled=true` só em testes (Railway `develop`) até validar com um atleta real
- [ ] 7.4 Atualizar `specs/coach-pain-attention/spec.md` e o delta de
      `coach-suggestion-decision-audit` com o que divergiu; follow-ups: lista fechada de motivos de
      rejeição; editar a prescrição pela UI; integração com `rag-injury-aware-prescription`;
      limiares por assessoria

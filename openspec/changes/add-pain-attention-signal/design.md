## Context

Backend Java 21 / Spring Boot 3.5, PostgreSQL, multi-tenant por `TenantContext`. Peças existentes:

- `TreinoRealizado.sensacoes` (`Set<Sensacao>`, `ElementCollection`, `@EntityGraph` com
  `sensacoes` em `findByTenantIdAndFonteDadosAndExternalId`), `percepcaoEsforco`, `feedbackAtleta`,
  `treinoPlanejado` (vínculo da reconciliação).
- Fila de atenção: `CoachAttentionQueueServiceImpl.montarItem(atleta, hoje, …)` chama o
  `CoachAttentionSignalEvaluator` (funções puras `avaliarX → Optional<SinalAtencao>`), consolida
  evidências, mantém **1 item por atleta** com o motivo principal escolhido **primeiro pela
  severidade, depois pelo peso**; corte em `ALTA`. `getAttentionQueue` (corta em `MAX_ITENS = 20`)
  e `getSinaisParaAtleta` são `@Transactional(readOnly = true)` — leitura pura, rodam a cada
  abertura do dashboard e do perfil. `montarItem` só carrega provas **pendentes de revisão**
  (`findPendentesRevisaoByAssessoria`/`ByAtleta`), não a prova-alvo.
- Sugestões: `SugestaoCoachGeneratorJob` (cron 06:00) lê `getAttentionQueue()`, mapeia
  `item.primaryReason()` por `MOTIVO_TIPO`, ignora `MOTIVOS_IGNORADOS = {PROVA_ATLETA}`, grava
  `SugestaoCoach` com `summary`, `confidence` (`HIGH`/`MEDIUM`) e `reasoningJson` (coluna
  `reasoning` jsonb com um `RecommendationExplanation` serializado — `rationale`, `sourceRules`,
  `confidence` —, lido de volta pelo `SugestaoCoachMapper`); `uk_sugestao_pending (atleta_id,
  tipo) WHERE status='PENDING'`. `SugestaoCoachServiceImpl.aprovar(id, versao)` só muda status;
  não checa `expiresAt` (só `listar` filtra); o `switch` cobre `APPROVED`/`REJECTED`/`PENDING` e
  cai em `IllegalStateException` para outro valor. A edição do `summary` é `PUT /{id}`
  (`CoachSugestaoController:117`). `REJECTED → aprovar` responde `422`
  (`DomainRuleViolationException`).
- Edição de treino: `TreinoPlanejadoServiceImpl.editarTreino(planoId, treinoId, patch)` aplica o
  `TreinoPlanejadoPatchDto` (`aplicarPatch`: campo nulo preserva; `etapas` presentes substituem
  todas via `aplicarEtapasPatch`, que faz `clear()`; `zonaAlvo` vazio limpa; TSS recalculado com
  `percepcaoEsforcoEsperada`) e, para plano aprovado, passa por `PostApprovalEditCoordinator`
  (`checkBeforePatch` usa `ApprovedWorkoutEditPolicy.avaliar(treino, hoje, hasWatch)` — rejeições
  `NOT_PENDING`, `PAST_DAY`, `TODAY_ON_WATCH` — e lança `DomainRuleViolationException`, `422`;
  carimba `editedAfterApprovalAt`, grava `PlannedWorkoutPostApprovalEdit` com o `reason` e publica
  `WorkoutEditedAfterApprovalEvent`, que reenvia ao relógio **depois do commit**).
  `ApprovedWorkoutEditContext.resolve(atletaId, atleta, tenantId)` dá o `hasWatch`. `TreinoPlanejado`
  tem `@Version versao`, `statusTreino` e não tem `metas` nem `atualizadoEm`/`updatedAt`.
- Único escritor de `TreinoRealizado.sensacoes`: `AtletaTreinoFeedbackServiceImpl` (`:53`).
- Regra de prompt: `WorkoutAnalysisPromptDataBuilder` nunca coloca texto livre do atleta no prompt.
  ArchUnit já está no `pom.xml`.

## Goals

- Dor relatada em 2+ treinos numa semana vira item na fila e sugestão com treino-alvo, sem LLM.
- Aceitar a sugestão aplica a edição pelo caminho que já existe (policy + coordinator + reason).
- Nada muda para sugestões sem `proposedAction`.

## Non-Goals

- Região do corpo, gravidade ou classificação do comentário (texto livre fica para o coach ler).
- Cadastrar lesão (`Atleta.temLesao`) automaticamente.
- Cancelar/alterar outros treinos além do alvo; "manter Sáb se o check-in vier sem dor" é texto.
- Notificação push/e-mail ao coach (fila + Inbox já são o canal).

## Decisions

### D1 — Sinal determinístico a partir de `Sensacao.DOR`
`evaluateRecurringPain(List<PainOccurrence> occurrences, Optional<Integer> daysToTargetRace)`
(identificadores novos em inglês, ADR-0007 do backend):

```java
public record PainOccurrence(UUID realizadoId, LocalDate date, TipoTreino tipo,
                             Integer rpe, String comment, UUID treinoPlanejadoId) {}
```
- `ocorrencias` = realizados do atleta nos últimos `janelaDias` (default 7) com `DOR` em
  `sensacoes`, mais recente primeiro. Conta **dias distintos** (`data`), não realizados: duas
  sessões no mesmo dia são uma ocorrência. Dias distintos < `minimoDias` (default 2) →
  `Optional.empty()`.
- Severidade `ALTA`; `CRITICA` **só** quando os dois dias mais recentes são consecutivos no plano
  (`treinoPlanejadoId` em dias seguidos). RPE e `daysToTargetRace` entram nas evidências
  ("RPE 4 → 6", "prova em 11 dias"), não na severidade (review de produto: esforço não é dor;
  proximidade de prova poria todo atleta em `CRITICA`).
- Evidências (uma por ocorrência, ≤ 3): `"{Seg 09/11} · RPE 4 — \"{comentario}\""`; comentário
  inteiro (≤ 1000, `@Size` de `FeedbackTreinoInputDto.comentario`), front trunca. Sem comentário:
  só data, tipo e RPE.
- Peso 55 em `MotivoAtencao` (acima de `FADIGA` 50): dor vence fadiga **na mesma severidade**. A
  fila ordena por severidade antes do peso, então dor `ALTA` perde para `FADIGA`/`PROVA_ATLETA`
  `CRITICA` e vira evidência. A regra da fila não muda; a sugestão não depende dela (D9, P1).
- **Episódio** = (atletaId, data do primeiro dia com `DOR` da janela). Contagem única por
  episódio: ver Decisão pendente P2 no `proposal.md` (recomendado: derivada por consulta sobre os
  dados persistidos, sem escrita na fila).

Configuração `app.coach.atencao.dor.*` (`@ConfigurationProperties`, validadas): `modo`
(`DESLIGADO | SOMBRA | ATIVO`, default `SOMBRA` em produção), `janela-dias=7`, `minimo-dias=2`.
Em `SOMBRA` o evaluator roda e o log registra o episódio, mas o sinal não entra na fila (nem
como evidência). Limitação registrada: config global, não por assessoria. Produção usa o profile
`cloud` (`application-cloud.yml`).

### D2 — Queries próprias, por tenant, com `sensacoes` carregadas
Prova-alvo: query nova em `ProvaRepository` (próxima prova-alvo futura do atleta, por tenant) —
a que `montarItem` já carrega é só a lista de provas pendentes de revisão. Para o cron (D9),
`findAthletesWithPainInWindow(tenantId, inicio, fim)` devolve os ids de atleta com `DOR` na janela.

`TreinoRealizadoRepository.findPainInWindow(UUID tenantId, UUID atletaId, LocalDate inicio, LocalDate fim)`
com `@EntityGraph(attributePaths = "sensacoes")` e `JOIN tr.sensacoes s WHERE s = 'DOR'`. Não reusar
`findByAtletaIdAndDataTreinoBetween` (sem `sensacoes` no graph → N+1 na fila, que roda para todos
os atletas do tenant). A fila já itera atletas do tenant; a query recebe `tenantId` explícito.

### D3 — `TipoSugestao.PAIN_ADJUST`, não `RECOVERY`
`FADIGA/SOBRECARGA/INATIVIDADE` já geram `RECOVERY`; com `uk_sugestao_pending (atleta, tipo)`, dor
num atleta fadigado seria descartada por conflito. Tipo próprio = sugestão própria. Migration
aditiva (`V120` ou posterior) recria `chk_sugestao_tipo` com o valor novo (e
`chk_sugestao_status`, ver D8). Front: `TIPO_LABELS` (`RecentSuggestionsPanel`,
`DashboardSuggestionsPanel`) ganha "Ajuste por dor" e `SugestaoTipo` ganha `PAIN_ADJUST`;
`SuggestionTypeBadge` não é usado para sugestões do backend e não muda. O chip de severidade é
"Atenção alta", não "Risco alto".

### D4 — `proposedAction` como campo extra do `RecommendationExplanation`, com patch completo e snapshot do alvo
A coluna `reasoning` guarda hoje um `RecommendationExplanation` serializado, e o
`SugestaoCoachMapper` o lê de volta com esse tipo. O formato da `PAIN_ADJUST` **mantém**
`rationale`, `sourceRules` e `confidence` na raiz (o output continua igual para o front) e
acrescenta `episode` e `proposedAction`, que o mapper ignora:

```json
{
  "rationale": "Atleta relatou dor em 2 dias distintos nos últimos 7 dias.",
  "sourceRules": ["CoachAttentionSignalEvaluator.evaluateRecurringPain"],
  "confidence": "HIGH",
  "episode": { "atletaId": "…", "startedOn": "2026-11-09" },
  "proposedAction": {
    "type": "REPLACE_WORKOUT",
    "treinoPlanejadoId": "…",
    "planoId": "…",
    "targetSnapshot": { "versao": 7, "tipoTreino": "INTERVALADO", "duracaoMin": 60 },
    "prescription": {
      "tipoTreino": "REGENERATIVO",
      "duracaoMin": 30,
      "clearDistanciaKm": true,
      "zonaAlvo": "Z1",
      "percepcaoEsforcoEsperada": 2,
      "descricao": "Treino leve — ajustado após relato de desconforto",
      "etapas": [ { "ordem": 1, "tipoEtapa": "CONTINUO", "duracaoMin": 30, "zona": "Z1" } ]
    },
    "reason": "PAIN_INJURY"
  }
}
```
O mapper precisa tolerar os campos extras (`FAIL_ON_UNKNOWN_PROPERTIES` desligado no
`ObjectMapper` usado, ou `@JsonIgnoreProperties(ignoreUnknown = true)` no record) — teste de
regressão: `reasoning` com `proposedAction` desserializa para o mesmo `RecommendationExplanation`.
As evidências continuam no item da fila; não são copiadas para o JSON.

- **Patch completo, não parcial** (pre-mortem Codex): `aprovar` monta um `TreinoPlanejadoPatchDto`
  a partir de `prescription` e chama `TreinoPlanejadoServiceImpl.editarTreino(planoId, treinoId,
  patch)` com `editReason = PAIN_INJURY` — o mesmo serviço do `PATCH` manual de treino, que já
  passa pela policy e pelo coordinator quando o plano é aprovado. `etapas` presentes substituem
  todas as atuais (`aplicarEtapasPatch` faz `clear()`), então os tiros saem. `TreinoPlanejado` e
  `EtapaTreino` não têm `metas`; o `ritmoAlvo` vive na etapa e sai junto. Duas lacunas reais do
  patch, cobertas nesta change:
  - `distanciaKm` nula **preserva** o valor (12 km do intervalado ficariam): o patch ganha limpeza
    explícita (`clearDistanciaKm`, mesma ideia de `zonaAlvo` vazio = limpar).
  - O TSS é recalculado com `percepcaoEsforcoEsperada`; sem mandá-la, valeria a do intervalado. A
    prescrição manda a percepção leve explicitamente.
  `IntervalsIcuWorkoutConverter` prioriza etapas prescritivas sobre a duração; teste obrigatório:
  payload exportado ao relógio a partir de um intervalado com repetições → nenhuma etapa acima de
  Z2.
- **`targetSnapshot`**: `versao` (`@Version` do `TreinoPlanejado`) e campos-chave no momento da
  geração. `aprovar` recusa com `409 ALVO_ALTERADO` se a versão atual difere — cobre "o coach
  ajustou para 40 min e depois alguém aceitou 30".
- Parse por `record ProposedAction` com Jackson, ignorando campos desconhecidos. Sem
  `proposedAction` → comportamento atual. Sem coluna nova porque a ação só faz sentido dentro da
  sugestão e termina com ela (D8).

Treino-alvo (`B2`): primeiro `TreinoPlanejado` de um plano **aprovado** do atleta com `data > hoje`
(ou `= hoje` se ainda `PENDENTE` e não `TODAY_ON_WATCH`), `statusTreino = PENDENTE`, `tipoTreino ∈
{INTERVALADO, TIRO, FARTLEK, TEMPO_RUN, SUBIDA, LONGO}`. Plano em `AGUARDANDO_REVISAO` não gera
ação (o treino é editável, mas sem carimbo pós-aprovação; o coach revisa o plano de qualquer
forma). Nenhum candidato, ou o próximo intensivo já bloqueado para edição (`TODAY_ON_WATCH`) →
sugestão **sem** `proposedAction`, `summary` de ciência ("Próximo intensivo já está no relógio;
ajuste manual se necessário").

`summary` como observação, gerado **a partir da `prescription` aprovável**, nunca editado à parte:
`"Atleta relatou dor em 2 treinos. Sugestão: trocar {Qui 12/11} ({Intervalado} 60 min) por treino
leve de 30 min. Confirmar com o atleta antes de manter {Sáb 14/11}."` — `{Sáb}` é o próximo
intensivo depois do alvo, se houver; sem ele a última frase some. Nenhum texto gerado cita
região do corpo, exercício corretivo ou condição clínica. `confidence`: `CRITICA → HIGH`,
`ALTA → MEDIUM` (mesma regra do job).

### D5 — `aprovar` aplica a ação pela policy, transacional, e falha fechado
```
aprovar(id, versao):
  sugestao = lock + versão (como hoje)
  switch status: APPROVED → no-op; REJECTED → 422 (como hoje);
                 EXPIRED | SUPERSEDED → 422 (mesmo padrão de REJECTED; hoje cairia em IllegalStateException/500)
  if expiresAt != null && expiresAt <= agora → 409 SUGESTAO_EXPIRADA   // hoje só listar filtra
  if proposedAction == null → status APPROVED (como hoje)
  if !props.acao.enabled → 409 ACAO_DESABILITADA (nunca aprovar "só status" uma sugestão com ação)
  treino = repo.findByIdAndTenant(proposedAction.treinoPlanejadoId)   // ausente → 409 ALVO_INEXISTENTE
  if treino.versao != targetSnapshot.versao → 409 ALVO_ALTERADO     // alguém editou o alvo depois da geração
  hasWatch = ApprovedWorkoutEditContext.resolve(atletaId, atleta, tenantId)
  rejection = ApprovedWorkoutEditPolicy.avaliar(treino, hoje, hasWatch)   // NOT_PENDING/PAST_DAY/TODAY_ON_WATCH
  if rejection.isPresent() → 409 { code: rejection.code }; sugestão continua PENDING (D8 a encerra depois)
  treinoPlanejadoService.editarTreino(planoId, treinoId, patchCompleto(prescription, PAIN_INJURY))  // mesma transação
  status APPROVED; audit registra treinoPlanejadoId, versão antes/depois, reason
```
Os `409` com código usam uma exceção nova (ex.: `CodedConflictException(String code, String
message)`) e um handler que devolve `code` no corpo. `DomainConflictException` não tem `code`, e a
recusa da policy dentro do `editarTreino` sai como `DomainRuleViolationException` (`422`) — por
isso `aprovar` avalia a policy **antes** e traduz para `409` com o código; o `PATCH` manual de
treino continua respondendo `422`.

Tudo em `@Transactional` (o `editarTreino` participa da mesma transação): falha desfaz o status.
O reenvio ao relógio é o do `PATCH` manual: `WorkoutEditedAfterApprovalEvent` publicado pelo
coordinator e tratado **depois do commit** (assíncrono). Não há reenvio síncrono.

- **`editar(id, summary)` (`PUT /api/v1/coach/sugestoes/{id}`) é bloqueado**
  (`409 SUGESTAO_COM_ACAO_NAO_EDITAVEL`) quando há `proposedAction`: o texto é derivado da
  prescrição e não pode descrever outra coisa.
- **"Ajustar"** = rejeitar a sugestão com `rejectionReason = "AJUSTE_MANUAL"` **e** abrir o
  `TreinoEditDialog` no treino-alvo, nessa ordem (uma chamada `rejeitar`, depois a edição manual
  com `reason` escolhido pelo coach). A sugestão nunca fica `PENDING` por cima de um treino que o
  coach já mexeu; se ficasse, o `targetSnapshot` a recusaria de qualquer forma.
- **"Aceitar"** no front mostra o diff antes de confirmar: `Qui 12/11: Intervalado 60 min →
  Regenerativo 30 min (1 etapa Z1)`.

### D6 — Texto do atleta nunca entra em prompt
Teste ArchUnit (já no `pom.xml`): nenhuma classe `*PromptDataBuilder`/`*PromptBuilder` acessa
`TreinoRealizado#getFeedbackAtleta` nem as evidências da fila (`SinalAtencao#evidencias`,
`CoachAttentionItemOutputDto#evidence`). Não usar teste por grep de texto: o javadoc de
`WorkoutAnalysisPromptDataBuilder` cita `feedbackAtleta` justamente para proibi-lo e quebraria o
teste. A evidência é dado para o coach, exibida como texto (front já escapa).

### D7 — Invariantes de segurança testados
- Nenhuma edição sem `status = APPROVED` na mesma transação.
- Tenant: query da fila, busca do treino-alvo e do atleta por `tenantId`.
- Idempotência: aprovar duas vezes → segunda chamada no-op (`APPROVED`), sem reaplicar a
  prescrição.
- Expiração: `expiresAt` vencido → `409 SUGESTAO_EXPIRADA` (checagem nova em `aprovar`);
  treino-alvo nunca editado.
- Snapshot: alvo com versão diferente → `409 ALVO_ALTERADO`, nada editado.
- Prescrição completa: a partir de um intervalado com repetições, o treino aprovado não guarda a
  `distanciaKm` antiga e o payload exportado ao relógio não contém etapa acima de Z2.

### D8 — Estados terminais: `EXPIRED` e `SUPERSEDED`
`uk_sugestao_pending (atleta_id, tipo) WHERE status = 'PENDING'` olha só o status, e o job pula
qualquer `PENDING` do mesmo atleta/tipo. Uma `PAIN_ADJUST` cujo alvo foi realizado, removido ou
alterado ficaria `PENDING` para sempre (a policy só devolve `409`) e bloquearia a substituta.

- `StatusSugestao` ganha `EXPIRED` (passou `expiresAt`) e `SUPERSEDED` (alvo deixou de ser
  `PENDENTE`, foi removido, ou mudou de versão). Transições: `PENDING → EXPIRED | SUPERSEDED`.
  Migration aditiva (`V120` ou posterior) recria `chk_sugestao_status`.
- **Passo de encerramento antes da geração**, na rotina (cron e evento de D9): para cada
  `PENDING` com `proposedAction`, verificar `expiresAt` e o alvo; marcar `EXPIRED`/`SUPERSEDED` com
  `reviewedAt = now` e `rejectionReason` sistêmico (`"EXPIRADA"`, `"ALVO_REALIZADO"`,
  `"ALVO_REMOVIDO"`, `"ALVO_ALTERADO"`). O comentário da coluna na `V100` diz "só preenchido em
  REJECTED"; a mesma migration desta change atualiza o `COMMENT ON COLUMN
  tb_sugestao_coach.rejection_reason` para "texto do coach em REJECTED ou código sistêmico em
  EXPIRED/SUPERSEDED". Só então gerar a substituta — na mesma transação por atleta, com
  `SELECT … FOR UPDATE` na sugestão encerrada, para execuções concorrentes não duplicarem.
- `aprovar`/`rejeitar` em `EXPIRED`/`SUPERSEDED` → `422`, mesmo padrão de `REJECTED` hoje
  (`DomainRuleViolationException`); o `switch` ganha os dois casos — sem eles, cai em
  `IllegalStateException` (500).
- Testes: alvo realizado; alvo removido; expiração; duas execuções concorrentes → uma
  substituta; `aprovar`/`rejeitar` em terminal → `422`.

### D9 — Geração no evento, cron como reconciliação, rotina por atleta
O cron das 06:00 pode nascer tarde: dor registrada às 20h, intensivo às 7h do dia seguinte já é
"hoje" e cai em `TODAY_ON_WATCH`. E o job atual não serve como está: lê `getAttentionQueue()`,
que corta em `MAX_ITENS = 20` por tenant (atleta fora do top 20 nunca receberia sugestão), e só
olha `primaryReason` (dor `ALTA` atrás de `FADIGA` `CRITICA` nunca geraria). Por isso
(recomendação de P1):
- `PainAdjustSuggestionRoutine.run(atletaId, hoje)` avalia a dor **diretamente**:
  `findPainInWindow` + `evaluateRecurringPain` + prova-alvo (D2). Não passa pela fila nem pelo
  `primaryReason`; `MOTIVO_TIPO` e `MOTIVOS_IGNORADOS` não mudam por causa da dor.
- Evento `PainFeedbackRecordedEvent`, publicado em `AtletaTreinoFeedbackServiceImpl` (o único
  escritor de `sensacoes`, `:53`) quando o feedback salvo contém `DOR` → listener
  `@TransactionalEventListener(AFTER_COMMIT)` roda a rotina para o atleta, em modo `ATIVO`, de
  forma **idempotente** (`uk` + D8 garantem uma pendente). A ingestão (Garmin, intervals.icu,
  FIT) não grava `sensacoes` e não publica o evento.
- O `SugestaoCoachGeneratorJob` das 06:00, depois do laço atual, itera
  `findAthletesWithPainInWindow(tenantId, …)` e chama a mesma rotina por atleta (reconciliação).
- Quando o próximo intensivo já está bloqueado (`TODAY_ON_WATCH`), a sugestão nasce sem
  `proposedAction` com o texto de ajuste manual (D4) — o coach vê a necessidade, não um "Aceitar"
  que não faz nada.

### D10 — Flags separadas: geração × execução da ação
`app.coach.atencao.dor.modo` governa sinal e geração. `app.coach.sugestao.acao.enabled` governa
**só** a execução de `proposedAction` em `aprovar`; desligada, `aprovar` de uma sugestão com ação
responde `409 ACAO_DESABILITADA` — nunca vira aprovação "só status", que registraria sucesso sem
efeito e, pela idempotência, impediria aplicar depois. Os valores de produção ficam em
`application-cloud.yml` (não existe `application-prod`).

## Architecture

```
CoachAttentionQueueServiceImpl.montarItem   (readOnly; dashboard, perfil e Inbox)
  └─ treinoRealizadoRepo.findPainInWindow(tenant, atleta, hoje-6, hoje) + provaRepo (prova-alvo)
       └─ evaluator.evaluateRecurringPain(ocorrencias, daysToTargetRace) → SinalAtencao(DOR_RECORRENTE, sev, evidências)
            └─ modo SOMBRA: log, sem sinal · modo ATIVO: sinal entra no desempate (severidade → peso)

PainAdjustSuggestionRoutine.run(atletaId, hoje)   ← SugestaoCoachGeneratorJob 06:00 (atletas com DOR na janela)
  │                                                 e PainFeedbackRecordedEvent (AFTER_COMMIT, um atleta)
  ├─ encerrar PENDING obsoletas → EXPIRED | SUPERSEDED      (D8, FOR UPDATE)
  ├─ findPainInWindow + evaluateRecurringPain               (não depende do primaryReason da fila)
  └─ PainAdjustSuggestionBuilder.build(sinal, planoAprovado, hoje)
       → summary (da prescrição) + reasoning{rationale, sourceRules, confidence, episode, proposedAction}

SugestaoCoachServiceImpl.aprovar
  ├─ switch status (EXPIRED/SUPERSEDED → 422) · expiresAt vencido → 409 SUGESTAO_EXPIRADA
  └─ ProposedAction.parse(reasoning)
       ├─ null → APPROVED
       ├─ acao.enabled=false → 409 ACAO_DESABILITADA
       ├─ versão ≠ snapshot → 409 ALVO_ALTERADO
       ├─ ApprovedWorkoutEditPolicy.avaliar → 409 {code}
       └─ TreinoPlanejadoServiceImpl.editarTreino(patch completo, editReason=PAIN_INJURY)
            → PostApprovalEditCoordinator (carimbo + PlannedWorkoutPostApprovalEdit + WorkoutEditedAfterApprovalEvent)
            → APPROVED + audit
```

## Key Interfaces

```java
public enum MotivoAtencao { DOR_RECORRENTE(55, "Dor relatada em treinos seguidos: trocar o próximo intensivo por leve e confirmar com o atleta."), FADIGA(50, …), … }
public enum TipoSugestao { PLAN_ADJUST, RECOVERY, NEW_PLAN, PAIN_ADJUST }
public enum StatusSugestao { PENDING, APPROVED, REJECTED, EXPIRED, SUPERSEDED }

public record PainOccurrence(UUID realizadoId, LocalDate date, TipoTreino tipo,
                             Integer rpe, String comment, UUID treinoPlanejadoId) {}

public record ProposedAction(String type, UUID treinoPlanejadoId, UUID planoId,
                             TargetSnapshot targetSnapshot, ReplacementPrescription prescription,
                             WorkoutEditReason reason) {
    static Optional<ProposedAction> parse(String reasoningJson);
}
public record TargetSnapshot(long versao, TipoTreino tipoTreino, Integer duracaoMin) {}
public record ReplacementPrescription(TipoTreino tipoTreino, Integer duracaoMin, boolean clearDistanciaKm,
                                      String zonaAlvo, Integer percepcaoEsforcoEsperada,
                                      String descricao, List<EtapaInputDto> etapas) {}

public class CodedConflictException extends RuntimeException {   // 409 com `code` no corpo
    public CodedConflictException(String code, String message) { … }
}
```

## Migration Path

**Fatia 1 — sinal (PR 1 backend + PR front):** migration (`V120`+) `chk_sugestao_tipo`/
`chk_sugestao_status` + enums + config `modo` + evaluator + queries + rótulos no front. Sobe em
`SOMBRA`; 2–4 semanas de piloto medindo episódios (forma decidida em P2) e falso positivo;
`ATIVO` quando ≤ 30%.

**Fatia 2 — sugestão com ação (só após a fatia 1 validada):**
2. Estados terminais + rotina de encerramento (D8) — PR 2.
3. Builder `PAIN_ADJUST` com patch completo e snapshot + rotina por atleta + gatilho por evento
   (D4, D9) — PR 3. `aprovar` ainda recusa com `409 ACAO_DESABILITADA` (D10) até o PR 4.
4. `aprovar` aplica o patch + bloqueio de `editar` + "Ajustar" = rejeitar + editar manual + E2E —
   PR 4; ligar `app.coach.sugestao.acao.enabled`.

Rollback: `modo=DESLIGADO` para o sinal; `acao.enabled=false` para a execução — sugestões com
ação passam a responder `409` na aprovação (visível), nunca aprovação sem efeito. Nenhuma
migration destrutiva; os valores novos de enum ficam inertes.

## Context

Backend Java 21 / Spring Boot 3.5, PostgreSQL, multi-tenant por `TenantContext`. Peças existentes:

- `TreinoRealizado.sensacoes` (`Set<Sensacao>`, `ElementCollection`, `@EntityGraph` com
  `sensacoes` em `findByTenantIdAndFonteDadosAndExternalId`), `percepcaoEsforco`, `feedbackAtleta`,
  `treinoPlanejado` (vínculo da reconciliação).
- Fila de atenção: `CoachAttentionQueueServiceImpl.montarItem(atleta, hoje, …)` chama o
  `CoachAttentionSignalEvaluator` (funções puras `avaliarX → Optional<SinalAtencao>`), consolida
  evidências, mantém **1 item por atleta** com o motivo de maior severidade/peso; corte em `ALTA`.
- Sugestões: `SugestaoCoachGeneratorJob` (cron 06:00) mapeia `MotivoAtencao → TipoSugestao`,
  ignora `PROVA_ATLETA`, grava `SugestaoCoach` com `summary`, `confidence` (`HIGH`/`MEDIUM`),
  `reasoningJson`; `uk_sugestao_pending (atleta_id, tipo) WHERE status='PENDING'`.
  `SugestaoCoachServiceImpl.aprovar(id, versao)` só muda status.
- Edição de treino aprovado: `ApprovedWorkoutEditPolicy` (rejeições `NOT_PENDING`, `PAST_DAY`,
  `TODAY_ON_WATCH`), `ApprovedWorkoutEditContext`, `PostApprovalEditCoordinator` (aplica patch,
  carimba `editedAfterApprovalAt`, dispara reenvio ao relógio), `WorkoutEditReason.PAIN_INJURY`.
- Regra de prompt: `WorkoutAnalysisPromptDataBuilder` nunca coloca texto livre do atleta no prompt.

## Goals

- Dor relatada em 2+ treinos numa semana vira item na fila e sugestão com treino-alvo, sem LLM.
- Aceitar a sugestão aplica a edição pelo caminho que já existe (policy + coordinator + reason).
- Nada muda para sugestões sem `acaoProposta`.

## Non-Goals

- Região do corpo, gravidade ou classificação do comentário (texto livre fica para o coach ler).
- Cadastrar lesão (`Atleta.temLesao`) automaticamente.
- Cancelar/alterar outros treinos além do alvo; "manter Sáb se o check-in vier sem dor" é texto.
- Notificação push/e-mail ao coach (fila + Inbox já são o canal).

## Decisions

### D1 — Sinal determinístico a partir de `Sensacao.DOR`
`avaliarDorRecorrente(List<RealizadoDorSinal> ocorrencias, Optional<Integer> diasAteProvaAlvo)`:

```java
public record RealizadoDorSinal(UUID realizadoId, LocalDate data, TipoTreino tipo,
                                Integer rpe, String comentario, UUID treinoPlanejadoId) {}
```
- `ocorrencias` = realizados do atleta nos últimos `janelaDias` (default 7) com `DOR` em
  `sensacoes`, mais recente primeiro. Conta **dias distintos** (`data`), não realizados: duas
  sessões no mesmo dia são uma ocorrência. Dias distintos < `minimoDias` (default 2) →
  `Optional.empty()`.
- Severidade `ALTA`; `CRITICA` **só** quando os dois dias mais recentes são consecutivos no plano
  (`treinoPlanejadoId` em dias seguidos). RPE e `diasAteProvaAlvo` entram nas evidências
  ("RPE 4 → 6", "prova em 11 dias"), não na severidade (review de produto: esforço não é dor;
  proximidade de prova poria todo atleta em `CRITICA`).
- Evidências (uma por ocorrência, ≤ 3): `"{Seg 09/11} · RPE 4 — \"{comentario}\""`; comentário
  inteiro (≤ 500), front trunca. Sem comentário: só data, tipo e RPE.
- Peso 55 em `MotivoAtencao` (acima de `FADIGA` 50): dor deve vencer TSB crítico no desempate de
  1 item por atleta.
- **Episódio** = (atletaId, data do primeiro dia com `DOR` da janela). Métrica
  `coach_atencao_dor_episodio_total` incrementa uma vez por episódio novo; a chave do episódio
  fica no item de audit da fila para não recontar nas execuções diárias.

Configuração `app.coach.atencao.dor.*` (`@ConfigurationProperties`, validadas): `modo`
(`DESLIGADO | SOMBRA | ATIVO`, default `SOMBRA` em produção), `janela-dias=7`, `minimo-dias=2`.
Em `SOMBRA` o evaluator roda, a métrica e o log registram o episódio, mas o sinal não entra na
fila. Limitação registrada: config global, não por assessoria.

### D2 — Query própria, por tenant, com `sensacoes` carregadas
`TreinoRealizadoRepository.findComDorNaJanela(UUID tenantId, UUID atletaId, LocalDate inicio, LocalDate fim)`
com `@EntityGraph(attributePaths = "sensacoes")` e `JOIN tr.sensacoes s WHERE s = 'DOR'`. Não reusar
`findByAtletaIdAndDataTreinoBetween` (sem `sensacoes` no graph → N+1 na fila, que roda para todos
os atletas do tenant). A fila já itera atletas do tenant; a query recebe `tenantId` explícito.

### D3 — `TipoSugestao.PAIN_ADJUST`, não `RECOVERY`
`FADIGA/SOBRECARGA/INATIVIDADE` já geram `RECOVERY`; com `uk_sugestao_pending (atleta, tipo)`, dor
num atleta fadigado seria descartada por conflito. Tipo próprio = sugestão própria. Migration
aditiva recria `chk_sugestao_tipo` com o valor novo (e `chk_sugestao_status`, ver D8). Front:
`SuggestionTypeBadge` ganha o rótulo "Ajuste por dor"; o chip de severidade é "Atenção alta",
não "Risco alto".

### D4 — `acaoProposta` em `reasoningJson`, com prescrição completa e snapshot do alvo
```json
{
  "motivo": "DOR_RECORRENTE",
  "episodio": { "atletaId": "…", "inicio": "2026-11-09" },
  "evidencias": ["Seg 09/11 · RPE 4 — …", "Ter 10/11 · RPE 6 — …"],
  "acaoProposta": {
    "tipo": "SUBSTITUIR_TREINO",
    "treinoPlanejadoId": "…",
    "alvoSnapshot": { "versao": 7, "tipoTreino": "INTERVALADO", "duracaoMin": 60, "updatedAt": "…" },
    "prescricao": {
      "tipoTreino": "REGENERATIVO",
      "duracaoMin": 30,
      "distanciaKm": null,
      "descricao": "Treino leve — ajustado após relato de desconforto",
      "etapas": [ { "ordem": 1, "tipo": "CONTINUO", "duracaoMin": 30, "zona": "Z1" } ],
      "metas": []
    },
    "reason": "PAIN_INJURY"
  }
}
```
- **Prescrição completa, não patch parcial** (pre-mortem Codex): o caminho de edição existente
  preserva etapas e metas omitidas, e `IntervalsIcuWorkoutConverter` prioriza etapas prescritivas
  sobre a duração — um "patch" só de tipo/duração mostraria "Regenerativo · 30 min" enquanto o
  relógio continuaria recebendo os tiros. A ação substitui `etapas` por uma única etapa contínua
  Z1 de 30 min, zera `metas` intensivas, recalcula derivados (`tssPlanejado`, zona-alvo) pelo
  mesmo serviço que o `PATCH` manual usa. Teste obrigatório: payload exportado ao relógio a partir
  de um intervalado com repetições e metas → nenhuma etapa acima de Z2.
- **`alvoSnapshot`**: `versao` (`@Version` do `TreinoPlanejado`) e campos-chave no momento da
  geração. `aprovar` recusa com `409 ALVO_ALTERADO` se a versão atual difere — cobre "o coach
  ajustou para 40 min e depois alguém aceitou 30".
- `reasoningJson` já é texto JSON; parse por `record AcaoProposta` com Jackson, ignorando campos
  desconhecidos. Sem `acaoProposta` → comportamento atual. Sem coluna nova porque a ação só faz
  sentido dentro da sugestão e termina com ela (D8).

Treino-alvo (`B2`): primeiro `TreinoPlanejado` da semana vigente com `data > hoje` (ou `= hoje`
se ainda `PENDENTE` e não `TODAY_ON_WATCH`), `statusExecucao = PENDENTE`, `tipoTreino ∈
{INTERVALADO, TIRO, FARTLEK, TEMPO_RUN, SUBIDA, LONGO}`. Nenhum, ou o próximo intensivo já
bloqueado para edição (`TODAY_ON_WATCH`) → sugestão **sem** `acaoProposta`, `summary` de ciência
("Próximo intensivo já está no relógio; ajuste manual se necessário").

`summary` como observação, gerado **a partir da `prescricao` aprovável**, nunca editado à parte:
`"Atleta relatou dor em 2 treinos. Sugestão: trocar {Qui 12/11} ({Intervalado} 60 min) por treino
leve de 30 min. Confirmar com o atleta antes de manter {Sáb 14/11}."` — `{Sáb}` é o próximo
intensivo depois do alvo, se houver; sem ele a última frase some. Nenhum texto gerado cita
região do corpo, exercício corretivo ou condição clínica. `confidence`: `CRITICA → HIGH`,
`ALTA → MEDIUM` (mesma regra do job).

### D5 — `aprovar` aplica a ação pela policy, transacional, e falha fechado
```
aprovar(id, versao):
  sugestao = lock + versão (como hoje)
  if acaoProposta == null → status APPROVED (como hoje)
  if !props.acao.enabled → 409 ACAO_DESABILITADA (nunca aprovar "só status" uma sugestão com ação)
  treino = repo.findByIdAndTenant(acaoProposta.treinoPlanejadoId)   // ausente → 409 ALVO_INEXISTENTE
  if treino.versao != alvoSnapshot.versao → 409 ALVO_ALTERADO       // alguém editou o alvo depois da geração
  ctx = ApprovedWorkoutEditContext.of(treino, hoje)
  rejection = ApprovedWorkoutEditPolicy.evaluate(ctx)               // NOT_PENDING/PAST_DAY/TODAY_ON_WATCH
  if rejection.isPresent() → 409 { code: rejection }; sugestão continua PENDING (D8 a encerra depois)
  PostApprovalEditCoordinator.substituir(treino, prescricao, PAIN_INJURY, coachId)  // mesma transação
  status APPROVED; audit registra treinoPlanejadoId, versão antes/depois, reason
```
Tudo em `@Transactional`: falha no coordinator desfaz o status. Reenvio ao relógio segue o que o
coordinator já faz para o `PATCH` manual (síncrono + `ReenvioRelogio` em erro).

- **`editar(id, summary)` é bloqueado** (`409 SUGESTAO_COM_ACAO_NAO_EDITAVEL`) quando há
  `acaoProposta`: o texto é derivado da prescrição e não pode descrever outra coisa.
- **"Ajustar"** = rejeitar a sugestão com `rejectionReason = "AJUSTE_MANUAL"` **e** abrir o
  `TreinoEditDialog` no treino-alvo, nessa ordem (uma chamada `rejeitar`, depois a edição manual
  com `reason` escolhido pelo coach). A sugestão nunca fica `PENDING` por cima de um treino que o
  coach já mexeu; se ficasse, o `alvoSnapshot` a recusaria de qualquer forma.
- **"Aceitar"** no front mostra o diff antes de confirmar: `Qui 12/11: Intervalado 60 min →
  Regenerativo 30 min (1 etapa Z1)`.

### D6 — Texto do atleta nunca entra em prompt
Teste de arquitetura (ArchUnit ou teste de unidade sobre os builders): nenhum `*PromptDataBuilder`
lê `feedbackAtleta` nem as evidências da fila. A evidência é dado para o coach, exibida como texto
(front já escapa).

### D7 — Invariantes de segurança testados
- Nenhuma edição sem `status = APPROVED` na mesma transação.
- Tenant: query da fila, busca do treino-alvo e do atleta por `tenantId`.
- Idempotência: aprovar duas vezes → segunda chamada no-op (`APPROVED`), sem reaplicar a
  prescrição.
- Expiração: `expiresAt` vencido → `409` como hoje; treino-alvo nunca editado.
- Snapshot: alvo com versão diferente → `409 ALVO_ALTERADO`, nada editado.
- Prescrição completa: a partir de um intervalado com repetições e metas intensivas, o treino
  aprovado e o payload exportado ao relógio não contêm etapa acima de Z2.

### D8 — Estados terminais: `EXPIRED` e `SUPERSEDED`
`uk_sugestao_pending (atleta_id, tipo) WHERE status = 'PENDING'` olha só o status, e o job pula
qualquer `PENDING` do mesmo atleta/tipo. Uma `PAIN_ADJUST` cujo alvo foi realizado, removido ou
alterado ficaria `PENDING` para sempre (a policy só devolve `409`) e bloquearia a substituta.

- `StatusSugestao` ganha `EXPIRED` (passou `expiresAt`) e `SUPERSEDED` (alvo deixou de ser
  `PENDENTE`, foi removido, ou mudou de versão). Transições: `PENDING → EXPIRED | SUPERSEDED`.
  Migration aditiva recria `chk_sugestao_status`.
- **Passo de encerramento antes da geração**, no mesmo job (e no gatilho de D9): para cada
  `PENDING` com `acaoProposta`, verificar `expiresAt` e o alvo; marcar `EXPIRED`/`SUPERSEDED` com
  `reviewedAt = now` e `rejectionReason` sistêmico (`"EXPIRADA"`, `"ALVO_REALIZADO"`,
  `"ALVO_REMOVIDO"`, `"ALVO_ALTERADO"`). Só então gerar a substituta — na mesma transação por
  atleta, com `SELECT … FOR UPDATE` na sugestão encerrada, para execuções concorrentes do job
  não duplicarem.
- `aprovar`/`rejeitar` em `EXPIRED`/`SUPERSEDED` → `409` (sem transição).
- Testes: alvo realizado; alvo removido; expiração; duas execuções concorrentes do job → uma
  substituta.

### D9 — Geração no evento, cron como reconciliação
O cron das 06:00 pode nascer tarde: dor registrada às 20h, intensivo às 7h do dia seguinte já é
"hoje" e cai em `TODAY_ON_WATCH`. Por isso:
- Evento de domínio `FeedbackTreinoRegistradoEvent` (já disparado ou a disparar em
  `POST /me/realizados/{id}/feedback` e na reconciliação de ingestão que grava `sensacoes`) →
  listener `@TransactionalEventListener(AFTER_COMMIT)` que reavalia a fila do atleta e, em modo
  `ATIVO`, gera/encerra a `PAIN_ADJUST` de forma **idempotente** (mesma rotina do job; `uk` + D8
  garantem uma pendente).
- O cron das 06:00 continua rodando a mesma rotina para todos os atletas (reconciliação).
- Quando o próximo intensivo já está bloqueado (`TODAY_ON_WATCH`), a sugestão nasce sem
  `acaoProposta` com o texto de ajuste manual (D4) — o coach vê a necessidade, não um "Aceitar"
  que não faz nada.

### D10 — Flags separadas: geração × execução da ação
`app.coach.atencao.dor.modo` governa sinal e geração. `app.coach.sugestao.acao.enabled` governa
**só** a execução de `acaoProposta` em `aprovar`; desligada, `aprovar` de uma sugestão com ação
responde `409 ACAO_DESABILITADA` — nunca vira aprovação "só status", que registraria sucesso sem
efeito e, pela idempotência, impediria aplicar depois.

## Architecture

```
CoachAttentionQueueServiceImpl.montarItem
  └─ repo.findComDorNaJanela(tenant, atleta, hoje-7, hoje)
       └─ evaluator.avaliarDorRecorrente(ocorrencias, diasAteProvaAlvo) → SinalAtencao(DOR_RECORRENTE, sev, evidências)
            └─ modo SOMBRA: métrica + log, sem item · modo ATIVO: item na fila

PainAdjustSuggestionRoutine (idempotente por atleta)        ← cron 06:00 (todos) e FeedbackTreinoRegistradoEvent (um atleta)
  ├─ encerrar PENDING obsoletas → EXPIRED | SUPERSEDED      (D8, FOR UPDATE)
  └─ MOTIVO_TIPO[DOR_RECORRENTE] = PAIN_ADJUST
       └─ PainAdjustSuggestionBuilder.build(item, planoVigente, hoje) → summary (da prescrição) + reasoningJson{episodio, acaoProposta{alvoSnapshot, prescricao}}

SugestaoCoachServiceImpl.aprovar
  └─ AcaoProposta.parse(reasoningJson)
       ├─ null → APPROVED
       ├─ acao.enabled=false → 409 ACAO_DESABILITADA
       ├─ versão ≠ snapshot → 409 ALVO_ALTERADO
       └─ ApprovedWorkoutEditPolicy → PostApprovalEditCoordinator.substituir(prescricao, PAIN_INJURY) → APPROVED + audit
```

## Key Interfaces

```java
public enum MotivoAtencao { DOR_RECORRENTE(55, "Dor relatada em treinos seguidos: trocar o próximo intensivo por leve e confirmar com o atleta."), FADIGA(50, …), … }
public enum TipoSugestao { PLAN_ADJUST, RECOVERY, NEW_PLAN, PAIN_ADJUST }
public enum StatusSugestao { PENDING, APPROVED, REJECTED, EXPIRED, SUPERSEDED }

public record AcaoProposta(String tipo, UUID treinoPlanejadoId, AlvoSnapshot alvoSnapshot,
                           PrescricaoSubstituta prescricao, WorkoutEditReason reason) {
    static Optional<AcaoProposta> parse(String reasoningJson);
}
public record AlvoSnapshot(long versao, TipoTreino tipoTreino, Integer duracaoMin, Instant updatedAt) {}
public record PrescricaoSubstituta(TipoTreino tipoTreino, Integer duracaoMin, Double distanciaKm,
                                   String descricao, List<EtapaPrescrita> etapas, List<MetaPrescrita> metas) {}
```

## Migration Path

**Fatia 1 — sinal (PR 1 backend + PR front):** migration `chk_sugestao_tipo`/`chk_sugestao_status`
+ enums + config `modo` + evaluator + query + métrica de episódio + rótulos no front. Sobe em
`SOMBRA`; 2–4 semanas de piloto medindo episódios e falso positivo; `ATIVO` quando ≤ 30%.

**Fatia 2 — sugestão com ação (só após a fatia 1 validada):**
2. Estados terminais + rotina de encerramento (D8) — PR 2.
3. Builder `PAIN_ADJUST` com prescrição completa e snapshot + gatilho por evento (D4, D9) — PR 3.
   `aprovar` ainda recusa com `409 ACAO_DESABILITADA` (D10) até o PR 4.
4. `aprovar` aplica a prescrição + bloqueio de `editar` + "Ajustar" = rejeitar + editar manual +
   E2E — PR 4; ligar `app.coach.sugestao.acao.enabled`.

Rollback: `modo=DESLIGADO` para o sinal; `acao.enabled=false` para a execução — sugestões com
ação passam a responder `409` na aprovação (visível), nunca aprovação sem efeito. Nenhuma
migration destrutiva; os valores novos de enum ficam inertes.

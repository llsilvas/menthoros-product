# Design — add-pending-suggestion-badge

## Context

`CoachDashboardServiceImpl.getRoster()` já resolve um agregado tenant-inteiro fora do loop por
atleta e injeta no `montarResumo()` — `cobranca` (`Map<UUID, AthleteBilling>`, via
`athleteContractService.resolveBilling(atletaIds, hoje)`, comentário "resolvida uma vez para o
roster inteiro — sem N+1"). `getCalendarioSemanal()` faz o mesmo com `atletasEmAtencao`
(`Set<UUID>`, via `coachAttentionQueueService.getAttentionQueue()`), passado para
`montarTreinoAgendado(tp, atletasEmAtencao)`, que já usa esse set pra resolver `hasAlert`.

`CoachCalendarioDto.TreinoAgendado.hasPendingSuggestion` existe desde `add-coach-suggestion-inbox`
(arquivada 2026-06-19) e está **hardcoded `false`** em `montarTreinoAgendado`
(`CoachDashboardServiceImpl.java`, comentário "fonte: add-coach-suggestion-inbox (não entregue)").
O frontend (`CoachCalendarPage.tsx:114-124`) já lê esse campo e desenha um ponto
(`primary[500]`, `5px`, canto superior direito do card) — nunca recebeu `true`.

`CoachAtletaResumoDto` (roster) não tem campo equivalente.

`SugestaoCoachRepository` não tem nenhuma query agregada por atleta — só por id, por
(atleta+tipo+status) e por atleta único (top-3 do perfil).

## Goals / Non-Goals

**Goals:** roster e calendário mostram, sem clique, quais atletas têm sugestão `PENDING`; mesma
query resolvida uma vez por chamada, sem N+1; fecha o `hasPendingSuggestion` órfão do calendário.

**Non-Goals:** contagem; deep-link do indicador para a sugestão; reativar
`DashboardSuggestionsPanel`; notificação; qualquer mudança em `SugestaoCoach`/job gerador.

## Decisions

### D1. Uma query nova, no padrão de `atletasEmAtencao` — excluindo expiradas

**Achado do pre-mortem Codex (2026-09-23), confirmado no código:** `SugestaoCoachServiceImpl.
listar(PENDING)` filtra explicitamente `expiresAt` no passado (linhas 55-59) antes de devolver ao
`RecentSuggestionsPanel`. Uma query que olhasse só `status = 'PENDING'` acenderia o badge para uma
sugestão que o próprio inbox já esconde por estar vencida — contradiria CA2 (o atleta "sem
sugestão pendente" incluiria, na prática, sugestões `PENDING` mas expiradas).

```java
// SugestaoCoachRepository
/** IDs de atletas com SugestaoCoach PENDING e não expirada, no tenant — resolvido uma vez para
  * roster/calendário, mesmo padrão de CoachAttentionQueueServiceImpl (sem N+1). Mesma regra de
  * expiração de SugestaoCoachServiceImpl.listar(PENDING). */
@Query("""
   SELECT DISTINCT s.atleta.id FROM SugestaoCoach s
   WHERE s.tenantId = :tenantId AND s.status = :status
     AND (s.expiresAt IS NULL OR s.expiresAt > :agora)
   """)
Set<UUID> findAtletaIdsByTenantIdAndStatus(@Param("tenantId") UUID tenantId, @Param("status") StatusSugestao status,
                                            @Param("agora") Instant agora);
```

Sem `JOIN FETCH` — só o id é necessário, ao contrário de `findByTenantIdAndStatus` (usado no
`listar()` do inbox, que precisa do atleta completo para o DTO de saída). `agora` é capturado uma
vez por chamada (`Instant.now(clock)`, mesmo `Clock` injetado já usado no resto do serviço) —
nunca `Instant.now()` direto, para os testes poderem controlar o tempo.

### D2. Resolver uma vez por chamada de topo — não 3× dentro de `getDashboard()`

**Achado do pre-mortem Codex, confirmado no código:** `getDashboard()`
(`CoachDashboardServiceImpl.java:193-207`) chama `getRoster()`, depois `getInsights(...)` — que
**internamente chama `getRoster()` de novo** (`getInsights()`, comentário já existente "reusa
getRoster()... Aceitável") — e depois `getCalendarioSemanal(...)`. Uma versão ingênua desta
change, com `getRoster()` e `getCalendarioSemanal()` resolvendo o set cada um por conta própria,
rodaria a query nova **três vezes** na mesma requisição de `GET /api/v1/coach/dashboard` (usada
por `CoachInboxPage` via `useCoachDashboard`) — pior que o padrão já aceito de "roster resolvido
duas vezes" que existe hoje só para `cobranca`.

**Correção:** overload privado que recebe o set já resolvido, para `getDashboard()` reusar; as
versões públicas (chamadas pelos endpoints independentes `GET /atletas` e `GET /calendario`)
resolvem por conta própria como antes:

```java
public List<CoachAtletaResumoDto> getRoster() {
    UUID tenantId = TenantContext.getRequiredTenantId();
    return getRoster(tenantId, resolverAtletasComSugestaoPendente(tenantId));
}

private List<CoachAtletaResumoDto> getRoster(UUID tenantId, Set<UUID> atletasComSugestaoPendente) {
    // corpo atual de getRoster(), usando o parâmetro em vez de resolver localmente
}

public CoachCalendarioDto getCalendarioSemanal(LocalDate from) {
    UUID tenantId = TenantContext.getRequiredTenantId();
    return getCalendarioSemanal(from, resolverAtletasComSugestaoPendente(tenantId));
}

private CoachCalendarioDto getCalendarioSemanal(LocalDate from, Set<UUID> atletasComSugestaoPendente) {
    // corpo atual, passando atletasComSugestaoPendente para montarTreinoAgendado
}

private Set<UUID> resolverAtletasComSugestaoPendente(UUID tenantId) {
    return sugestaoCoachRepository.findAtletaIdsByTenantIdAndStatus(tenantId, StatusSugestao.PENDING, Instant.now(clock));
}
```

`getDashboard()` resolve uma vez e passa para os dois overloads privados:

```java
Set<UUID> atletasComSugestaoPendente = resolverAtletasComSugestaoPendente(tenantId);
List<CoachAtletaResumoDto> roster = getRoster(tenantId, atletasComSugestaoPendente).stream()...
...
CoachInsightsDto insights = getInsights(query.from(), query.to()); // ainda re-resolve via getRoster() sem args — 2ª vez, mesmo custo que cobranca já tem hoje
...
CoachCalendarioDto calendar = getCalendarioSemanal(query.weekFrom(), atletasComSugestaoPendente); // reusa, sem 3ª query
```

Resultado: no máximo **duas** resoluções por `getDashboard()` (a 2ª vem de `getInsights()` já
re-buscar o roster inteiro, débito pré-existente e aceito — não piora com esta change) em vez de
três. Corrigir a duplicação de `getInsights()` é debt pré-existente, fora do escopo desta change.

### D3. `montarTreinoAgendado` troca o literal `false` pelo set real

```java
private CoachCalendarioDto.TreinoAgendado montarTreinoAgendado(
        TreinoPlanejado tp, Set<UUID> atletasEmAtencao, Set<UUID> atletasComSugestaoPendente) {
    Atleta atleta = tp.getAtleta();
    boolean hasAlert = atleta != null && atletasEmAtencao.contains(atleta.getId());
    boolean hasPendingSuggestion = atleta != null && atletasComSugestaoPendente.contains(atleta.getId());
    return new CoachCalendarioDto.TreinoAgendado(..., hasAlert, hasPendingSuggestion);
}
```

Contrato JSON do `TreinoAgendado` não muda de forma (o campo já existe) — só o valor passa a ser
real. Não é uma migration de contrato para o front, que já consome o campo.

### D4. `CoachAtletaResumoDto` ganha `temSugestaoPendente` (boolean, não anulável)

Ao final do record (posição 12, depois de `nextDueDate`), seguindo a convenção de `hasAlert`/
`hasPendingSuggestion` — boolean sem `null`, ao contrário de `billingStatus` (que é `null` quando
não aplicável). Aqui "não aplicável" e "false" são a mesma coisa: um atleta sem sugestão pendente
é exatamente `false`, não há terceiro estado.

### D5. Frontend do roster: reaproveitar o ponto visual do calendário, em `AthleteNameCell`

`AthleteNameCell.tsx` já tem um padrão de indicador por linha (barra de cor + texto para "plano em
geração/concluído/erro", da change `plano-em-geracao-no-roster`). Para sugestão pendente, é um
sinal mais leve (não é um estado de processo, é "há algo novo para ver") — reaproveita o mesmo
ponto (`primary[500]`, `5px`, canto do avatar) que `CoachCalendarPage.tsx` já usa, em vez de
inventar uma terceira convenção visual ou usar `StatusBadge` (que é para status contínuo tipo
cobrança, não sinal pontual). Os dois indicadores (linha viva de geração de plano + ponto de
sugestão pendente) podem coexistir na mesma linha sem colidir visualmente — a barra de geração é
lateral, o ponto de sugestão é um badge pequeno sobre o avatar.

## Pre-mortem (2026-09-23, Codex adversarial review)

Dois achados de `needs-attention`, ambos verificados no código e incorporados:

1. **Query incluía sugestões expiradas** — `SugestaoCoachServiceImpl.listar(PENDING)` já filtra
   `expiresAt` no passado; a query nova precisa da mesma regra (D1) ou o badge acende para
   sugestão que o próprio inbox esconde.
2. **`getDashboard()` rodaria a query nova 3× na mesma requisição** — chama `getRoster()`,
   `getInsights()` (que rechama `getRoster()`) e `getCalendarioSemanal()`. Corrigido com overloads
   privados que recebem o set já resolvido (D2), reduzindo para 2× (mesmo custo que `cobranca` já
   tem hoje via `getInsights()`, não pior).

## Risks / Trade-offs

- **Duas queries agregadas por request** (`cobranca` + `atletasComSugestaoPendente` em
  `getRoster()`; `atletasEmAtencao` + `atletasComSugestaoPendente` em `getCalendarioSemanal()`) —
  aceito, ambas são `SELECT` simples com índice parcial já existente, volume por tenant é baixo.
- **`getRoster()` chamado dentro de `getInsights()`** (comentário existente: "reusa getRoster()
  (...) Aceitável para o roster de um tenant") — o custo desta change se propaga para lá também,
  mesmo trade-off já aceito no código.

## Migration Plan

1. Backend: query no repository + wiring nos dois métodos + campo no DTO + testes. PR backend →
   develop.
2. Front: campo no tipo `CoachAtletaResumo`/`AthleteRow` + indicador em `AthleteNameCell` + teste.
   Calendário não muda (já pronto). PR front → develop.

## Open Questions

- Nenhuma além das registradas no proposal.

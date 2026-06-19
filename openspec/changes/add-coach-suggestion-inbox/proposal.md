# Proposal: add-coach-suggestion-inbox

**Tamanho:** M · **Trilha:** Full

## Status

Refinada (2026-06-19) — revisão product-lens + assumptions + pre-mortem foldados

## Why

O shell do coach abre no **inbox** (`/coach/inbox`): uma fila de sugestões geradas por IA que o coach
revisa, aprova ou rejeita. Hoje não existe persistência desse workflow de aprovação. Os sinais de risco
existem na `add-coach-attention-queue` (✅ em `develop`), mas a fila de atenção é priorização —
não um item acionável com estado (`pending`/`approved`/`rejected`) e rationale que o coach despacha.
Esta change introduz essa camada de workflow: a IA propõe, o treinador decide, o sistema registra.

## Non-goals (v1)

- **Efeito automático de geração/ajuste de plano:** aprovar uma sugestão NÃO dispara automaticamente
  `IaServiceImpl.gerarPlanoTreino()`. Aprovação = step de workflow (registra intenção + histórico).
  O efeito real por tipo será implementado em change subsequente com preview intermediário.
- **Visibilidade ao atleta:** sugestões não são expostas ao atleta antes de ação do coach.
- **Notificações push:** sem notificação de novas sugestões nesta change.
- **Edição de conteúdo antes de aprovar:** coach aprova ou rejeita; não edita o texto da sugestão.
- **Sugestões geradas por LLM:** a geração é determinística (baseada nos sinais da attention-queue),
  sem nova chamada ao modelo nesta change.
- **Paginação:** lista retorna sem paginação; o cap da attention-queue (N=20 atletas) garante volume
  controlado em v1.
- **Endpoint de contagem separado:** `GET /sugestoes` retorna lista completa; contagem via `.length`.

## What Changes

### Backend

- Nova entidade `SugestaoCoach`: `tipo` (VARCHAR: `plan_adjust`/`recovery`/`new_plan`),
  `status` (VARCHAR DEFAULT `'pending'`), `confidence` (VARCHAR: `HIGH`/`MEDIUM`/`LOW`),
  `summary` (TEXT — cópia do `suggestedAction` do sinal), `reasoning` (JSONB —
  `RecommendationExplanation` serializado), `atletaId`, `tenantId`, `createdAt`, `reviewedAt`,
  `expiresAt` + migration `V36__Create_tb_sugestao_coach.sql`.
- `@Scheduled` job diário (6h): itera tenants ativos, computa fila de atenção por tenant,
  converte sinais elegíveis em `SugestaoCoach pending` (idempotente via UNIQUE partial index).
- Mapeamento `MotivoAtencao` → `TipoSugestao`:
  - `FADIGA`, `SOBRECARGA`, `INATIVIDADE` → `recovery`
  - `SEM_PLANO` → `new_plan`
  - `ADERENCIA`, `ZONAS_VENCIDAS` → `plan_adjust`
- Endpoints (`@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`):
  - `GET /api/v1/coach/sugestoes?status=` — lista filtrável por status (excl. expiradas se pending).
  - `GET /api/v1/coach/sugestoes/{id}` — detalhe com reasoning.
  - `POST /api/v1/coach/sugestoes/{id}/aprovar` — `pending→approved` (idempotente; sem efeito de plano em v1).
  - `POST /api/v1/coach/sugestoes/{id}/rejeitar` — `pending→rejected` (idempotente).
- DTOs: `SugestaoCoachOutputDto` (record), `SugestaoTipoEnum`, `SugestaoStatusEnum`.

### Frontend

- `SugestaoCoachOutputDto` TypeScript type + enums `SugestaoTipo`/`SugestaoStatus`.
- `SugestaoService.ts` (curado à mão): `listar(status?)`, `aprovar(id)`, `rejeitar(id)`.
- Hook `useCoachSugestoes`: `useState` + `useCallback`, lista sugestões com loading/error.
- `CoachInboxPage.tsx`: layout 2-painéis (lista esq. / detalhe+ações dir.); estados loading, empty,
  erro, e seleção.
- Rota `/coach/inbox` → `CoachInboxPage` (substitui `CoachAttentionQueuePage`, que permanece no
  código sem rota — receberá rota própria em change futura).

## Capabilities

### ADDED Capabilities

- `coach-suggestion-inbox`: persistência e workflow de aprovação/rejeição de sugestões de IA.

## Impact

- **Depende de:** `add-coach-attention-queue` ✅ e `add-recommendation-explainability` ✅ (ambas
  em `develop`). `wire-coach-identity-and-attention-queue` ✅ (shell frontend pronto).
- **Repos afetados:** `menthoros-backend` (migration + 5 seções) + `menthoros-front` (3 seções).
- **Migration Flyway:** `V36__Create_tb_sugestao_coach.sql`.
- **Novos arquivos backend:** `entity/SugestaoCoach.java`, `enums/TipoSugestao.java`,
  `enums/StatusSugestao.java`, `SugestaoCoachRepository`, `SugestaoCoachService`/Impl,
  `CoachSugestaoController`, DTOs `SugestaoCoachOutputDto`, mapper, job `SugestaoCoachGeneratorJob`.
- **Novos arquivos frontend:** `src/types/SugestaoCoach.ts`, `src/api/services/SugestaoService.ts`,
  `src/hooks/useCoachSugestoes.ts` + test, `src/features/coach/pages/CoachInboxPage.tsx`.
- **`GlobalExceptionHandler`:** `DomainRuleViolationException` handler **já existe** (409 deve ser
  verificado ou adicionado como status code explícito).
- **`TenantValidationRepository`:** deve incluir `SugestaoCoachRepository` para que `@RequireTenant`
  funcione nos endpoints com `{id}`.

## Critérios de aceite

- **CA1 — Geração idempotente:** dado o mesmo sinal ativo, o job não cria duplicatas
  `pending` para o mesmo `(atletaId, tipo)`. *Given* job roda duas vezes com mesmo estado da fila;
  *When* segunda execução; *Then* zero registros adicionais inseridos.
- **CA2 — Listagem tenant-safe:** `GET /sugestoes?status=pending` retorna apenas sugestões do tenant
  do JWT; outro tenant não vê os dados. *Then* cross-tenant query retorna lista vazia.
- **CA3 — Detalhe com reasoning:** `GET /sugestoes/{id}` retorna `reasoning.rationale` preenchido
  (PT-BR), `sourceRules` não vazio, `confidence` HIGH/MEDIUM/LOW.
- **CA4 — Aprovar registra e é idempotente:** `POST /{id}/aprovar` com sugestão `pending` → 200
  com `status=approved`, `reviewedAt` preenchido. Segundo POST → 200 sem duplicar efeito.
- **CA5 — Rejeitar registra e é idempotente:** `POST /{id}/rejeitar` → 200 com `status=rejected`.
  Segundo POST → no-op.
- **CA6 — Transição ilegal rejeitada:** `POST /{id}/aprovar` em sugestão já `rejected` → 409.
- **CA7 — Expiração:** sugestões `pending` com `expires_at` no passado não aparecem na listagem
  `?status=pending`.
- **CA8 — Frontend exibe lista e detalhe:** inbox carrega sugestões pendentes, exibe detalhe ao
  selecionar item, e botões aprovar/rejeitar atualizam status sem reload de página.

## Open Questions & Assumptions

### Resolvidas

- **Mapeamento sinal→tipo:** definido na spec (FADIGA/SOBRECARGA/INATIVIDADE→recovery;
  SEM_PLANO→new_plan; ADERENCIA/ZONAS_VENCIDAS→plan_adjust).
- **Efeito de aprovar em v1:** stub (step de workflow); sem chamada ao `IaServiceImpl`.
- **`plan_adjust` sem contrato no `PlanoService`:** adiado; v1 não executa efeito de plano.
- **`recovery` sem destino persistido:** adiado; v1 não executa efeito de recuperação.
- **Migration:** V36 (V35 já existe).
- **`confidence`:** VARCHAR HIGH/MEDIUM/LOW mapeado de Severidade do sinal de atenção.
- **`summary`:** cópia do campo `suggestedAction` do `CoachAttentionItemOutputDto`.
- **Trigger:** `@Scheduled` job (não `ApplicationEventListener`); itera tenants explicitamente.
- **TenantContext em async:** job recebe `tenantId` via loop explícito, não via ThreadLocal herdado.

### Em aberto (pré-implementação)

- **Threshold de `confidence` mínimo:** qual severidade mínima gera sugestão? Proposta: apenas
  `CRITICA` e `ALTA` (equivalente a HIGH+MEDIUM); `MEDIA` descartada no v1. Confirmar antes de
  implementar a task 2.1.
- **Frequência do job:** diário às 6h é suficiente ou deve ser 2×/dia? Ajustar em função do SLA
  esperado de "sugestão disponível para revisão".
- **Badge count do sidebar:** hoje mostra attention-queue count; v1 mantém assim (follow-up para
  exibir pending suggestions count quando o endpoint de contagem existir).

## Métrica de sucesso

- **Métrica primária:** ≥ 70% das sugestões `pending` revisadas (aprovadas OU rejeitadas) dentro
  de 24h da criação, medido após 2 semanas de uso real com coaches.
- **Proxy:** count de sugestões com `reviewed_at IS NOT NULL` / total, agrupado por coach tenant.

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Efeito silencioso futuro (ao ativar plan_adjust/new_plan): sugestão `approved` mas plano não gerado | Alta | Adicionar `effect_status VARCHAR NULL` antes de ativar efeitos reais; o job retenta `effect_failed` |
| Race condition na aprovação dupla simultânea | Média | `UPDATE ... WHERE status='pending'` atômico; verificar `rowsAffected==1` antes de prosseguir |
| ThreadLocal de TenantContext vazar em async | Alta | Job itera tenants com `try { TenantContext.set(tenantId); ... } finally { TenantContext.clear(); }` |
| Inbox inundado no deploy inicial (backfill histórico) | Alta | Job processa apenas sinais com `generated_at >= NOW() - INTERVAL '7 days'`; sugestões expiram em 7 dias |
| Reasoning nulo na primeira semana | Alta | Campo `summary` sempre preenchido do `suggestedAction`; `reasoning` mínimo gerado localmente do sinal |
| Sugestão `plan_adjust`/`new_plan` sem feedback de resultado (v2+) | Alta | Documentado como non-goal de v1; ativar efeitos somente com `effect_status` + preview intermediário |

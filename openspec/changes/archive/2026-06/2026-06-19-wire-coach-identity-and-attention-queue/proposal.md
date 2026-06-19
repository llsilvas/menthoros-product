# wire-coach-identity-and-attention-queue

**Tamanho:** S · **Trilha:** Fast

## Problema

O shell do coach tem dois pontos de identidade e de ação completamente mockados:

1. **Identidade (`CoachLayout.tsx`):** `mockCoach` e `mockTenant` são constantes hardcoded em vez de dados reais do backend. O treinador vê "Coach / Assessoria Piloto" em vez de seu nome real e o nome da sua assessoria.

2. **Fila de atenção (Inbox):** `CoachInboxPage.tsx` exibe `MOCK_SUGGESTIONS` — dados de sugestões fictícias — enquanto o backend entrega `GET /api/v1/coach/attention-queue` com sinais reais de atletas que precisam de atenção. O endpoint existe, está funcional e retorna `explanation.rationale` por sinal. O frontend nunca o chama.

3. **Badge do Inbox:** `inboxBadgeCount` do `CoachSidebar` é sempre 0 (hardcoded no layout) — o treinador nunca vê quantos atletas precisam de atenção sem clicar na tela.

Enquanto isso estiver mockado, o coach abre a shell e vê dados fictícios — sem valor operacional, sem feedback de UX real.

## Solução

Ligar o frontend aos dois endpoints que já existem no backend:

- **`GET /api/v1/users/me`** → identidade real do coach (nome, id, tenant, assessoria)
- **`GET /api/v1/coach/attention-queue`** → fila real de atletas que precisam de atenção

Com isso:
1. `CoachLayout` carrega `useCurrentUser()` e passa nome + tenant reais para `CoachSidebar`.
2. `CoachInboxPage.tsx` é substituída por `CoachAttentionQueuePage.tsx` — lista os itens reais da fila, exibindo severidade, motivo, ação sugerida, evidências e `explanation.rationale`.
3. `inboxBadgeCount` recebe o count real da fila (quantos atletas ≥ ALTA em atenção).
4. `hasPendingSuggestion` no calendário semanal já flui do backend via `TreinoAgendado.hasPendingSuggestion` — confirmar e documentar.

## Escopo

**Incluso:**
- `src/api/services/UsuarioService.ts` (novo, manual) — `getMe()`
- `src/types/Usuario.ts` (novo) — `UsuarioMeOutputDto`
- `src/types/Coach.ts` (adição) — `CoachAttentionItem`, `RecommendationExplanation`
- `CoachDashboardService.ts` (adição) — `getAttentionQueue()`
- `src/hooks/useCurrentUser.ts` (novo) — chama `getMe()`, retorna coach + tenant
- `CoachLayout.tsx` — substituir `mockCoach`/`mockTenant` por `useCurrentUser()`; passar `inboxBadgeCount` real
- `CoachAttentionQueuePage.tsx` (novo) — page wired ao endpoint real
- Rota `/coach/inbox` → aponta para `CoachAttentionQueuePage`
- `api/index.ts` — exportar `UsuarioService`

**Fora de escopo:**
- Workflow de aprovação/rejeição de sugestões IA (`add-coach-suggestion-inbox`)
- Nenhum novo endpoint de backend
- Nenhum novo componente genérico de design system
- Substituição do design de `CoachInboxPage.tsx` (será reescrita em `add-coach-suggestion-inbox`)

## Critérios de aceite

**CA1 — Identidade real:**
- *Dado* que o coach está autenticado e `GET /api/v1/users/me` retorna `{ nomeCompleto, tenant.nome }`
- *Quando* o shell carrega
- *Então* `CoachSidebar` exibe o nome real do coach e o nome real da assessoria (não "Coach" / "Assessoria Piloto")

**CA2 — Fila de atenção real:**
- *Dado* que `GET /api/v1/coach/attention-queue` retorna ≥ 1 item
- *Quando* o coach clica em "Inbox" na sidebar
- *Então* a página exibe cada item com `athleteName`, `severity`, `primaryReason`, `suggestedAction` e `explanation.rationale`

**CA3 — Estado vazio:**
- *Dado* que a fila está vazia
- *Quando* o coach clica em "Inbox"
- *Então* a página exibe estado vazio ("Todos os atletas em dia")

**CA4 — Badge com count real:**
- *Dado* que a fila tem N itens
- *Quando* o layout carrega
- *Então* o badge "Inbox" na sidebar exibe N (desaparece quando N = 0)

**CA5 — Estado de loading e erro:**
- *Dado* que a requisição está em andamento
- *Então* um estado de loading visível (skeleton ou spinner) é exibido
- *Dado* que a requisição falha
- *Então* uma mensagem de erro não-quebra a página

## Métricas de sucesso

- **Eliminação de dados falsos:** 0 constantes `mock*` / `MOCK_*` ativas no shell do coach após a change.
- **Tempo para ver o primeiro alerta real:** o coach vê a fila de atenção real no primeiro load (< 1s com backend local).

## Open Questions & Assumptions

| # | Premissa/Questão | Status |
|---|---|---|
| A1 | `GET /api/v1/users/me` já retorna `{ nomeCompleto, tenant.nome, tenant.id }` — verificado no `UsuarioMeOutputDto` do backend | Confirmado |
| A2 | `GET /api/v1/coach/attention-queue` retorna `explanation.rationale` por item | Confirmado (entregue em `add-recommendation-explainability`) |
| A3 | `hasPendingSuggestion` no DTO do calendário já flui via `TreinoAgendado` — a change apenas confirma/documenta, não altera | Confirmado (calendarAdapter.ts:38 já lê `t.hasPendingSuggestion`) |
| A4 | O `CoachInboxPage.tsx` atual (mock de suggestions) é substituído. O arquivo será reescrito em `add-coach-suggestion-inbox`. | Decisão tomada |
| A5 | O cliente curado `src/api` é mantido à mão — `UsuarioService.ts` entra manualmente (não via `generate:api`). | Confirmado (CLAUDE.md do front) |

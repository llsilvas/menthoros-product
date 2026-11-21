# PRD — Coach Inbox

Change-id: add-coach-inbox
Owner: Product / Hermes (draft)
Status: Entregue — fechado em 2026-11-20 (o texto abaixo do §0 é a especificação original de 2026-07-01)

0. Estado real (2026-11-20)

O que este PRD pedia foi entregue por uma sequência de changes, sem que a change `add-coach-inbox`
tenha existido com esse nome. O PRD é encerrado; trabalho novo no inbox entra como change própria.

| Pedido do PRD | Entregue por |
|---|---|
| Lista priorizada de itens que pedem atenção | `add-coach-attention-queue` (2026-06-18), `inbox-lista-triagem` e `inbox-proximo-em-atencao` (2026-11-07); spec `coach-inbox-triage` |
| Sugestões e rascunhos no mesmo lugar | `add-coach-suggestion-inbox` (2026-06-19), `consolidate-coach-inbox-tabs` (2026-06-26) |
| Justificativa explicável | `add-recommendation-explainability` (2026-06-19) |
| Aprovar / editar / rejeitar | `coach-plan-review-workflow` (2026-06-20), `add-coach-suggestion-review-actions` (2026-09-27) |
| Auditoria (ator, instante, antes/depois) | `add-coach-suggestion-decision-audit` (2026-10-09), `add-coach-suggestion-edit-delta` (2026-10-22); spec `coach-suggestion-decision-audit` |
| Nada chega ao atleta sem aprovação | Vigente desde a jornada v1 |

Não entregue e não verificado contra o código: as ações **Adiar** e **Delegar** do §6, e as
métricas do §3 e do §13 (tempo até identificar o atleta, aprovação em 24h), que nunca foram
instrumentadas. A medição passa a ser a do North Star (`knowledge/product/north-star.md`).

Em aberto no inbox, fora deste PRD: `coach-inbox-notebook-height` (8/27) e
`refine-inbox-mobile-breakpoint` (0/5, parada desde 2026-08-16).

1. Contexto
Coaches hoje recebem sinais de atenção espalhados entre dashboards, mensagens e planilhas. A Coach Inbox centraliza alertas, sugestões e rascunhos de plano num único lugar para priorizar, revisar, editar e aprovar ações.

2. Problema
Sinais importantes ficam perdidos ou atrasados; coaches gastam tempo triando fontes em vez de decidir.

3. Objetivos (sucesso)
- Reduzir tempo médio para identificar atleta que precisa de atenção em ≥30%.
- Aumentar intervenções aprovadas em ≤24h para ≥70%.
- Garantir explicabilidade das sugestões.

4. Não objetivos
- Não habilitar auto‑publish ao atleta.
- Não integrar RAG nesta iteração.

5. Personas
- Coach (primário).
- PM / Ops (secundário).

6. Proposta (visão)
Tela "Coach Inbox" que lista itens priorizados; cada item abre um drawer com contexto mínimo, justificativa explicável, rascunho editável e ações: Aprovar / Editar / Adiar / Delegar.

7. Requisitos (MVP)
- UI: /inbox com lista paginada (prioridade, atleta, motivo curto, horário).
- Item detail: últimos 7 dias resumo, explicação (1–3 motivos), rascunho editável.
- Backend endpoints: GET /api/v1/coach-inbox, GET /api/v1/coach-inbox/{id}, POST /api/v1/coach-inbox/{id}/approve.
- Audit: persistir actor, timestamp, reason, before/after.
- Priority scoring: regra simples (TSB drop + treino perdido + flags).

8. Critérios de aceite
- Item aparece quando regra detecta TSB em queda e treino perdido.
- Aprovar persiste evento de auditoria e altera estado para approved.
- Itens aprovados não são publicados automaticamente.

9. Constraints
- Respeitar tenant_id (TenantContext).
- Endpoints autenticados via Keycloak JWT.
- IA externa com timeout/retries conforme integrations.md.

10. MVP scope
- Migration Flyway para tb_coach_inbox_item.
- Backend endpoints e índices para performance.
- Frontend list + drawer + approve flow.
- Logs de auditoria.

11. Dependências
- Flyway migration.
- Keycloak disponível.

12. Rollout
- Feature flag por tenant; beta com 2–3 coaches.

13. Métricas
- Time-to-intervention, approval rate 24h, items/coach/day, false positives.

14. Riscos
- Volume alto de falsos positivos; latência LLM; vazamento tenant.

Last reviewed: 2026-11-20

# PRD — Coach Inbox

Change-id: add-coach-inbox
Owner: Product / Hermes (draft)
Status: Draft

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

Last reviewed: 2026-07-01

# Proposal: add-coach-suggestion-inbox

## Status

Proposed

## Why

O shell do coach abre no **inbox** (`/coach/inbox`): uma fila de sugestões geradas por IA que o coach
revisa, aprova ou rejeita (ajuste de plano, recuperação, novo plano). Hoje não existe persistência
desse workflow de aprovação. Os sinais de risco existem (ou existirão) na `add-coach-attention-queue`,
mas a fila de atenção é priorização — não um item acionável com estado (`pending`/`approved`/
`rejected`) e rationale que o coach despacha. Esta change introduz essa camada de workflow.

## What Changes

- Nova entidade `SugestaoCoach`: `tipo` (`plan_adjust`/`recovery`/`new_plan`), `confidence`,
  `status` (`pending`/`approved`/`rejected`), `summary`, `reasoning`, `atletaId`, `createdAt`,
  `reviewedAt` + migration `tb_sugestao_coach`.
- Endpoints (`@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, `@RequireTenant`):
  - `GET /api/v1/coach/sugestoes?status=` — lista filtrável por status.
  - `GET /api/v1/coach/sugestoes/{id}` — detalhe com rationale.
  - `POST /api/v1/coach/sugestoes/{id}/aprovar` — aprova e dispara o efeito do tipo.
  - `POST /api/v1/coach/sugestoes/{id}/rejeitar` — rejeita.
- DTOs `SugestaoCoachOutputDto` (record). Geração das sugestões e efeito de "aprovar" detalhados em
  `design.md`.

## Capabilities

### ADDED Capabilities

- `coach-suggestion-inbox`: persistência e workflow de aprovação de sugestões de IA do coach.

## Impact

- **Depende de (por id):** `add-current-user-endpoint` (#1) — identidade/autorização;
  `add-coach-attention-queue` (externa) — sinais de origem; `add-recommendation-explainability`
  (externa) — estrutura de rationale consumida no detalhe.
- **Reusa:** `add-recommendation-explainability` para o `reasoning`; reaproveita a infra de geração de
  plano para o efeito de "aprovar" (ex.: regenerar plano).
- **Arquivos de produção (trabalho futuro):** `entity/SugestaoCoach.java`, `SugestaoCoachRepository`,
  `SugestaoCoachService`/impl, `CoachSugestaoController`, DTOs, mapper (null-check), migration
  `tb_sugestao_coach`. Novos `@ExceptionHandler` se novas exceções forem criadas.
- **Migração Flyway:** `tb_sugestao_coach` (próxima versão livre, ≥ V35).

# add-coach-suggestion-decision-audit — A decisão do coach fica auditada (quem) e a rejeição registra o porquê

**Tamanho:** S · **Trilha:** Full

> Full porque muda o contrato de API (campos novos no DTO de saída + parâmetro opcional no
> `rejeitar`) e altera schema (migration aditiva em `tb_sugestao_coach`). Escopo pequeno, mas
> mexe em contrato e banco — não é Fast.

## Why

A bússola (guardrail de autoridade) exige: *"No suggestion reaches the athlete without explicit
coach approval. **Every approval is audit-logged**."* Hoje o `SugestaoCoach` só grava `reviewedAt`
(quando) — **não grava `reviewedBy` (quem)**. Sem ator, a trilha é incompleta: não dá para saber
qual técnico (de uma assessoria com mais de um) decidiu. É o mesmo gap de auditoria que o compass
manda fechar, e custa uma coluna + um set no service.

O guardrail de economia define o log de decisão como *"accepted / edited / rejected + diff"* — e o
lado **"rejected"** hoje não guarda o **porquê**: `rejeitar()` só troca `status` para `REJECTED`.
Sem o motivo, o dado de moat que o `add-coach-suggestion-edit-delta` quer capturar (o coach rejeita
só por redação, ou por mérito?) fica invisível — é exatamente o sinal que o `product-reviewer`
apontou como a evidência mais barata de que a edição é necessária.

## What Changes

### Backend (`apps/menthoros-backend`)

1. **Entidade `SugestaoCoach`** ganha 2 campos: `reviewedBy` (UUID, nullable — técnico que decidiu)
   e `motivoRejeicao` (TEXT, nullable — texto livre do porquê da rejeição).
2. **Migration aditiva** (depende da migration do `add-coach-suggestion-edit-delta`): colunas
   `reviewed_by uuid NULL` e `motivo_rejeicao text NULL` em `tb_sugestao_coach`. Expand-only, sem
   backfill (linhas legadas ficam com `reviewed_by` nulo — predatam a auditoria).
3. **`SugestaoCoachServiceImpl`**:
   - `aprovar`/`rejeitar` gravam `reviewedBy` resolvido **do security context** (JWT/Keycloak),
     nunca do corpo — auditoria não forjável.
   - `rejeitar(id, motivoRejeicao?)` passa a aceitar o motivo opcional e grava `motivoRejeicao`.
   - `aprovar` limpa `motivoRejeicao` (não faz sentido manter motivo numa sugestão aprovada — a
     decisão final é aprovar).
4. **`SugestaoCoachOutputDto`** ganha `reviewedBy` e `motivoRejeicao` (aditivos,
   `@JsonInclude(NON_NULL)` já presente). `CoachSugestaoController.rejeitar` aceita
   `@RequestBody(required=false)` com `{ motivoRejeicao }`.

### Frontend (`apps/menthoros-front`)

5. `SugestaoService.rejeitar(id, motivoRejeicao?)` envia o corpo opcional; ao rejeitar, o
   `CoachDialog` (de `RecentSuggestionsPanel.tsx`, já com Aprovar/Rejeitar de
   `add-coach-suggestion-review-actions`) pede um motivo opcional (textarea, `maxLength={500}`).
   Quando `status !== 'PENDING'`, o dialog mostra quem decidiu (`reviewedBy`) e, se rejeitada, o
   motivo.

## Fora do escopo

- Editar `summary`/`tipo`/`confidence`/`reasoningJson` — é `add-coach-suggestion-edit-delta`.
- Histórico de múltiplas rejeições, ou reabrir sugestão rejeitada.
- Notificar o atleta de qualquer decisão (coach-in-the-loop: a decisão nunca alcança o atleta aqui).

## Dependências e ordem

- Depende de `add-coach-suggestion-edit-delta` (a migration dela já mexeu em `tb_sugestao_coach`;
  esta adiciona 2 colunas a mais, e o `versaoEsperada` dela já está em `aprovar`/`rejeitar`).
- Backend mergeia antes do front.

## Critérios de aceite

1. **Given** um técnico aprova uma sugestão PENDING, **when** `POST .../aprovar`, **then**
   `reviewedBy` = id do técnico autenticado (nunca do corpo), `motivoRejeicao = null`.
2. **Given** um técnico rejeita com `{ "motivoRejeicao": "volume alto demais para a semana" }`,
   **when** `POST .../rejeitar`, **then** `motivoRejeicao` gravado e `reviewedBy` preenchido.
3. **Given** um técnico rejeita **sem** corpo, **when** `POST .../rejeitar`, **then** `reviewedBy`
   preenchido e `motivoRejeicao = null` (motivo é opcional).
4. **Given** um corpo tentando forjar `reviewedBy`, **when** `POST .../aprovar`, **then**
   `reviewedBy` gravado é o do token autenticado, não o do corpo.
5. **Given** uma sugestão já decidida, **when** o coach abre o dialog, **then** vê quem decidiu
   (`reviewedBy`) e, se `REJECTED`, o `motivoRejeicao`.

## Métrica de sucesso

- Toda decisão grava **quem** decidiu (auditoria completa: quando + quem + por quê na rejeição).
- A distribuição dos `motivoRejeicao` (redação vs. mérito) vira o dado que valida a necessidade do
  `edit-delta` — mesmo objetivo apontado pelo `product-reviewer`.

## Open Questions & Assumptions

- **O1 — Motivo é texto livre.** Assumo classificação futura (enum) quando houver volume; v1 é
  texto livre com `@Size(max = 500)`.
- **O2 — `reviewedBy` legado nulo.** Linhas decididas antes desta change ficam sem ator (aceito).

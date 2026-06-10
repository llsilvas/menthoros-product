# Design: add-coach-suggestion-inbox

## Problema

O inbox do coach precisa de itens acionáveis e persistentes, distintos da fila de priorização da
`add-coach-attention-queue`. Duas decisões em aberto: (1) como as sugestões são geradas/populadas e
(2) qual o efeito de "aprovar".

## Decisão 1 — Origem das sugestões

**Escolhido:** derivar de gatilhos, não gerar sob demanda na leitura do inbox.

- A `add-coach-attention-queue` produz sinais de risco/atenção por atleta. Um processo (listener de
  evento ou job agendado) converte sinais elegíveis em `SugestaoCoach` com `status=pending`,
  preenchendo `tipo`, `confidence`, `summary` e `reasoning` (este último via
  `add-recommendation-explainability`).
- O inbox apenas **lê** sugestões persistidas — `GET` não dispara IA (mantém o endpoint idempotente e
  barato). A geração é assíncrona e fora do caminho de request.
- Idempotência da geração: no máximo uma sugestão `pending` por `(atletaId, tipo)` ativo — reprocessar
  o mesmo sinal não cria duplicatas.

> Distinção da attention-queue: a fila prioriza/observa; o inbox materializa um item com estado de
> workflow (`pending`→`approved`/`rejected`) e histórico (`reviewedAt`).

## Decisão 2 — Efeito de "aprovar" por tipo

`POST /aprovar` transiciona `pending → approved` (idempotente: aprovar já-aprovada é no-op) e dispara
o efeito conforme o `tipo`:

- `plan_adjust` → aciona o ajuste do plano vigente do atleta (reusa a infra de geração/edição de
  plano existente).
- `new_plan` → aciona a geração de um novo plano para o atleta.
- `recovery` → registra a recomendação de recuperação (ajuste de carga/descanso) no fluxo do atleta.

`POST /rejeitar` transiciona `pending → rejected` (idempotente) e não produz efeito de plano.

Transições ilegais (`approved → rejected`, `rejected → approved`) SHALL ser rejeitadas com erro de
regra de domínio. O efeito de plano roda após o commit da transição de status, para não corromper o
estado se a regeneração falhar (a sugestão permanece `approved`; falha de efeito é logada e
re-tentável).

## Modelo de dados (`tb_sugestao_coach`)

- `id UUID PK DEFAULT gen_random_uuid()`
- `tenant_id UUID NOT NULL`
- `atleta_id UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE`
- `tipo VARCHAR NOT NULL` (`plan_adjust`/`recovery`/`new_plan`)
- `status VARCHAR NOT NULL DEFAULT 'pending'` (`pending`/`approved`/`rejected`)
- `confidence NUMERIC` , `summary TEXT`, `reasoning JSONB`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `reviewed_at TIMESTAMPTZ NULL`
- índices: `idx_sugestao_coach_atleta`, composto `(tenant_id, status)`.

## Alternativas consideradas

- **Gerar sugestões sob demanda no GET:** rejeitado — torna a leitura cara/não-idempotente e acopla o
  inbox ao tempo de resposta da IA.
- **Reusar a própria attention-queue como inbox:** rejeitado — mistura priorização efêmera com
  workflow de aprovação persistente.

# Design: add-coach-suggestion-inbox

> Atualizado em 2026-06-19 com decisões do ciclo Full-track (product-reviewer + assumptions + pre-mortem).
> Corrigido em 2026-06-19 após gate DoR (spec-reviewer): método real do serviço, query de tenants, status HTTP de transição ilegal.

## Problema

O inbox do coach precisa de itens acionáveis e persistentes, distintos da fila de priorização da
`add-coach-attention-queue`. Quatro decisões em aberto foram resolvidas neste ciclo.

---

## Decisão 1 — Origem das sugestões: gatilho, não on-demand

**Escolhido:** `@Scheduled` job diário que converte sinais elegíveis em `SugestaoCoach pending`.

- A `CoachAttentionQueueServiceImpl` produz sinais de risco por atleta. O job (6h UTC) seta o
  `TenantContext` para cada tenant e chama `CoachAttentionQueueService.getAttentionQueue()` (sem
  parâmetro — a interface real não recebe `tenantId`; resolve via `TenantContext` internamente).
- O `GET /sugestoes` apenas lê persistência — não dispara IA. Leitura barata e idempotente.
- **`@Scheduled` escolhido sobre listener** porque: (a) `CoachAttentionQueueService` é
  read-only e não publica eventos; (b) o job precisa iterar todos os tenants
  explicitamente, o que é mais claro como job do que como listener.

### Mapeamento `MotivoAtencao` → `TipoSugestao`

| MotivoAtencao | TipoSugestao | Rationale |
|---|---|---|
| `FADIGA` | `recovery` | Atleta com TSB negativo extremo — sugerir descanso/redução de carga |
| `SOBRECARGA` | `recovery` | Carga ATL > CTL threshold — sugerir recuperação |
| `INATIVIDADE` | `recovery` | Atleta inativo — sugerir protocolo de retorno gradual |
| `SEM_PLANO` | `new_plan` | Atleta sem plano vigente — sugerir geração de plano |
| `ADERENCIA` | `plan_adjust` | Plano não está sendo seguido — sugerir revisão de aderência |
| `ZONAS_VENCIDAS` | `plan_adjust` | Zonas de treinamento desatualizadas — sugerir reavaliação |

Somente sinais com `Severidade in (CRITICA, ALTA)` geram sugestão em v1. `MEDIA` é descartada.
**Decisão ratificada** — não é mais um ponto em aberto.

### TenantContext em contexto assíncrono

O job itera tenants sem depender de `ThreadLocal` herdado:

```java
// assessoriaRepository.findByAtivoTrue() existe em develop — mapeia para UUID sem método novo
List<UUID> tenantIds = assessoriaRepository.findByAtivoTrue()
    .stream().map(Assessoria::getId).toList();

for (UUID tenantId : tenantIds) {
    try {
        TenantContext.setTenantId(tenantId);
        gerarSugestoesPorTenant();   // usa getAttentionQueue() internamente (sem parâmetro)
    } finally {
        TenantContext.clear();
    }
}
```

---

## Decisão 2 — Efeito de "aprovar" em v1: workflow step somente

**Escolhido:** aprovar transiciona `pending → approved` e registra `reviewedAt`. Nenhum efeito
automático de plano é disparado no v1.

**Motivação:** o efeito automático de `plan_adjust`/`new_plan` criaria dois problemas antes que
exista um fluxo de confirmação intermediário: (1) plano alterado imediatamente sem preview do
coach; (2) timeout do `IaServiceImpl` bloquearia a thread do request com retry implícito.

Roadmap para v2 (change subsequente):
- Adicionar coluna `effect_status VARCHAR NULL` (`pending_effect`/`effect_ok`/`effect_failed`).
- `POST /aprovar` retorna 200 imediatamente; efeito de plano dispara via `@Async` / evento.
- Frontend exibe indicador "processando" enquanto `effect_status != effect_ok`.

`POST /rejeitar` transiciona `pending → rejected`. Sem efeito de plano em qualquer versão.

Transições ilegais (`approved → rejected`, `rejected → approved`) lançam `DomainRuleViolationException`
→ **422 Unprocessable Entity** (handler existente em `GlobalExceptionHandler` retorna 422 — não 409;
`@ApiResponses` dos endpoints de aprovação/rejeição devem declarar 422, não 409).

Aprovar novamente uma sugestão já `approved` → **no-op** (idempotente): verificar `rowsAffected == 1`
após `UPDATE ... WHERE status = 'pending'` para evitar race condition em aprovação dupla.

---

## Decisão 3 — Idempotência real via constraint no banco

**Escolhido:** UNIQUE partial index no PostgreSQL.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uk_sugestao_pending
    ON tb_sugestao_coach(atleta_id, tipo)
    WHERE status = 'pending';
```

Quando a sugestão é aprovada/rejeitada, o índice parcial deixa de cobrir a linha, permitindo
nova `pending` para o mesmo `(atleta_id, tipo)` no próximo ciclo do job.

O service captura `DataIntegrityViolationException` do INSERT duplicado e ignora silenciosamente
(idempotência real mesmo sob concorrência).

---

## Decisão 4 — Modelo de dados (`tb_sugestao_coach`)

```sql
CREATE TABLE IF NOT EXISTS tb_sugestao_coach (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    atleta_id   UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
    tipo        VARCHAR NOT NULL,   -- plan_adjust | recovery | new_plan
    status      VARCHAR NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    confidence  VARCHAR NOT NULL DEFAULT 'MEDIUM',   -- HIGH | MEDIUM | LOW
    summary     TEXT NOT NULL,      -- cópia de suggestedAction do sinal
    reasoning   JSONB,              -- RecommendationExplanation serializado; nullable em v1
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,        -- NULL = sem expiração; job preenche com created_at + 7 days
    CONSTRAINT chk_sugestao_tipo   CHECK (tipo   IN ('plan_adjust','recovery','new_plan')),
    CONSTRAINT chk_sugestao_status CHECK (status IN ('pending','approved','rejected')),
    CONSTRAINT chk_sugestao_conf   CHECK (confidence IN ('HIGH','MEDIUM','LOW'))
);

CREATE INDEX IF NOT EXISTS idx_sugestao_coach_atleta  ON tb_sugestao_coach(atleta_id);
CREATE INDEX IF NOT EXISTS idx_sugestao_coach_tenant_status ON tb_sugestao_coach(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sugestao_pending ON tb_sugestao_coach(atleta_id, tipo)
    WHERE status = 'pending';
```

**Decisões de mapeamento:**

| Campo | Origem |
|---|---|
| `confidence` | `Severidade` do sinal: `CRITICA`→`HIGH`, `ALTA`→`MEDIUM`, `MEDIA`→`LOW` |
| `summary` | `suggestedAction` do `CoachAttentionItemOutputDto` correspondente |
| `reasoning` | `RecommendationExplanation` do `explanation` do item (nullable se ausente) |
| `expires_at` | `created_at + INTERVAL '7 days'` (definido no job, não no banco) |

**Nota:** `NUMERIC confidence` original descartado — o sistema usa `ExplanationConfidence` como
enum (HIGH/MEDIUM/LOW); converter para numérico adicionaria complexidade sem ganho em v1.

---

## Decisão 5 — `@RequireTenant` no controller

`@RequireTenant` é `@Target(ElementType.METHOD)` — nunca em nível de classe.

| Endpoint | `@RequireTenant` | Motivo |
|---|---|---|
| `GET /` e `GET /?status=` | **Não** | Sem resource-id; usa `TenantContext` na query |
| `GET /{id}` | `@RequireTenant(resourceParamIndex = 0)` | Valida que `{id}` pertence ao tenant |
| `POST /{id}/aprovar` | `@RequireTenant(resourceParamIndex = 0)` | Idem |
| `POST /{id}/rejeitar` | `@RequireTenant(resourceParamIndex = 0)` | Idem |

Padrão idêntico ao `CoachAttentionQueueController` (referência para o implementador).

### `TenantValidationRepository`

Após a criação de `SugestaoCoachRepository`, ele deve ser registrado no `TenantValidationRepository`
para que `@RequireTenant` resolva IDs de sugestão. Sem isso, `POST /{id}/aprovar` retorna 403 para
IDs válidos.

---

## Decisão 6 — Frontend: layout 2-painéis

`CoachInboxPage.tsx` substitui `CoachAttentionQueuePage` na rota `/coach/inbox`.

Layout:
```
┌─────────────────────────────────────────────────────────────┐
│  CoachInboxPage                                             │
│ ┌─────────────┐ ┌──────────────────────────────────────┐  │
│ │ Lista (30%) │ │ Detalhe + Ações (70%)                │  │
│ │             │ │                                       │  │
│ │ [chip tipo] │ │  Nome Atleta                         │  │
│ │ Nome        │ │  [chip severidade] [chip tipo]       │  │
│ │ Summary     │ │                                       │  │
│ │ [selecionado│ │  Summary (negrito)                   │  │
│ │  highlight] │ │  Reasoning.rationale (itálico)       │  │
│ │             │ │  Evidências (tags)                   │  │
│ │ ...         │ │                                       │  │
│ │             │ │  [Aprovar]  [Rejeitar]               │  │
│ └─────────────┘ └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Estados da página:
- **Loading:** `CircularProgress` centralizado
- **Erro:** mensagem + botão "Tentar novamente"
- **Vazio (sem pending):** empty state com ícone ✓ e mensagem "Nenhuma sugestão pendente"
- **Selecionado:** painel direito mostra detalhe; botões Aprovar/Rejeitar com loading individual
- **Nenhum selecionado:** painel direito mostra placeholder "Selecione uma sugestão"

**Hooks e serviço:**
- `useCoachSugestoes`: `useState` + `useCallback`, lista `?status=pending`, sem outlet context
- `SugestaoService.ts` (curado): `listar(status?)`, `aprovar(id)`, `rejeitar(id)`
- `CoachAttentionQueuePage` mantida no código porém sem rota — receberá rota `/coach/queue` em
  change futura; badge do sidebar permanece com `queue.length` da attention queue (follow-up)

---

## Alternativas descartadas

- **Gerar sugestões on-demand no GET:** leitura cara/não-idempotente.
- **Reusar attention-queue como inbox:** mistura priorização efêmera com workflow persistente.
- **Listener de evento:** `CoachAttentionQueueService` é read-only, não publica eventos; tornaria
  necessário adicionar publicação só para este caso.
- **Aprovar com efeito imediato de plano:** bloqueia thread do request (timeout `IaServiceImpl`),
  viola coach-in-the-loop (plano muda sem preview), race condition com 2 coaches do mesmo tenant.
- **`confidence NUMERIC`:** força conversão do enum `ExplanationConfidence` sem ganho em v1.

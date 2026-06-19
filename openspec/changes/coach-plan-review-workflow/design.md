# Design: coach-plan-review-workflow

## Decisões Técnicas

### 1. `reviewStatus` é ortogonal a `PlanoStatus`

`PlanoStatus` (PLANEJADO → ATIVO → CONCLUIDO) descreve o ciclo de execução do plano.
`PlanoReviewStatus` (AGUARDANDO_REVISAO → APROVADO | REJEITADO) descreve a aprovação editorial.

Os dois campos coexistem na mesma entidade sem dependência mútua. O campo `PlanoStatus` não muda de semântica com esta change.

Combinações válidas:

| PlanoStatus | PlanoReviewStatus | Significado |
|---|---|---|
| PLANEJADO | AGUARDANDO_REVISAO | gerado pela IA, aguardando revisão do coach |
| PLANEJADO | APROVADO | aprovado, visível ao atleta |
| PLANEJADO | REJEITADO | rejeitado, invisível ao atleta |
| ATIVO | APROVADO | em execução (semana corrente) |
| CONCLUIDO | APROVADO | encerrado |

Nota: um plano REJEITADO não avança para ATIVO nem CONCLUIDO.

### 2. Diagrama de estados de PlanoReviewStatus

```
                  geração pela IA
                        │
                        ▼
              ┌──────────────────────┐
              │  AGUARDANDO_REVISAO  │
              └──────────────────────┘
                /                   \
         aprovar()              rejeitar(motivo)
              /                       \
             ▼                         ▼
        ┌─────────┐             ┌───────────┐
        │ APROVADO │             │ REJEITADO │
        └─────────┘             └───────────┘

Transições ilegais → DomainRuleViolationException (422):
- APROVADO  → REJEITADO
- REJEITADO → APROVADO
- APROVADO  → APROVADO   (no-op silencioso ou 422 — optamos por 422 por clareza)
- REJEITADO → REJEITADO  (idem)
```

### 3. Modificação de `GET /api/v1/planos/{atletaId}`

O endpoint existente recebe o ID do atleta (não do plano, apesar do nome `{id}`).

Comportamento modificado:
- Se chamador tem role `ATLETA`: retorna o plano **mais recente APROVADO** do atleta. Se não houver, retorna 404.
- Se chamador tem role `TECNICO` ou `ADMIN`: retorna o plano mais recente **independente** do `reviewStatus` (visibilidade total do coach).

Implementação: verificar roles via `SecurityContextHolder` no `PlanoServiceImpl.buscarPlanoPorAtleta()` — evita lógica de autorização no controller.

### 4. Geração de plano → entra em AGUARDANDO_REVISAO

`PlanoServiceImpl.gerarPlanoTreino()` passa a setar `reviewStatus = AGUARDANDO_REVISAO` em todo plano novo.
Planos existentes sem `reviewStatus` recebem `DEFAULT 'AGUARDANDO_REVISAO'` no DDL, com backfill para `APROVADO` na mesma migration (retrocompatibilidade — planos já entregues eram visíveis ao atleta).

### 5. Novos endpoints — controller separado

Os endpoints de revisão pertencem ao domínio do coach, não ao domínio de plano geral. Criar `CoachPlanoReviewController` em `/api/v1/coach/planos` (mesmo prefixo dos outros controllers de coach).

### 6. Contrato de API completo

#### Endpoints novos

```
GET  /api/v1/coach/planos/pendentes
  Role: TECNICO, ADMIN
  Response 200: List<PlanoSemanalOutputDto> (reviewStatus = AGUARDANDO_REVISAO, tenant do coach)
  Ordenação: semanaInicio ASC (mais antigos primeiro)

POST /api/v1/coach/planos/{id}/aprovar
  Role: TECNICO, ADMIN
  Path: {id} = UUID do PlanoSemanal
  Response 200: PlanoSemanalOutputDto (reviewStatus = APROVADO)
  Error 404: plano não encontrado no tenant
  Error 422: transição ilegal (ex: já APROVADO)

POST /api/v1/coach/planos/{id}/rejeitar
  Role: TECNICO, ADMIN
  Body: { "motivo": "string (obrigatório, max 1000)" }
  Response 200: PlanoSemanalOutputDto (reviewStatus = REJEITADO)
  Error 400: motivo ausente ou em branco
  Error 404: plano não encontrado no tenant
  Error 422: transição ilegal (ex: já APROVADO)
```

#### Endpoint modificado

```
GET /api/v1/planos/{atletaId}
  Antes: retorna plano mais recente não-CONCLUIDO do atleta
  Depois:
    - ATLETA: retorna plano mais recente APROVADO → 404 se inexistente
    - TECNICO/ADMIN: comportamento inalterado (mais recente não-CONCLUIDO)
```

### 7. Migration V37

```sql
-- Adicionar colunas
ALTER TABLE tb_plano_semanal
    ADD COLUMN review_status  VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_REVISAO',
    ADD COLUMN review_comment TEXT;

-- Backfill: planos existentes já eram visíveis ao atleta → marcar como APROVADO
UPDATE tb_plano_semanal SET review_status = 'APROVADO';

-- Índice para a query de pendentes por tenant
CREATE INDEX IF NOT EXISTS idx_plano_review_status_tenant
    ON tb_plano_semanal(tenant_id, review_status);
```

Nota: o `DEFAULT 'AGUARDANDO_REVISAO'` no DDL é para planos futuros gerados antes do código entrar em produção.
O `UPDATE` garante que planos históricos ficam `APROVADO`.
Após o deploy do código, a geração passa a setar `AGUARDANDO_REVISAO` explicitamente.

### 8. Badge de pendentes no nav do coach

Novo hook `useCoachPlanPendingCount` que chama `GET /api/v1/coach/planos/pendentes` e retorna apenas o `length`.
`CoachLayout` consome o hook e exibe o badge ao lado do item de navegação "Revisão de planos".
Rota: `/coach/planos/revisao`.

### 9. DTO de entrada para rejeição

```java
public record PlanoRejectionInputDto(
    @NotBlank(message = "Motivo é obrigatório")
    @Size(max = 1000, message = "Motivo não pode exceder 1000 caracteres")
    String motivo
) {}
```

### 10. PlanoSemanalOutputDto — campos novos

```java
// adicionados ao record existente:
@Schema(description = "Status de revisão do plano pelo coach")
PlanoReviewStatus reviewStatus,

@Schema(description = "Comentário do coach ao rejeitar o plano")
String reviewComment
```

### 11. O que o atleta vê enquanto o plano está pendente

Se o atleta não tem nenhum plano `APROVADO`:
- `GET /api/v1/planos/{atletaId}` retorna 404.
- O frontend do atleta trata o 404 como "aguardando plano" (estado existente — sem mudança na UX do atleta nesta change).

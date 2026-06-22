# Design: coach-edit-planned-workout

## Decisões Técnicas

### 1. Edição limitada a `AGUARDANDO_REVISAO`

`PlanoReviewStatus` já define a janela de edição editorial. Nenhum novo estado necessário.

```
     geração pela IA
           │
           ▼
 ┌──────────────────────┐
 │  AGUARDANDO_REVISAO  │  ◀── PATCH liberado
 └──────────────────────┘
       /          \
  aprovar()    rejeitar()
      /              \
     ▼                ▼
┌─────────┐      ┌───────────┐
│ APROVADO │      │ REJEITADO │  PATCH → 422
└─────────┘      └───────────┘
```

### 2. Campos editáveis vs. protegidos

| Campo | Editável | Justificativa |
|---|:---:|---|
| `tipoTreino` | ✅ | Prescrição do coach |
| `descricao` | ✅ | Texto livre |
| `distanciaKm` | ✅ | Volume prescrito |
| `duracaoMin` | ✅ | Tempo prescrito (`Duration`) |
| `zonaAlvo` | ✅ | Intensidade prescrita |
| `tssPlanejado` | ✅ | Override manual do coach |
| `percepcaoEsforcoEsperada` | ✅ | RPE esperado |
| `observacoes` | ✅ | Campo texto livre em `TreinoBase` |
| `justificativaIa` | ❌ | Auditoria imutável da IA |
| `dataTreino` | ❌ | Reordenação do plano — fora do escopo |
| `diaSemana` | ❌ | Identidade temporal |
| `statusTreino` | ❌ | Ciclo de execução independente |

### 3. Recálculo de TSS — fórmula e precedência

**Fórmula:** `TSS = round(duracaoMinutos × rpe² / 90.0)`

- `duracaoMinutos` = `duracaoMin.toMinutes()` (Duration → long)
- `rpe` = `percepcaoEsforcoEsperada` do treino atualizado; se nulo, usa `5` como default
- `round()` = `Math.round()` (arredondamento para inteiro mais próximo)

**Precedência:**
```
if (patch.tssPlanejado() != null)          → TSS = valor do coach (sem recálculo)
else if (mudou distanciaKm ou duracaoMin) → TSS = recalcular com fórmula
else                                        → TSS = mantém o valor atual
```

Nota: a fórmula é a mesma usada no `manual-training-entry-lightweight` para `TreinoRealizado`. A lógica de recálculo deve ser extraída para um helper estático `TssEstimator.calcular(duracaoMin, rpe)` compartilhado entre os dois fluxos — se `TssCalculatorService` já existir com essa assinatura, reutilizar; caso contrário, criar método estático.

### 4. DTO de input — patch semântico com campos nullable

```java
// dto/input/TreinoPlanejadoPatchDto.java
public record TreinoPlanejadoPatchDto(
    TipoTreino tipoTreino,
    String descricao,
    @Positive BigDecimal distanciaKm,
    Duration duracaoMin,
    String zonaAlvo,
    @Min(1) @Max(500) Integer tssPlanejado,
    @Min(1) @Max(10) Integer percepcaoEsforcoEsperada,
    String observacoes
) {}
```

Todos os campos são nullable. A lógica de "aplicar apenas campos não-nulos" vive no service.

### 5. `TreinoPlanejadoPatchDto` → `Duration` no JSON

`Duration` não tem deserialização automática do Spring Boot para JSON. Usar `@JsonDeserialize(using = DurationDeserializer.class)` ou configurar o `ObjectMapper` para ISO-8601 (`PT90M` = 90 minutos). Verificar se o `Jackson Datatype JSR310` já está configurado no projeto; se sim, `Duration` deserializa de `PT90M` diretamente.

### 6. `TreinoPlanejadoEditService` — estrutura do service

```java
public interface TreinoPlanejadoEditService {
    /**
     * Idempotent: NO — muda estado do treino
     * Side Effects: Database update
     * Tenant-aware: YES
     */
    TreinoPlanejadoOutputDto editarTreino(UUID planoId, UUID treinoId, TreinoPlanejadoPatchDto patch);
}
```

Implementação (`TreinoPlanejadoEditServiceImpl`):
1. Resolver `tenantId` via `TenantContext.getRequiredTenantId()`.
2. Buscar plano: `planoSemanalRepository.findByIdAndTenantId(planoId, tenantId)` → 404 se ausente.
3. Validar `reviewStatus == AGUARDANDO_REVISAO` → `DomainRuleViolationException("Plano não está em revisão")` se diferente.
4. Buscar treino: deve pertencer ao plano (verificar `treino.getPlanoSemanal().getId().equals(planoId)`) → 404 se não pertencer.
5. Aplicar patch (campos não-nulos).
6. Recalcular TSS conforme regra da seção 3.
7. Setar `editadoPeloCoach = true`.
8. Salvar e retornar DTO via mapper.

### 7. Isolamento de tenant no `PATCH`

O tenant check é feito via `findByIdAndTenantId(planoId, tenantId)` — se o plano pertencer a outro tenant, o método retorna `Optional.empty()` e o service lança `EntityNotFoundException`, que o `GlobalExceptionHandler` mapeia para 404. Nunca revelar se o recurso existe em outro tenant.

### 8. Concorrência — `@Version` em `TreinoPlanejado`

`TreinoPlanejado` deve ter `@Version Long versao` para detectar edições concorrentes (multi-device, duas abas). Sem esse campo, dois `PATCH` simultâneos no mesmo treino sobrescrevem silenciosamente sem conflito detectado.

Handler no `GlobalExceptionHandler`:
```java
@ExceptionHandler(OptimisticLockingFailureException.class)
ResponseEntity<ErrorDto> handleOptimisticLock(OptimisticLockingFailureException ex) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(new ErrorDto("Treino foi modificado simultaneamente. Recarregue e tente novamente."));
}
```

Verificar se `@Version` já existe em `TreinoPlanejado`; se não, adicionar na task 1.2.a. Verificar se `OptimisticLockingFailureException` já tem handler no `GlobalExceptionHandler` na task 1.4.c.

### 9. Frontend — estado do componente e re-fetch

`CoachPlanReviewPage` mantém o estado do plano selecionado. Após `PATCH` bem-sucedido:
- Fechar o dialog **antes** de disparar o re-fetch — evita race condition quando o coach edita múltiplos treinos em sequência rápida (dialog fecha → re-fetch → estado local atualizado → próximo dialog abre com dados frescos).
- Invalidar cache do hook `usePlanoReview` (ou chamar manualmente a função de refetch) após fechar o dialog.
- O card do treino editado recebe `editadoPeloCoach = true` no DTO e exibe o chip.

O botão de edição (ícone lápis) é renderizado condicionalmente:
```tsx
{plano.reviewStatus === 'AGUARDANDO_REVISAO' && (
  <IconButton onClick={() => setEditingTreinoId(treino.id)}>
    <EditIcon />
  </IconButton>
)}
```

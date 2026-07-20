# Runbook: Testes de Integração com Testcontainers

**Escopo:** Validar deduplicação (1.2), isolamento multi-tenant (1.3), e fluxo completo de reconciliação.

## Pré-requisitos

- Java 21+
- Maven 3.9+
- **Docker daemon rodando** (`docker ps` sem erros)

## Execução

### Suite de Integração Completa

```bash
cd apps/menthoros-backend

# Verificar Docker
docker ps

# Rodar testes de integração
./mvnw clean test \
  -Dtest="DeduplicationConstraintTest,MultiTenantIsolationTest" \
  -q

# Esperado:
# [INFO] Tests run: 10, Failures: 0, Errors: 0
# [INFO] BUILD SUCCESS
```

### Detalhamento por Teste

#### 1.2 - Deduplication Constraint (5 testes)
```bash
./mvnw test -Dtest="DeduplicationConstraintTest" -v
```

**Casos validados:**
- `1.2.1`: Atividade única com chave única é aceita
- `1.2.2`: Duplicata (externalId, atletaId) é rejeitada (constraint UNIQUE V23)
- `1.2.3`: Mesmo externalId para atleta diferente é aceito
- `1.2.4`: NULL externalId permite múltiplos (índice parcial)
- `1.2.5`: Query `findByExternalIdAndAtletaId` detecta duplicata

#### 1.3 - Multi-tenant Isolation (5 testes)
```bash
./mvnw test -Dtest="MultiTenantIsolationTest" -v
```

**Casos validados:**
- `1.3.1`: Atividade de tenant1 não aparece em queries de tenant2
- `1.3.2`: Atleta1 vê apenas suas atividades, atleta2 idem
- `1.3.3`: Tenant sempre acessível via relação atleta.assessoria
- `1.3.4`: Mesmo externalId permitido para atletas de tenants diferentes
- `1.3.5`: Query por atletaId implicitamente isola por tenant

### Suite Completa (com unitários)

```bash
./mvnw clean test -DskipTests=false -q
```

**Resultado esperado:** 207+ testes (197 unitários + 10 integração)

## Interpretação de Saída

### ✅ SUCESSO
```
[INFO] Tests run: 10, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Evidência de aprovação:
- Constraint UNIQUE V23 em banco funcional
- Queries multi-tenant isolam corretamente
- Idempotência de deduplicação validada

### ❌ FALHA

Se `DeduplicationConstraintTest.shouldRejectDuplicateExternalIdAtletaIdPair` falhar:
- V23 migration não foi aplicada ou tem erro
- Constraint UNIQUE não está no banco

Se `MultiTenantIsolationTest.shouldIsolateTenantData` falhar:
- Queries estão retornando dados de outros tenants
- Relação atleta.assessoria está quebrada

## Troubleshooting

### Docker não está rodando
```bash
docker system prune -a  # Limpar
docker ps              # Verificar
```

### Testcontainers tenta criar container mas falha
```bash
# Verificar logs
mvn test -Dtest=DeduplicationConstraintTest -X 2>&1 | grep -i testcontainers
```

### Timeout no startup do PostgreSQL
- Aumentar `docker ps` timeout
- Verificar recursos livres (`docker stats`)
- Rodar container manualmente: `docker run -p 5432:5432 postgres:latest`

## Rastreabilidade OpenSpec

| Tarefa | Teste | Critério Aceite |
|--------|-------|-----------------|
| 1.2 | `DeduplicationConstraintTest` | 8.1 (sem duplicata) |
| 1.3 | `MultiTenantIsolationTest` | 8.x isolamento |
| 7.4 | Ambos | Idempotência |
| 7.5 | `MultiTenantIsolationTest` | Multi-tenant + timezone |

## Próximas Iterações

Após aprovação dessa evidência:
- [ ] Marcar 1.2, 1.3, 7.4, 7.5 como `[x]` em `tasks.md`
- [ ] Atualizar `INTEGRATION_TEST_EVIDENCE.md` com saída real
- [ ] Mergear feature branch ao `develop`

---

**Última atualização:** 2026-05-02  
**Ambiente testado:** Docker PostgreSQL latest + Spring Boot 3.5 + Java 21

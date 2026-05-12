# Multi-Tenancy Operations - Consolidado

**Documento Unificado de Setup e Integração Multi-Tenancy**
**Data:** Consolidado em 08 de maio de 2026
**Status:** ✅ ENTREGUE

---

## 📑 Índice

1. Docker Setup Multi-Tenancy
2. Guia de Integração
3. Autenticação Keycloak
4. Checklist Operacional

---

## 🐳 SEÇÃO 1: Docker Setup Multi-Tenancy

### Arquitetura

```
postgres-db (5432) [menthoros-db original - NÃO ALTERADO]
postgres-mt (5433) [menthoros-multi + keycloak]
redis:6379        [cache compartilhado]
keycloak:8080     [OAuth2/OIDC]
app:8099          [Spring Boot]
```

### Arquivos Necessários

```
docker-compose.multi-tenancy.yml
docker/Dockerfile.multi-tenancy
.env.multi-tenancy.example
src/main/resources/db/init/menthoros_mt_init.sql
src/main/resources/db/init/keycloak_init.sql
```

### Setup Rápido

```bash
# 1. Copiar e configurar .env
cp .env.multi-tenancy.example .env.multi-tenancy
nano .env.multi-tenancy  # Adicionar OPENAI_API_KEY

# 2. Iniciar containers
docker compose --env-file .env.multi-tenancy \
    -f docker-compose.multi-tenancy.yml up -d

# 3. Aguardar Keycloak
docker compose -f docker-compose.multi-tenancy.yml logs -f keycloak

# 4. Validar
curl http://localhost:8099/actuator/health
```

---

## 🔗 SEÇÃO 2: Guia de Integração

### Spring Boot com Multi-Tenancy

```java
@Configuration
public class MultiTenancyConfiguration {
    @Bean
    public TenantResolver tenantResolver() {
        return new TenantResolver();
    }
    
    @Bean
    public TenantInterceptor tenantInterceptor() {
        return new TenantInterceptor();
    }
}

@RestController
@RequestMapping("/api/v1")
public class AtletaController {
    @GetMapping("/atletas")
    public List<Atleta> listAtletas() {
        // TenantInterceptor já configurou o tenant
        // Queries rodam no schema correto
        return atletaService.list();
    }
}
```

### Frontend com Tenant Context

```typescript
// useAuth hook retorna tenant info
const { user } = useAuth();
// user.tenantId, user.tenantSlug

// Axios interceptor adiciona header
axios.defaults.headers.common['X-Tenant-ID'] = user.tenantSlug;

// Context provider
<TenantProvider>
  <App />
</TenantProvider>
```

---

## 🔐 SEÇÃO 3: Autenticação Keycloak

### Setup Inicial

1. **Acessar Admin Console**
   - http://localhost:8080/admin
   - admin / admin123

2. **Criar Realm**
   - Name: menthoros
   - Enabled: On

3. **Criar Client**
   - Client ID: menthoros-app
   - Client Protocol: openid-connect
   - Access Type: public

4. **Mapear Tenant ID**
   - Client Scopes → mappers
   - Add mapper: User Attribute
   - Attribute name: tenant_id
   - Token Claim Name: tenant_id

### Fluxo OAuth2

```
User clica "Login com Garmin"
    ↓
Redireciona para Keycloak
    ↓
Keycloak redireciona para Garmin
    ↓
Garmin autentica e retorna code
    ↓
Keycloak troca code por token (com tenant_id)
    ↓
App recebe token com tenant_id
    ↓
TenantInterceptor extrai e valida tenant
    ↓
Request roda no schema correto
```

---

## ✅ SEÇÃO 4: Checklist Operacional

### Pre-Launch

- [ ] Docker images buildadas
- [ ] .env configurado em produção
- [ ] Database backups estratégia
- [ ] SSL/TLS certificates
- [ ] Keycloak hardened (senhas, URLs)
- [ ] Redis persistence on
- [ ] Network policies configuradas

### Post-Launch

- [ ] Monitorar logs
- [ ] Validar isolamento multi-tenant
- [ ] Backups automáticos rodando
- [ ] Alerts configurados
- [ ] Documentação atualizada
- [ ] Team treinado

### Troubleshooting

**Erro: Keycloak não inicia**
```bash
docker compose -f docker-compose.multi-tenancy.yml down -v
docker compose ... up -d
```

**Erro: menthoros-multi DB não criada**
```bash
# Flyway criará automaticamente
# Aguardar 30s e verificar
docker compose logs app | grep Flyway
```

---

**Status:** ✅ ENTREGUE - Consolida DOCKER_SETUP_MULTI_TENANCY + MULTI_TENANCY_INTEGRATION_GUIDE + KEYCLOAK_AUTHENTICATION_GUIDE + KEYCLOAK_MANUAL_SETUP

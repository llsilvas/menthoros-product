# Multi-Tenancy Architecture - Menthoros

**Documento Consolidado de Arquitetura Multi-Tenancy**
**Data:** 28 de fevereiro de 2026 (Atualizado: 01 de março)
**Impacto:** 🔴 CRÍTICO - Redefine Sprint 1
**Status:** ✅ ENTREGUE - Consolidado em um único documento

---

## 📋 Sumário Executivo

### Por Que Multi-Tenancy?

**Menthoros será SaaS com múltiplas organizações:**
- Coaches independentes (cada um é um "tenant")
- Academias/centros de treinamento (cada um é um "tenant")
- Isolamento de dados é crítico (segurança legal)
- Cada tenant tem seus próprios atletas/planos
- Billing por tenant

### Decisão Arquitetural

**Estratégia Escolhida: SCHEMA-PER-TENANT**

```
┌────────────────────────────────────────────┐
│         ESTRATÉGIA SELECIONADA              │
├────────────────────────────────────────────┤
│  Tipo:        Schema-per-Tenant            │
│  Database:    PostgreSQL (1 por environment)│
│  Schemas:     Dinâmicos por tenant         │
│  Isolation:   🔒 EXCELENTE                 │
│  Escalabilidade: 🚀 ÓTIMA (1k+ tenants)   │
│  Custo:       💰 MÉDIO (1 BD, múltiplos    │
│               schemas)                     │
│  Complexidade: 🔴 AUMENTA (mas gerenciável)│
└────────────────────────────────────────────┘
```

**Por que não alternativas?**
- ❌ Database-per-tenant: Muito caro (1 BD por tenant)
- ❌ Row-level (single schema): Risco de isolação inadequada
- ✅ Schema-per-tenant: Melhor balanço isolação/custo

---

## 🏗️ Arquitetura Multi-Tenancy

### Visão Geral

```
┌─────────────────────────────────────────────────────┐
│                 FRONTEND (React)                     │
│  ├─ Login com email/password                        │
│  ├─ Recebe: JWT + tenant_id                         │
│  ├─ Headers: Authorization + X-Tenant-ID            │
│  └─ Context com tenant info (nome, plano, etc)     │
└────────────────┬────────────────────────────────────┘
                 │
                 ↓ POST /api/v1/auth/login
┌─────────────────────────────────────────────────────┐
│              BACKEND (Spring Boot)                   │
│  ├─ AuthService: Autentica user + retorna tenant   │
│  ├─ TenantResolver: Extrai tenant do JWT token     │
│  ├─ TenantContext: ThreadLocal com tenant atual    │
│  ├─ TenantInterceptor: Valida acesso ao tenant    │
│  └─ Services: Filtram dados por tenant auto       │
└────────────────┬────────────────────────────────────┘
                 │
                 ↓ DataSource dinâmico (schema)
┌─────────────────────────────────────────────────────┐
│           DATABASE (PostgreSQL)                      │
│  ├─ public schema (usuários, tenants, etc)         │
│  ├─ tenant_001 schema (dados do tenant 001)        │
│  │  ├─ tb_atleta (do tenant 001)                   │
│  │  ├─ tb_plano_semanal (do tenant 001)            │
│  │  └─ ... (outras tables do tenant)               │
│  ├─ tenant_002 schema (dados do tenant 002)        │
│  │  ├─ tb_atleta (do tenant 002 - isolado!)       │
│  │  ├─ tb_plano_semanal (do tenant 002)            │
│  │  └─ ... (outras tables do tenant)               │
│  └─ tenant_nnn schema (...)                         │
└─────────────────────────────────────────────────────┘
```

---

## 🔐 Estratégia de Isolamento

### 1. Database Level

```sql
-- PUBLIC SCHEMA (shared)
CREATE TABLE tb_tenant (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,      -- "coach-joao"
    name VARCHAR(255) NOT NULL,             -- "João Silva"
    plan VARCHAR(50) NOT NULL,              -- "BASIC", "PRO", "ENTERPRISE"
    status VARCHAR(50) NOT NULL,            -- "ACTIVE", "SUSPENDED", "DELETED"
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tb_usuario (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    tenant_id BIGINT NOT NULL,              -- ⭐ CHAVE
    role VARCHAR(50) NOT NULL,              -- "ADMIN", "COACH", "ATHLETE"
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tb_tenant(id)
);

CREATE INDEX idx_usuario_tenant ON tb_usuario(tenant_id);
CREATE INDEX idx_usuario_email_tenant ON tb_usuario(email, tenant_id);

-- TENANT-SPECIFIC SCHEMA (dinâmico)
-- Executado durante onboarding:
-- CREATE SCHEMA IF NOT EXISTS tenant_001;
-- GRANT USAGE ON SCHEMA tenant_001 TO app_user;
-- GRANT CREATE ON SCHEMA tenant_001 TO app_user;

-- Tables dentro do tenant schema:
-- CREATE TABLE tenant_001.tb_atleta (...)
-- CREATE TABLE tenant_001.tb_plano_semanal (...)
-- ... etc
```

### 2. Application Level

```
┌────────────────────────────────────────┐
│      Request com JWT Token              │
│  "eyJhbGc...sub:coach-joao...tenant:1"│
└─────────────────┬──────────────────────┘
                  ↓
┌────────────────────────────────────────┐
│    TenantInterceptor                    │
│  1. Extrai tenant do JWT                │
│  2. Valida tenant ativo                 │
│  3. Coloca em TenantContext (ThreadLocal)
│  4. Configura DataSource schema         │
└─────────────────┬──────────────────────┘
                  ↓
┌────────────────────────────────────────┐
│    Service Layer (AtletaService, etc)   │
│  • Todos queries já filtram by tenant   │
│  • Sem permissão = 403 Forbidden        │
│  • Sempre validar tenant antes de CRUD  │
└─────────────────┬──────────────────────┘
                  ↓
┌────────────────────────────────────────┐
│    Database Query                       │
│  SELECT * FROM tenant_001.tb_atleta    │
│  WHERE tenant_id = 1 AND ativo = true  │
└────────────────────────────────────────┘
```

### 3. API Level

```
Request Headers:

Authorization: Bearer eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...
X-Tenant-ID: coach-joao
X-Tenant-Slug: coach-joao
Accept: application/json

Response Headers:

X-Tenant-ID: coach-joao
Cache-Control: private (nunca cachear dados de tenant)
```

---

## 🔑 JWT Token com Tenant

### JWT Payload (Nova Estrutura)

```json
{
  "sub": "user-123",                    // User ID
  "email": "joao@example.com",          // Email
  "tenant_id": 1,                       // ⭐ Tenant ID (obrigatório)
  "tenant_slug": "coach-joao",          // ⭐ Tenant slug
  "role": "TENANT_ADMIN",               // Role no tenant
  "tenant_plan": "ENTERPRISE",          // Plano do tenant
  "iat": 1677091200,                    // Issued at
  "exp": 1677177600                     // Expires in 24h
}
```

### Validação do Token

```java
// JwtProvider deve extrair e validar tenant_id
public Long getTenantIdFromToken(String token) {
    return (Long) Jwts.parserBuilder()
        .setSigningKey(getSigningKey())
        .build()
        .parseClaimsJws(token)
        .getBody()
        .get("tenant_id");  // ⭐ Validar que existe
}

public String getTenantSlugFromToken(String token) {
    return (String) Jwts.parserBuilder()
        .setSigningKey(getSigningKey())
        .build()
        .parseClaimsJws(token)
        .getBody()
        .get("tenant_slug");
}
```

---

## 🛠️ Mudanças Necessárias por Componente

## BACKEND

### 1. Authentication Service (NOVA)

```java
// AuthService precisa retornar tenant no login
@Service
public class AuthService {

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private JwtProvider jwtProvider;

    public AuthResponse login(String email, String password) {
        // 1. Encontrar usuário pelo email
        Usuario usuario = usuarioRepository.findByEmail(email)
            .orElseThrow(() -> new AuthException("Invalid credentials"));

        // 2. Validar senha
        if (!passwordEncoder.matches(password, usuario.getPasswordHash())) {
            throw new AuthException("Invalid credentials");
        }

        // 3. Encontrar tenant do usuário
        Tenant tenant = tenantRepository.findById(usuario.getTenantId())
            .orElseThrow(() -> new AuthException("Tenant not found"));

        // 4. Validar tenant está ativo
        if (!tenant.isActive()) {
            throw new AuthException("Tenant is suspended");
        }

        // 5. Gerar token WITH TENANT INFO
        String token = jwtProvider.generateToken(
            usuario.getId(),
            usuario.getEmail(),
            usuario.getRole(),
            tenant.getId(),                    // ⭐ Adicionar
            tenant.getSlug(),                  // ⭐ Adicionar
            tenant.getPlan()                   // ⭐ Adicionar
        );

        return new AuthResponse(token, tenant);
    }
}
```

### 2. TenantResolver (NOVO - CRÍTICO)

```java
// Extrai tenant da request e valida
@Component
public class TenantResolver {

    @Autowired
    private JwtProvider jwtProvider;

    @Autowired
    private TenantRepository tenantRepository;

    /**
     * Resolve tenant ID from JWT token
     */
    public TenantContext resolveTenant(String token) {
        if (token == null || token.isEmpty()) {
            throw new TenantException("No tenant context");
        }

        Long tenantId = jwtProvider.getTenantIdFromToken(token);
        String tenantSlug = jwtProvider.getTenantSlugFromToken(token);

        // Validar que tenant existe e está ativo
        Tenant tenant = tenantRepository.findById(tenantId)
            .orElseThrow(() -> new TenantException("Tenant not found"));

        if (!tenant.isActive()) {
            throw new TenantException("Tenant is suspended");
        }

        return new TenantContext(
            tenant.getId(),
            tenant.getSlug(),
            tenant.getSchemaName(),            // "tenant_001"
            tenant.getPlan(),
            tenant.getName()
        );
    }

    /**
     * Validar que usuario pertence ao tenant
     */
    public void validateTenantAccess(Long tenantId, String tokenTenantId) {
        if (!tenantId.equals(tokenTenantId)) {
            throw new ForbiddenException("Access denied");
        }
    }
}
```

### 3. TenantContext (ThreadLocal - NOVO)

```java
// Manter contexto de tenant na thread atual
public class TenantContextHolder {

    private static final ThreadLocal<TenantContext> TENANT_CONTEXT =
        new ThreadLocal<>();

    public static void setTenantContext(TenantContext context) {
        TENANT_CONTEXT.set(context);
    }

    public static TenantContext getTenantContext() {
        TenantContext context = TENANT_CONTEXT.get();
        if (context == null) {
            throw new TenantException("No tenant context in thread");
        }
        return context;
    }

    public static Long getTenantId() {
        return getTenantContext().getTenantId();
    }

    public static String getSchemaName() {
        return getTenantContext().getSchemaName();
    }

    public static void clear() {
        TENANT_CONTEXT.remove();
    }
}
```

### 4. TenantInterceptor (NOVO - PROCESSANDO REQUEST)

```java
// Intercepta todas requests e configura tenant
@Component
public class TenantInterceptor implements HandlerInterceptor {

    @Autowired
    private TenantResolver tenantResolver;

    @Override
    public boolean preHandle(HttpServletRequest request,
                           HttpServletResponse response,
                           Object handler) throws Exception {

        // 1. Extrair JWT do header
        String bearerToken = request.getHeader("Authorization");
        if (bearerToken == null || !bearerToken.startsWith("Bearer ")) {
            // Routes públicas (auth) não precisam de tenant
            if (isPublicRoute(request)) {
                return true;
            }
            throw new TenantException("Missing Authorization header");
        }

        String token = bearerToken.substring(7);

        // 2. Resolver tenant
        TenantContext tenantContext = tenantResolver.resolveTenant(token);

        // 3. Colocar em ThreadLocal
        TenantContextHolder.setTenantContext(tenantContext);

        // 4. Configurar DataSource para o schema correto
        HikariConfig config = new HikariConfig();
        config.setSchema(tenantContext.getSchemaName());
        // dataSource já está configurado, apenas switch schema

        // 5. Adicionar headers na response
        response.addHeader("X-Tenant-ID", tenantContext.getTenantId().toString());
        response.addHeader("X-Tenant-Slug", tenantContext.getTenantSlug());

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request,
                               HttpServletResponse response,
                               Object handler,
                               Exception ex) throws Exception {
        // Limpar ThreadLocal para evitar memory leak
        TenantContextHolder.clear();
    }

    private boolean isPublicRoute(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/v1/auth/") ||
               path.startsWith("/api-docs/") ||
               path.startsWith("/swagger-ui/");
    }
}
```

### 5. DataSource Configuration (MUDANÇA)

```java
// Configurar DataSource com schema dinâmico
@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource dataSource(
            @Value("${spring.datasource.url}") String url,
            @Value("${spring.datasource.username}") String username,
            @Value("${spring.datasource.password}") String password) {

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(password);

        // ⭐ Schema será alterado dinamicamente por tenant
        // Padrão: search_path = "public, tenant_001"
        config.setSchema("public");

        // Connection pooling
        config.setMaximumPoolSize(20);
        config.setMinimumIdle(5);

        return new HikariDataSource(config);
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}
```

### 6. Repositories (MUDANÇA MENOR)

```java
// Repositories herdam de JpaRepository (sem mudança no código)
// Mas as queries agora executam no schema do tenant

@Repository
public interface AtletaRepository extends JpaRepository<Atleta, Long> {

    // Query agora vai para tenant_001.tb_atleta (específico do tenant)
    // Não precisa de WHERE tenant_id porque está em schema isolado
    List<Atleta> findByAtivoTrue();

    // Mas algumas queries precisam de validação:
    @Query("SELECT a FROM Atleta a WHERE a.id = :id")
    Optional<Atleta> findById(@Param("id") Long id);
    // ⭐ Adicionar validação no service
}
```

### 7. Service Layer (MUDANÇA IMPORTANTE)

```java
@Service
@RequiredArgsConstructor
public class AtletaService {

    private final AtletaRepository atletaRepository;
    private final AtletaMapper atletaMapper;

    /**
     * ⭐ Sempre validar que request é do tenant correto
     */
    public Page<AtletaResponse> listAtletas(Pageable pageable) {
        // TenantContextHolder já tem o tenant ID
        // Service está no schema correto do tenant

        return atletaRepository.findByAtivoTrue(pageable)
            .map(atletaMapper::toResponse);
    }

    /**
     * ⭐ Validar que ID pertence ao tenant ANTES de retornar
     */
    public AtletaResponse getById(Long id) {
        Atleta atleta = atletaRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Atleta not found"));

        // ⭐ CRÍTICO: Validar que atleta pertence ao tenant atual
        validateTenantAccess(atleta.getTenantId());

        return atletaMapper.toResponse(atleta);
    }

    /**
     * ⭐ Adicionar tenant automaticamente
     */
    public AtletaResponse create(CreateAtletaRequest request) {
        Atleta atleta = new Atleta();
        // ... mapear request para atleta
        atleta.setTenantId(TenantContextHolder.getTenantId());  // ⭐
        atleta.setAtivoTrue();

        return atletaMapper.toResponse(atletaRepository.save(atleta));
    }

    /**
     * ⭐ Método helper para validar tenant
     */
    private void validateTenantAccess(Long resourceTenantId) {
        Long currentTenantId = TenantContextHolder.getTenantId();
        if (!resourceTenantId.equals(currentTenantId)) {
            throw new ForbiddenException("Access denied");
        }
    }
}
```

### 8. Entity (MUDANÇA)

```java
@Entity
@Table(name = "tb_atleta")
@Data
public class Atleta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nome;
    private String email;

    // ⭐ NOVO: Adicionar tenant_id em TODAS entities
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    private Boolean ativo;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime atualizadoEm;
}
```

---

## FRONTEND

### 1. useAuth Hook (MUDANÇA)

```typescript
interface User {
  id: string;
  email: string;
  role: string;
  tenantId: number;        // ⭐ NOVO
  tenantSlug: string;      // ⭐ NOVO
  tenantPlan: string;      // ⭐ NOVO
}

export const useAuth = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    return {
      user: user ? JSON.parse(user) : null,
      token,
      isAuthenticated: !!token,
      isLoading: false,
      error: null,
    };
  });

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await axios.post('/api/v1/auth/login', {
        email,
        password,
      });

      const { token, user } = response.data;

      // Salvar
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenantId', user.tenantId);    // ⭐ NOVO
      localStorage.setItem('tenantSlug', user.tenantSlug); // ⭐ NOVO

      // Configurar headers padrão (INCLUINDO tenant ID)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.defaults.headers.common['X-Tenant-ID'] = user.tenantSlug;

      setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      navigate('/');
      return { success: true };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login falhou';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [navigate]);

  // ... rest of hook
};
```

### 2. TenantContext (NOVO - Frontend)

```typescript
interface TenantContextType {
  tenantId: number;
  tenantSlug: string;
  tenantName: string;
  tenantPlan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  canCreateCoaches: boolean;      // Baseado no plano
  maxAthletes: number;            // Baseado no plano
}

const TenantContext = createContext<TenantContextType | null>(null);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();

  if (!user) {
    return <>{children}</>;
  }

  const tenantContext: TenantContextType = {
    tenantId: user.tenantId,
    tenantSlug: user.tenantSlug,
    tenantName: user.tenantName,
    tenantPlan: user.tenantPlan,
    canCreateCoaches: user.tenantPlan === 'ENTERPRISE',
    maxAthletes: {
      'BASIC': 5,
      'PRO': 50,
      'ENTERPRISE': Infinity,
    }[user.tenantPlan],
  };

  return (
    <TenantContext.Provider value={tenantContext}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
};
```

### 3. API Calls (MUDANÇA)

```typescript
// Axios interceptor para adicionar tenant ID
axios.interceptors.request.use((config) => {
  const tenantSlug = localStorage.getItem('tenantSlug');
  if (tenantSlug) {
    config.headers['X-Tenant-ID'] = tenantSlug;  // ⭐ ADICIONAR
  }
  return config;
});

// No hook useCrud
const useCrud = () => {
  const { tenantSlug } = useTenant();  // ⭐ NOVO

  const fetchAtletas = useCallback(async () => {
    // Header X-Tenant-ID já é adicionado pelo interceptor
    const response = await axios.get('/api/v1/atleta');
    return response.data;
  }, []);

  // ... resto do hook
};
```

### 4. Layout (MUDANÇA)

```typescript
// DashboardHeader agora mostra tenant info
const DashboardHeader: React.FC = () => {
  const { tenantSlug, tenantPlan } = useTenant();

  return (
    <AppBar>
      <Toolbar>
        <Typography variant="h6">Menthoros</Typography>

        {/* ⭐ NOVO: Mostrar tenant e plano */}
        <Typography sx={{ ml: 2, fontSize: '0.9rem', color: 'gray' }}>
          Organização: {tenantSlug} | Plano: {tenantPlan}
        </Typography>

        {/* ... resto do header */}
      </Toolbar>
    </AppBar>
  );
};
```

---

## DATABASE

### 1. Migrations (NOVO)

```sql
-- V17__Add_Multi_Tenancy_Support.sql

-- 1. Public schema: Tabela de tenants
CREATE TABLE public.tb_tenant (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    schema_name VARCHAR(50) UNIQUE NOT NULL,    -- "tenant_001", etc
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL,                  -- BASIC, PRO, ENTERPRISE
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT chk_plan CHECK (plan IN ('BASIC', 'PRO', 'ENTERPRISE')),
    CONSTRAINT chk_status CHECK (status IN ('ACTIVE', SUSPENDED', 'DELETED'))
);

CREATE INDEX idx_tenant_slug ON tb_tenant(slug);
CREATE INDEX idx_tenant_status ON tb_tenant(status);

-- 2. Public schema: Atualizar tb_usuario
ALTER TABLE public.tb_usuario ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.tb_usuario ADD CONSTRAINT fk_usuario_tenant
    FOREIGN KEY (tenant_id) REFERENCES tb_tenant(id);
CREATE INDEX idx_usuario_tenant ON tb_usuario(tenant_id);

-- 3. Criar índice único: email por tenant
DROP INDEX idx_usuario_email;
CREATE UNIQUE INDEX idx_usuario_email_tenant ON tb_usuario(email, tenant_id);

-- 4. Criar schemas para primeiros tenants
CREATE SCHEMA IF NOT EXISTS tenant_001;
CREATE SCHEMA IF NOT EXISTS tenant_002;

-- 5. Dentro de cada schema: replicar estrutura
-- (Isso será automático via migration por tenant)

-- 6. Role permissions
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA tenant_001 TO app_user;
GRANT USAGE ON SCHEMA tenant_002 TO app_user;
```

### 2. Dynamic Schema Creation (NOVO - JAVA)

```java
// TenantService.java - criar schema para novo tenant
@Service
@RequiredArgsConstructor
public class TenantService {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * Criar novo tenant (schema + tables)
     */
    @Transactional
    public Tenant createTenant(CreateTenantRequest request) {

        // 1. Criar tenant no schema public
        Tenant tenant = new Tenant();
        tenant.setSlug(request.getSlug());
        tenant.setName(request.getName());
        tenant.setPlan(request.getPlan());
        tenant.setStatus("ACTIVE");
        tenant.setSchemaName("tenant_" + UUID.randomUUID().toString().substring(0, 8));
        // ... save tenant

        // 2. Criar schema para o tenant
        String schemaName = tenant.getSchemaName();
        jdbcTemplate.execute("CREATE SCHEMA IF NOT EXISTS " + schemaName);

        // 3. Executar migrations do schema
        executeSchemaInitialization(schemaName);

        // 4. Dar permissões
        jdbcTemplate.execute(
            "GRANT USAGE ON SCHEMA " + schemaName + " TO app_user"
        );

        return tenant;
    }

    /**
     * Inicializar schema com tabelas do tenant
     */
    private void executeSchemaInitialization(String schemaName) {
        // Executar cada CREATE TABLE com SET schema
        String[] tables = {
            "tb_atleta",
            "tb_plano_semanal",
            "tb_treino_planejado",
            "tb_treino_realizado",
            // ... outras tabelas
        };

        for (String table : tables) {
            String sql = getCreateTableSQL(table);
            sql = sql.replace("CREATE TABLE", "CREATE TABLE " + schemaName + ".");
            jdbcTemplate.execute(sql);
        }
    }

    /**
     * Deletar tenant (incluindo schema)
     */
    @Transactional
    public void deleteTenant(Long tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
            .orElseThrow();

        // 1. Marcar como deleted no public schema
        tenant.setStatus("DELETED");
        tenantRepository.save(tenant);

        // 2. Opcionalmente: dropar schema (com backup)
        // jdbcTemplate.execute("DROP SCHEMA " + tenant.getSchemaName() + " CASCADE");
    }
}
```

### 3. Schema Switching em Runtime

```java
// ConnectionPool com schema dinâmico
public class TenantAwareDataSourceProxy extends DataSource {

    @Override
    public Connection getConnection() throws SQLException {
        Connection conn = super.getConnection();

        String schemaName = TenantContextHolder.getSchemaName();
        conn.createStatement().execute(
            "SET search_path TO " + schemaName + ", public"
        );

        return conn;
    }
}
```

---

## SECURITY & ISOLATION

### 1. Validação de Acesso (CRÍTICO)

```java
// AuditAspect: Logar todas mutações com tenant
@Aspect
@Component
public class TenantAuditAspect {

    @Before("@annotation(Audit)")
    public void auditAccess(JoinPoint jp) {
        Long tenantId = TenantContextHolder.getTenantId();
        String operation = jp.getSignature().getName();

        log.info("TENANT[{}] OPERATION[{}]", tenantId, operation);
    }
}

// Interceptor: Validar isolamento em requests
@Component
public class TenantValidationInterceptor {

    @Before("@annotation(ValidateTenant)")
    public void validateTenant(JoinPoint jp, ValidateTenant annotation) {
        Long requestTenantId = TenantContextHolder.getTenantId();

        // Verificar que tenant ainda está ativo
        // Verificar que user ainda pertence ao tenant
        // Verificar que não há tentativa de trocar de tenant
    }
}
```

### 2. Row-Level Security (BACKUP)

```sql
-- Se usar RLS do PostgreSQL como camada adicional
ALTER TABLE tenant_001.tb_atleta ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_001.tb_atleta
    USING (current_setting('app.current_tenant_id')::bigint = tenant_id);

-- Sempre SET no connection:
-- SET app.current_tenant_id = '1';
```

---

## TESTES

### 1. Multi-Tenancy Test Setup (NOVO)

```java
@SpringBootTest
@Testcontainers
class MultiTenancyIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");

    @BeforeEach
    void setup() {
        // 1. Criar 2 tenants para teste
        Tenant tenant1 = createTestTenant("test-tenant-1");
        Tenant tenant2 = createTestTenant("test-tenant-2");

        // 2. Criar schemas
        jdbcTemplate.execute("CREATE SCHEMA IF NOT EXISTS " + tenant1.getSchemaName());
        jdbcTemplate.execute("CREATE SCHEMA IF NOT EXISTS " + tenant2.getSchemaName());

        // 3. Criar tables em cada schema
        initializeSchema(tenant1.getSchemaName());
        initializeSchema(tenant2.getSchemaName());
    }

    @Test
    void testTenantIsolation() {
        // 1. Criar atleta no tenant 1
        TenantContextHolder.setTenantContext(new TenantContext(1L, "test-1", "tenant_1"));
        Atleta atleta1 = atletaService.create(createAtletaRequest());

        // 2. Criar atleta no tenant 2
        TenantContextHolder.setTenantContext(new TenantContext(2L, "test-2", "tenant_2"));
        Atleta atleta2 = atletaService.create(createAtletaRequest());

        // 3. Voltar para tenant 1
        TenantContextHolder.setTenantContext(new TenantContext(1L, "test-1", "tenant_1"));

        // 4. Validar que vê apenas atleta1 (isolamento!)
        List<Atleta> atletas = atletaRepository.findAll();
        assert atletas.size() == 1;
        assert atletas.get(0).getId().equals(atleta1.getId());

        // 5. Validar que não consegue acessar atleta2
        assertThrows(ForbiddenException.class, () -> {
            atletaService.getById(atleta2.getId());
        });
    }

    @Test
    void testTenantSwitchFails() {
        // Tentar trocar de tenant na mesma request
        TenantContextHolder.setTenantContext(new TenantContext(1L, "test-1", "tenant_1"));

        String tokenOfTenant1 = jwtProvider.generateToken(..., 1L, ...);
        String tokenOfTenant2 = jwtProvider.generateToken(..., 2L, ...);

        // Request com token do tenant 2 mas contexto do tenant 1
        assertThrows(ForbiddenException.class, () -> {
            tenantInterceptor.preHandle(requestWithToken(tokenOfTenant2), ...);
        });
    }
}
```

---

## 🔄 IMPACTO NA SPRINT 1

### Nova Estrutura de Sprint 1

**ANTES:**
```
Sprint 1: Auth + Security (54h)
├─ 1.1 JWT Setup (16h)
├─ 1.2 Logout (8h)
├─ 1.3 Frontend Auth (16h)
├─ 1.4 Validation (8h)
└─ 1.5 Rate Limiting (6h)
```

**DEPOIS (COM MULTI-TENANCY):**
```
Sprint 1: Auth + Multi-Tenancy (72-80h)
├─ 1.1 JWT Setup (16h) ← MUDANÇA: adicionar tenant no token
├─ 1.2 Logout (8h) ← sem mudança
├─ 1.3 Frontend Auth (18h) ← MUDANÇA: adicionar tenant context
├─ 1.4 Validation (8h) ← sem mudança
├─ 1.5 Rate Limiting (6h) ← sem mudança
└─ [NOVO] 1.6 Multi-Tenancy Setup (18-20h)
    ├─ TenantResolver
    ├─ TenantInterceptor
    ├─ TenantContextHolder
    ├─ Database schema setup
    ├─ Migration: Add tenant tables
    └─ Testes de isolamento
```

**Total: +20-26 horas (~3-4 dias adicionais)**

### Novas User Stories

#### US 1.6: Multi-Tenancy Architecture

```
COMO:        Arquiteto
QUERO:       Implementar multi-tenancy desde o início
PARA:        Isolamento seguro de dados por tenant

Acceptance Criteria:
  ✅ JWT contém tenant_id e tenant_slug
  ✅ TenantResolver extrai tenant do token
  ✅ TenantInterceptor valida tenant em cada request
  ✅ TenantContextHolder mantém contexto por thread
  ✅ Services filtram automaticamente por tenant
  ✅ Database usa schema-per-tenant
  ✅ Não consegue acessar dados de outro tenant (403)
  ✅ Testes de isolamento passam

Tarefas:
  [ ] TenantResolver (4h)
  [ ] TenantInterceptor (4h)
  [ ] TenantContextHolder (2h)
  [ ] JWT com tenant info (3h)
  [ ] Database migrations (3h)
  [ ] Service layer updates (3h)
  [ ] Integration tests (4h)

Estimativa: 20h (2.5 dias)
Atribuição: Backend Dev #1 + #2 (paralelo)
Prioridade: 🔴 CRÍTICA (antes de qualquer feature)
```

---

## 📊 IMPACTO NAS OUTRAS FASES

### Release 1.1 (Beta) - Billing por Tenant

```
Sprint 5: Stripe Integration
└─ Checkout agora SABE qual tenant está pagando
   └─ stripe_customer_id por tenant
   └─ Subscription por tenant
   └─ Invoice com tenant info
```

### Release 2.0 (Público) - Múltiplos Usuários por Tenant

```
Sprint 9+: Team Management
└─ Cada tenant pode ter múltiplos usuários
   └─ Coach principal + assistentes
   └─ Roles: ADMIN, COACH, ATHLETE
   └─ Permissions por role
```

---

## ✅ Checklist de Multi-Tenancy

### Backend
- [ ] JWT com tenant_id + tenant_slug
- [ ] JwtProvider: generateToken com tenant
- [ ] TenantResolver: extrair e validar tenant
- [ ] TenantInterceptor: processar em cada request
- [ ] TenantContextHolder: ThreadLocal
- [ ] AuthService: retornar tenant no login
- [ ] DataSource: suportar schema dinâmico
- [ ] Services: filtrar por tenant automaticamente
- [ ] Entities: adicionar tenant_id
- [ ] Migrations: tb_tenant + schema creation
- [ ] Tests: validar isolamento de tenants
- [ ] Auditing: logar tenant em mutações

### Frontend
- [ ] useAuth: incluir user.tenantId e tenantSlug
- [ ] TenantContext (React): criar contexto
- [ ] Axios interceptor: adicionar X-Tenant-ID header
- [ ] useCrud: usar tenant do contexto
- [ ] ProtectedRoute: validar tenant no token
- [ ] DashboardHeader: mostrar tenant atual
- [ ] Tests: validar tenant context

### Database
- [ ] Criar tb_tenant (public schema)
- [ ] Adicionar tenant_id em tb_usuario
- [ ] Criar migração para schema creation
- [ ] Script para criar schemas de teste
- [ ] Backup/recovery plan por tenant

### Security
- [ ] Validar tenant em cada request
- [ ] Impossível acessar dados de outro tenant
- [ ] Impossível trocar de tenant mid-request
- [ ] Rate limiting por tenant (não por IP)
- [ ] Audit trail de acesso por tenant

---

## 🚨 Riscos de Multi-Tenancy

```
RISCO #1: Data Leak Entre Tenants
├─ Probabilidade: MEDIUM (fácil errar)
├─ Impact: CRITICAL (GDPR violation)
├─ Mitigation:
│  • Code review rigoroso
│  • Testes de isolamento obrigatórios
│  • Validação de tenant em CADA query
│  • Não confiar apenas em ThreadLocal

RISCO #2: Performance Degradation
├─ Probabilidade: LOW (schema isolation é rápido)
├─ Impact: MEDIUM (usuarios reclamam)
├─ Mitigation:
│  • Índices em tenant_id
│  • Connection pooling por schema
│  • Load test com múltiplos tenants

RISCO #3: Migration Complexity
├─ Probabilidade: MEDIUM (fazer schema para cada tenant é chato)
├─ Impact: MEDIUM (novo tenant não funciona)
├─ Mitigation:
│  • Automação de schema creation
│  • Template SQL bem testado
│  • Rollback procedure
```

---

## 🎯 Decisão de Implementação

### Opção 1: Adicionar Multi-Tenancy na Sprint 1
- **Custo:** +20-26 horas
- **Benefício:** Isolamento correto desde o início
- **Risco:** Mais complexo, pode atrasar
- **Recomendação:** ✅ FAZER (crucial para SaaS)

### Opção 2: Implementar Multi-Tenancy na Sprint 2
- **Custo:** +40-50 horas (mais refactor depois)
- **Benefício:** Sprint 1 mais simples
- **Risco:** Risco de data leak no staging
- **Recomendação:** ❌ NÃO (perigoso para produção)

### Opção 3: Single Tenant para MVP 1.0, Multi para MVP 1.1
- **Custo:** +30-40 horas (refactor em Sprint 5)
- **Benefício:** Entrega mais rápida
- **Risco:** Reescrever autenticação/autorização
- **Recomendação:** ⚠️ POSSÍVEL (se prazo é crítico)

**Recomendação Final:** ✅ **Opção 1 - Adicionar na Sprint 1**

---

## 🔗 Referências

- PostgreSQL Schemas: https://www.postgresql.org/docs/current/ddl-schemas.html
- SaaS Multi-Tenancy Patterns: https://aws.amazon.com/blogs/saas/
- Spring Security Multi-Tenant: https://spring.io/projects/spring-security

---

**Status:** 🟢 ARQUITETURA DEFINIDA

**Próximo Passo:** Atualizar PLANO_ENTREGAS.md Sprint 1 com multi-tenancy

---

**Documento Atualizado:** 28 de fevereiro de 2026
**Impacto:** REDEFINE Sprint 1 (+20-26 horas, +3-4 dias)
**Recomendação:** ✅ IMPLEMENTAR DESDE O INÍCIO

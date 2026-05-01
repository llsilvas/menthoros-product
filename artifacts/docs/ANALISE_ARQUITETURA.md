# Análise de Arquitetura - Projeto Menthoros

**Data:** 28 de fevereiro de 2026
**Escopo:** Análise completa de arquitetura e melhores práticas (Spring Boot + React + TypeScript)

---

## 📋 Sumário Executivo

O projeto **Menthoros** é uma aplicação full-stack bem estruturada para gerenciamento de planos de treinamento atlético com integração de IA. A arquitetura segue padrões modernos de desenvolvimento, com clara separação de responsabilidades e uso de tecnologias atualizadas.

**Status Geral:** ✅ Bom - com oportunidades de melhoria em escalabilidade, segurança e manutenibilidade.

---

## 1. Visão Geral do Projeto

### 1.1 Propósito

O Menthoros é um sistema de gestão de treinamento atlético que:
- Gerencia dados de atletas e planos de treinamento personalizados
- Integra IA (OpenAI GPT-4) para geração automática de planos de treinamento
- Rastreia métricas diárias (TSS, Recovery, VO2Max, Pace)
- Fornece análises e alertas baseados em dados
- Oferece interface web moderna e responsiva

### 1.2 Stack Tecnológico

**Backend:**
- Java 21 + Spring Boot 3.5.4
- PostgreSQL + pgvector (embeddings)
- Spring Data JPA + Hibernate
- Spring AI (OpenAI)
- Caffeine Cache

**Frontend:**
- React 19 + TypeScript
- Vite (bundler)
- Material-UI v7 + Emotion
- Axios + OpenAPI Codegen

**DevOps:**
- Docker + Docker Compose
- Railway (cloud deployment)
- GitHub Actions (CI/CD)
- JKube (Kubernetes)

### 1.3 Estrutura Geral

```
menthoros/
├── menthoros/               # Backend (Spring Boot)
├── menthoros-front/         # Frontend (React)
├── scripts/                 # Utilitários
└── docs/                    # Documentação (este arquivo)
```

---

## 2. Análise da Arquitetura Backend

### 2.1 Padrão Arquitetural ✅

**Arquitetura:** Layered (em camadas)

A arquitetura segue o padrão bem estabelecido:

```
Request/Response
        ↓
   CONTROLLER (REST API)
        ↓
   SERVICE (Business Logic)
        ↓
   HELPER (Specialized Calculations)
        ↓
   REPOSITORY (Data Access)
        ↓
   ENTITY (JPA/Database)
        ↓
   PostgreSQL
```

**Pontos Positivos:**
- Separação clara de responsabilidades
- Padrão Service-Helper permite complexidade matemática isolada
- DTOs segregados (input/output/llm) - boa prática
- Exception handlers centralizados

**Recomendações:**
- Considerar padrão CQRS para operações complexas de leitura no futuro
- Documentar a diferença entre Service e Helper no código

### 2.2 Controllers ✅

**Localização:** `com.menthoros.controller`

**Estrutura:**
```
AtletaController
├── POST /atleta              (create)
├── PUT /atleta/{id}          (update)
├── GET /atleta               (list)
├── GET /atleta/{id}          (get)
├── DELETE /atleta/{id}       (delete)
└── GET /atleta/{id}/...      (custom)

PlanoTreinoController
├── POST /planos/.../gerar          (generate plan)
├── POST /planos/.../gerar-enhanced (AI-enhanced)
├── GET /planos/{id}                (get)
└── DELETE /planos/{id}             (delete)
```

**Pontos Positivos:**
- RESTful bem estruturado
- OpenAPI/Swagger documentado
- Validação de entrada
- Global error handler

**Problemas Identificados:**

⚠️ **1. Falta de Versionamento de API**
```java
// Atual - sem versão
@RequestMapping("/atleta")

// Recomendado - com versão
@RequestMapping("/api/v1/atleta")
```

**Impacto:** Quebra de compatibilidade futura com clientes

**Solução:**
```java
@RequestMapping("/api/v1/atleta")
public class AtletaController { ... }

@RequestMapping("/api/v1/planos")
public class PlanoTreinoController { ... }
```

⚠️ **2. Falta de Paginação Explícita**
```java
// Atual
@GetMapping
public List<AtletaResponse> listAtletas() { ... }

// Recomendado
@GetMapping
public Page<AtletaResponse> listAtletas(
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size,
    @RequestParam(defaultValue = "id,desc") String[] sort
) { ... }
```

**Impacto:** Performance inadequada com grande volume de dados

⚠️ **3. Falta de Rate Limiting**
- Sem proteção contra abuso
- OpenAI API sem throttling

**Recomendado:** Adicionar Bucket4j para rate limiting

### 2.3 Services ✅

**Padrão:** Service Interface + Implementation

**Pontos Positivos:**
- Interfaces bem definidas
- Separação clara de responsabilidades
- Services especializados (AtletaService, PlanoService, IaService)

**Problemas Identificados:**

⚠️ **1. ServiceImpl Muito Grande**
```
Classes como PlanoServiceImpl podem ter >500 linhas
- Difícil manutenção
- Múltiplas responsabilidades
- Testabilidade reduzida
```

**Solução:** Quebrar em serviços menores:
```
PlanoServiceImpl
├── PlanoGenerationService (gerar planos)
├── PlanoValidationService (validar regras)
├── PlanoDistributionService (distribuir treinos)
└── PlanoPersistenceService (persistência)
```

⚠️ **2. Dependências Circulares Potenciais**
- IaService → PlanoService → TreinoService
- Difícil de rastrear

**Recomendação:** Documentar grafo de dependências

⚠️ **3. Tratamento de Erros Inconsistente**
```java
// Alguns métodos lançam exceção
// Outros retornam null
// Outros retornam Optional
```

**Padronizar:** Sempre usar `Optional<T>` para valores opcionais

### 2.4 Data Access (Repository) ✅

**Implementação:** Spring Data JPA

**Estrutura:**
```
BaseRepository (interface)
├── AtletaRepository
├── PlanoSemanalRepository
├── TreinoPlanejadoRepository
├── TreinoRealizadoRepository
├── MetricasDiariasRepository
└── ProvaRepository
```

**Pontos Positivos:**
- Extensão de JpaRepository (query por derivação)
- Separação clara por domínio

**Problemas Identificados:**

⚠️ **1. Falta de Queries Customizadas Documentadas**
```java
// Não está claro quais queries são N+1
// Não há otimização de fetch strategy
```

**Recomendação:**
```java
@Repository
public interface PlanoSemanalRepository extends JpaRepository<PlanoSemanal, Long> {

    // FIXME: N+1 problem - usar fetch join
    @Query("SELECT p FROM PlanoSemanal p WHERE p.atleta.id = :atletaId")
    List<PlanoSemanal> findByAtletaId(@Param("atletaId") Long atletaId);

    // Otimizado com join
    @Query("SELECT DISTINCT p FROM PlanoSemanal p " +
           "LEFT JOIN FETCH p.treinosPlanejados " +
           "WHERE p.atleta.id = :atletaId")
    List<PlanoSemanal> findByAtletaIdWithTrainings(@Param("atletaId") Long atletaId);
}
```

⚠️ **2. Falta de Índices de Banco de Dados**
```sql
-- Adicionar em migrations
CREATE INDEX idx_atleta_ativo ON tb_atleta(ativo);
CREATE INDEX idx_plano_atleta ON tb_plano_semanal(atleta_id);
CREATE INDEX idx_treino_data ON tb_treino_realizado(data_execucao);
CREATE INDEX idx_metricas_atleta_data ON tb_metricas_diarias(atleta_id, data);
```

### 2.5 Entities & Database ✅

**ORM:** Hibernate + JPA

**Modelagem:**
```
Atleta (1:N)
├── PlanoSemanal (1:N)
│   └── TreinoPlanejado (1:N)
│       └── EtapaTreino
├── TreinoRealizado (1:N)
│   └── EtapaRealizada
├── MetricasDiarias (1:N)
├── PlanoMetaDados (1:1)
└── Prova (N:M)
```

**Pontos Positivos:**
- Relacionamentos bem estruturados
- Soft delete implementado (ativo/inativo)
- Flyway para versionamento de schema
- pgvector para embeddings (vector search)

**Problemas Identificados:**

⚠️ **1. Falta de Validações em Nível de Banco**
```sql
-- Adicionar constraints
ALTER TABLE tb_atleta ADD CONSTRAINT chk_idade_valida
    CHECK (idade >= 0 AND idade <= 150);

ALTER TABLE tb_metricas_diarias ADD CONSTRAINT chk_fc_valida
    CHECK (fc_repouso > 0 AND fc_repouso < fc_max);
```

⚠️ **2. Sem Auditoria (created_at, updated_at, created_by)**
```java
@Entity
@Table(name = "tb_atleta")
@EntityListeners(AuditingEntityListener.class)
public class Atleta {
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime atualizadoEm;

    @Column(name = "criado_por")
    private String criadoPor;
}
```

⚠️ **3. Sem Versionamento Otimista**
```java
@Version
@Column(nullable = false)
private Long versao;  // Previne conflitos de atualização
```

### 2.6 Exception Handling ✅

**Implementação:** GlobalExceptionHandler (ControllerAdvice)

**Pontos Positivos:**
- Centralizado em um lugar
- Respostas estruturadas
- Mapeia exceptions para HTTP status apropriados

**Problemas Identificados:**

⚠️ **1. Logging Inadequado**
```java
// Atual - sem logging
@ExceptionHandler(LLMException.class)
public ResponseEntity<ErrorResponse> handleLLMException(LLMException ex) {
    return ResponseEntity.status(503).body(new ErrorResponse(...));
}

// Recomendado
@ExceptionHandler(LLMException.class)
public ResponseEntity<ErrorResponse> handleLLMException(LLMException ex) {
    log.error("LLM service error: {}", ex.getMessage(), ex);
    log.info("Request ID: {}", RequestContextHolder.getRequestAttributes()
        .getAttribute("requestId", RequestAttributes.SCOPE_REQUEST));
    return ResponseEntity.status(503).body(new ErrorResponse(...));
}
```

⚠️ **2. Sem Correlation ID para Rastreamento**
```java
// Adicionar em RequestInterceptor
@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request,
                           HttpServletResponse response, Object handler) {
        String correlationId = UUID.randomUUID().toString();
        MDC.put("correlationId", correlationId);
        response.addHeader("X-Correlation-ID", correlationId);
        return true;
    }
}
```

### 2.7 Cache ✅

**Implementação:** Caffeine Cache

**Configuração:**
```yaml
cache:
  expire-minutes: 30
```

**Pontos Positivos:**
- Simples e eficiente para uso local
- Reduz carga no banco de dados

**Problemas Identificados:**

⚠️ **1. Sem Invalidação de Cache**
```java
// Problema: dados obsoletos após atualização
@Cacheable("atletas")
public List<Atleta> listarTodos() { ... }

@CacheEvict(value = "atletas", allEntries = true)
public void createAtleta(CreateAtletaDto dto) { ... }
```

⚠️ **2. Sem Cache de Distribuído**
- Se escalar para múltiplas instâncias, cache não sincroniza
- Recomendação: Redis para ambientes em produção

### 2.8 Integração com OpenAI ✅

**Implementação:** Spring AI

**Pontos Positivos:**
- Abstração limpa via OpenAPI config
- PromptBuilder pattern para construção de prompts
- Async support via thread pool

**Problemas Identificados:**

⚠️ **1. Sem Retry Logic**
```java
// Recomendado: Adicionar @Retryable do Spring
@Service
public class IaServiceImpl implements IaService {
    @Retryable(
        value = { OpenAiHttpException.class },
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2)
    )
    public String gerarPlanoTreino(PlanoDto dto) { ... }
}
```

⚠️ **2. Sem Circuit Breaker**
```java
// Recomendado: Adicionar Resilience4j
@CircuitBreaker(
    name = "openaiService",
    fallbackMethod = "fallbackPlanGeneration"
)
public String gerarPlanoTreino(PlanoDto dto) { ... }
```

⚠️ **3. Tokens/Custo Não Rastreado**
```java
// Adicionar tracking
@Service
public class IaServiceImpl {
    @Autowired
    private CostTrackingService costTracker;

    public String gerarPlanoTreino(PlanoDto dto) {
        var response = chatClient.call(...);
        costTracker.logTokenUsage(response.getTokenUsage());
        return response.getContent();
    }
}
```

### 2.9 Segurança ⚠️

**Status Atual:** Configuração Básica

**Problemas Identificados:**

⚠️ **1. Sem Autenticação/Autorização**
- Endpoints públicos sem proteção
- Falta de JWT/OAuth2
- CORS aberto demais

**Recomendação Crítica:**
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf().disable()
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/api/v1/docs/**").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.decoder(jwtDecoder()))
            );
        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withPublicKey(publicKey()).build();
    }
}
```

⚠️ **2. CORS Muito Permissivo**
```yaml
# Atual
cors:
  allowed-origins: "*"
  allowed-headers: "*"

# Recomendado
cors:
  allowed-origins: "https://menthoros.example.com"
  allowed-headers: "Content-Type,Authorization"
  allowed-methods: "GET,POST,PUT,DELETE"
  max-age: 3600
```

⚠️ **3. Credenciais em Variáveis de Ambiente Sem Validação**
```java
// Recomendado: Validar em startup
@Configuration
public class SecurityPropertiesValidator implements InitializingBean {
    @Value("${OPENAI_API_KEY:}")
    private String openaiApiKey;

    @Override
    public void afterPropertiesSet() throws Exception {
        if (openaiApiKey.isBlank()) {
            throw new IllegalStateException(
                "OPENAI_API_KEY environment variable is required"
            );
        }
    }
}
```

⚠️ **4. Sem Proteção Contra Injection**
```java
// CUIDADO: Construção dinâmica de prompts
String prompt = "Gere plano para " + atletaNome;  // ❌ Injection risk

// Recomendado: Use templates
String prompt = promptTemplate.formatted(
    "Gere plano para %s",
    sanitizeInput(atletaNome)
);
```

### 2.10 Testes ⚠️

**Status:** Não verificado completamente

**Recomendações:**

```java
// Adicionar testes unitários
@Test
public void testGerarPlanoTreinoPlanoDiasDiferentesDaAtletaDeve() {
    // Arrange
    AtletaDTO atleta = criarAtletaTeste();
    PlanoGeracaoDTO plano = new PlanoGeracaoDTO(...);

    // Act
    PlanoResponse resultado = planoService.gerarPlano(atleta, plano);

    // Assert
    assertThat(resultado.getTreinos()).hasSize(7);
    assertThat(resultado.getTreinos())
        .extracting("diaSemana")
        .containsOnlyOnceElementsOf(atletaDiasDiaporivens());
}

// Adicionar testes de integração
@SpringBootTest
@Testcontainers
class PlanoIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(...);

    @Test
    void testGeneratePlanWithRealDatabase() { ... }
}
```

### 2.11 Documentação ⚠️

**Pontos Positivos:**
- OpenAPI/Swagger configurado
- Accessible em `/swagger-ui.html`

**Problemas:**

⚠️ **Falta Documentação de Código**
```java
// Adicionar JavaDoc
/**
 * Gera um plano de treinamento personalizado baseado no histórico
 * e características fisiológicas do atleta.
 *
 * @param atletaId ID do atleta
 * @param estrategia {@link EstrategiaGeracao} - CURRENT ou NEXT_WEEK
 * @return {@link PlanoSemanalResponse} plano semanal gerado
 * @throws AtletaNotFoundException se atleta não existe
 * @throws LLMException se falha ao chamar OpenAI
 */
public PlanoSemanalResponse gerarPlano(Long atletaId, EstrategiaGeracao estrategia) { ... }
```

---

## 3. Análise da Arquitetura Frontend

### 3.1 Padrão Arquitetural ✅

**Arquitetura:** Component-Based + Custom Hooks

```
App (Route Provider)
├── DashboardLayout (Layout wrapper)
│   ├── DashboardHeader (Top nav)
│   ├── DashboardSidebar (Left nav)
│   └── <Page> (Content)
│       ├── <Features> (Dialogs, Cards)
│       └── <Common> (Reusable)
```

**Pontos Positivos:**
- Componentes bem separados por responsabilidade
- Padrão container/presentational embrionário
- Custom hooks para lógica de dados

**Recomendações:**
- Documentar quando usar Context vs Hooks
- Padronizar naming de componentes

### 3.2 Components ✅

**Estrutura:**
```
components/
├── dashboard/        (Layout - alta reutilização)
├── features/         (Feature-specific components)
├── common/          (Truly reusable UI atoms)
```

**Pontos Positivos:**
- Separação clara de responsabilidades
- Components menores e focados

**Problemas Identificados:**

⚠️ **1. Falta de Prop Typing**
```typescript
// Atual - sem tipos completos
interface AtletaDialogProps {
    open: boolean;
    onClose: () => void;
    // Falta: onSave, data, error, loading
}

// Recomendado
interface AtletaDialogProps {
    open: boolean;
    isLoading?: boolean;
    error?: string | null;
    atleta?: Atleta | null;
    mode: 'create' | 'edit';
    onClose: () => void;
    onSave: (atleta: CreateAtletaDTO) => Promise<void>;
}
```

⚠️ **2. Sem Validação de Props**
```typescript
// Adicionar PropTypes ou TypeScript mais estrito
import PropTypes from 'prop-types';

AtletaDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    mode: PropTypes.oneOf(['create', 'edit']).isRequired,
    onClose: PropTypes.func.isRequired,
};
```

⚠️ **3. Components Muito Grandes**
- AtletasList provavelmente >300 linhas
- Difícil de testar
- Mistura lógica com apresentação

**Solução:** Dividir em sub-components:
```typescript
// Novo: AtletasFilters.tsx
const AtletasFilters = ({ filters, onChange }) => { ... }

// Novo: AtletasTable.tsx
const AtletasTable = ({ atletas, onEdit, onDelete }) => { ... }

// Refatorado: AtletasList.tsx (componente container)
const AtletasList = () => {
    const [filters, setFilters] = useState(...);
    const { atletas, loading } = useAtletas(filters);
    return (
        <>
            <AtletasFilters filters={filters} onChange={setFilters} />
            <AtletasTable atletas={atletas} />
        </>
    );
}
```

### 3.3 State Management ⚠️

**Implementação Atual:**
- Context API (AuthContext)
- React Hooks (useState, useEffect)
- Custom useCrud hook

**Problemas Identificados:**

⚠️ **1. Sem Centralização de Estado Global**
```typescript
// Problema: Estado distribuído em hooks
const [atletas, setAtletas] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

// Recomendado: Centralizar com Redux Toolkit ou Zustand
import { create } from 'zustand';

interface AtletasStore {
    atletas: Atleta[];
    loading: boolean;
    error: string | null;
    fetchAtletas: () => Promise<void>;
    addAtleta: (atleta: Atleta) => void;
}

const useAtletasStore = create<AtletasStore>((set) => ({
    atletas: [],
    loading: false,
    error: null,
    fetchAtletas: async () => {
        set({ loading: true });
        try {
            const data = await api.atletas();
            set({ atletas: data, error: null });
        } catch (err) {
            set({ error: err.message });
        } finally {
            set({ loading: false });
        }
    },
    addAtleta: (atleta) => set((state) => ({
        atletas: [...state.atletas, atleta]
    }))
}));
```

⚠️ **2. useCrud Hook Muito Genérico**
```typescript
// Problema: Tudo em um hook
const { atletas, loading, error, createAtleta, updateAtleta, deleteAtleta } = useCrud();

// Melhor: Hooks específicos
const useAtletas = () => { /* apenas read */ };
const useCreateAtleta = () => { /* apenas create */ };
const useUpdateAtleta = () => { /* apenas update */ };
const useDeleteAtleta = () => { /* apenas delete */ };

// Ou com Tanstack Query
const atletas = useQuery({
    queryKey: ['atletas'],
    queryFn: () => api.atletas(),
});

const createMutation = useMutation({
    mutationFn: (data) => api.createAtleta(data),
    onSuccess: () => atletas.refetch(),
});
```

⚠️ **3. Sem Error Boundary**
```typescript
// Adicionar Error Boundary
class AtletasErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error?: Error }
> {
    state = { hasError: false };

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Erro em Atletas:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} />;
        }
        return this.props.children;
    }
}
```

### 3.4 API Integration ⚠️

**Implementação Atual:**
- OpenAPI Codegen (auto-generated clients)
- Axios como HTTP client

**Pontos Positivos:**
- Tipo-seguro via codegen
- Clientes gerados automaticamente

**Problemas Identificados:**

⚠️ **1. Sem Interceptadores de Erro Globais**
```typescript
// Adicionar em OpenAPI config
const apiClient = new OpenAPI({
    BASE: process.env.VITE_API_URL,
    HEADERS: {
        'Authorization': `Bearer ${token}`
    },
    INTERCEPTORS: {
        request: async (request) => {
            request.headers['X-Request-ID'] = uuid();
            return request;
        },
        response: async (response) => {
            if (response.status === 401) {
                // Logout automático
                window.location.href = '/login';
            }
            return response;
        }
    }
});
```

⚠️ **2. Sem Retry Automático**
```typescript
// Usar Tanstack Query ou axios-retry
import axiosRetry from 'axios-retry';

axiosRetry(axiosInstance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        error.response?.status === 503
});
```

⚠️ **3. Sem Request Debouncing**
```typescript
// Adicionar debounce em buscas
import { useMemo } from 'react';
import { debounce } from 'lodash-es';

const useSearchAtletas = () => {
    const [query, setQuery] = useState('');

    const debouncedSearch = useMemo(
        () => debounce((q: string) => {
            api.searchAtletas(q);
        }, 300),
        []
    );

    return { query, setQuery, debouncedSearch };
};
```

### 3.5 Hooks Customizados ✅

**Pontos Positivos:**
- `useCrud` - CRUD genérico
- `useAtletas` - read-only athletes
- `useTreinoRealizado` - training tracking
- `usePlanoSemanal` - plan management

**Problemas:**

⚠️ **1. Sem Documentação de Hooks**
```typescript
/**
 * Hook customizado para gerenciar operações CRUD de atletas
 *
 * @returns {Object}
 *   - atletas: Atleta[]
 *   - loading: boolean
 *   - error: string | null
 *   - createAtleta: (dto: CreateAtletaDTO) => Promise<Atleta>
 *   - updateAtleta: (id: string, dto: UpdateAtletaDTO) => Promise<Atleta>
 *   - deleteAtleta: (id: string) => Promise<void>
 */
export function useCrud() { ... }
```

⚠️ **2. Sem Testes de Hooks**
```typescript
// Adicionar testes
import { renderHook, act } from '@testing-library/react';

describe('useCrud', () => {
    it('should create athlete', async () => {
        const { result } = renderHook(() => useCrud());

        await act(async () => {
            await result.current.createAtleta({ nome: 'João' });
        });

        expect(result.current.atletas).toHaveLength(1);
    });
});
```

### 3.6 Styling & Design System ✅

**Implementação:**
- Material-UI v7
- Emotion (CSS-in-JS)
- Glassmorphism design
- Design tokens centralizados

**Pontos Positivos:**
- Design system coeso
- Tema consistente
- Dark mode suportado
- Glassmorphism bem implementado

**Problemas Identificados:**

⚠️ **1. Sem CSS Utilities Padronizadas**
```typescript
// Adicionar em theme/utilities.ts
export const flexCenter = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

export const flexBetween = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
};

// Uso
<Box sx={{ ...flexBetween, mt: 2 }}>
```

⚠️ **2. Sem Breakpoints Padronizados**
```typescript
// Adicionar responsive design utilities
export const useResponsive = () => {
    return {
        isXs: useMediaQuery(theme.breakpoints.down('sm')),
        isSm: useMediaQuery(theme.breakpoints.down('md')),
        isMd: useMediaQuery(theme.breakpoints.down('lg')),
    };
};

// Uso
const { isXs, isSm } = useResponsive();
<Box sx={{ display: isXs ? 'block' : 'none' }}>
```

⚠️ **3. Hard-coded Colors Fora dos Tokens**
```typescript
// Encontrar e refatorar hard-coded colors
// De: backgroundColor: '#0e3147'
// Para: backgroundColor: theme.palette.primary.main
```

### 3.7 Routing ✅

**Implementação:** React Router v7

**Pontos Positivos:**
- Hash routing (simples para SPA)
- Estrutura clara de rotas

**Problemas Identificados:**

⚠️ **1. Sem Lazy Loading de Rotas**
```typescript
// Antes
import AtletasList from './pages/atletas/AtletasList';
import HomePage from './pages/home/HomePage';

// Depois (code-splitting)
const AtletasList = lazy(() =>
    import('./pages/atletas/AtletasList').then(m => ({
        default: m.AtletasList
    }))
);

const HomePage = lazy(() =>
    import('./pages/home/HomePage').then(m => ({
        default: m.HomePage
    }))
);

// Com Suspense
<Suspense fallback={<LoadingScreen />}>
    <Outlet />
</Suspense>
```

⚠️ **2. Sem Rota de Not Found**
```typescript
const routes = [
    { path: '/', element: <HomePage /> },
    { path: '/atletas', element: <AtletasList /> },
    // ...
    { path: '*', element: <NotFoundPage /> }  // Adicionar
];
```

⚠️ **3. Sem Proteção de Rotas Autenticadas**
```typescript
// Adicionar ProtectedRoute
interface ProtectedRouteProps {
    element: React.ReactElement;
    requiredRole?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    element,
    requiredRole
}) => {
    const { isAuthenticated, user } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requiredRole && !requiredRole.includes(user?.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return element;
};
```

### 3.8 Performance ⚠️

**Problemas Identificados:**

⚠️ **1. Sem Memoização**
```typescript
// Adicionar React.memo para componentes pesados
const AtletasTable = React.memo(({ atletas, onEdit }) => {
    return (
        <Table>
            {atletas.map(atleta => (
                <TableRow key={atleta.id}>
                    {/* ... */}
                </TableRow>
            ))}
        </Table>
    );
});

// Adicionar useMemo para cálculos
const filteredAtletas = useMemo(
    () => atletas.filter(a => a.nome.includes(searchTerm)),
    [atletas, searchTerm]
);
```

⚠️ **2. Sem useCallback para Callbacks**
```typescript
// Antes: função recriada a cada render
const handleDelete = (id: string) => {
    api.deleteAtleta(id);
};

// Depois
const handleDelete = useCallback((id: string) => {
    api.deleteAtleta(id);
}, []);
```

⚠️ **3. Sem Virtual Scrolling para Listas Grandes**
```typescript
// Se houver muitos atletas, usar react-window
import { FixedSizeList } from 'react-window';

const AtletasVirtualList = ({ atletas }) => (
    <FixedSizeList
        height={600}
        itemCount={atletas.length}
        itemSize={50}
        width="100%"
    >
        {({ index, style }) => (
            <Box style={style}>
                {atletas[index].nome}
            </Box>
        )}
    </FixedSizeList>
);
```

### 3.9 Testes ⚠️

**Status:** Não configurado

**Recomendação:**
```typescript
// Configurar Vitest + React Testing Library

// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
});

// Exemplo de teste
describe('AtletasList', () => {
    it('should display list of athletes', async () => {
        const { getByText } = render(<AtletasList />);

        await waitFor(() => {
            expect(getByText('João Silva')).toBeInTheDocument();
        });
    });
});
```

### 3.10 Segurança ⚠️

**Problemas:**

⚠️ **1. Sem Proteção CSRF**
```typescript
// Adicionar CSRF token
const useCSRFToken = () => {
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/csrf-token')
            .then(res => res.json())
            .then(data => setToken(data.token));
    }, []);

    return token;
};

// Usar em requests
const csrfToken = useCSRFToken();
api.post('/api/v1/atleta', data, {
    headers: { 'X-CSRF-Token': csrfToken }
});
```

⚠️ **2. Sem Sanitização de HTML**
```typescript
// Adicionar DOMPurify
import DOMPurify from 'dompurify';

const SafeHTML = ({ html }: { html: string }) => (
    <Box
        dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(html)
        }}
    />
);
```

⚠️ **3. Sem Validation no Frontend (além de TypeScript)**
```typescript
// Adicionar Zod ou Yup
import { z } from 'zod';

const AtletaSchema = z.object({
    nome: z.string().min(3, 'Mínimo 3 caracteres'),
    idade: z.number().min(0).max(150),
    email: z.string().email('Email inválido'),
});

const AtletaDialog = () => {
    const form = useForm({
        resolver: zodResolver(AtletaSchema),
    });

    return <form onSubmit={form.handleSubmit(onSubmit)}></form>;
};
```

### 3.11 Documentação ⚠️

**Problemas:**

⚠️ **Falta de Documentação**
- Sem Storybook para componentes
- Sem JSDoc em componentes
- Sem README para features

**Recomendação:**
```bash
# Adicionar Storybook
npm install -D @storybook/react @storybook/addon-essentials
npx storybook@latest init
```

```typescript
// src/components/AtletaDialog.stories.ts
import type { Meta, StoryObj } from '@storybook/react';
import { AtletaDialog } from './AtletaDialog';

const meta: Meta<typeof AtletaDialog> = {
    component: AtletaDialog,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
    args: {
        open: true,
        mode: 'create',
        onClose: () => {},
        onSave: async () => {},
    },
};
```

---

## 4. Problemas Críticos (Must Fix)

### 4.1 Segurança 🔴

| Problema | Severidade | Solução |
|----------|-----------|---------|
| Sem autenticação/autorização | CRÍTICA | Implementar OAuth2/JWT |
| Sem rate limiting | ALTA | Bucket4j no backend |
| CORS muito aberto | ALTA | Restringir a domínios específicos |
| Sem validação de entrada no backend | ALTA | Bean Validation (@Valid) |
| Sem proteção CSRF | ALTA | CSRF token + filter |

### 4.2 Performance 🔴

| Problema | Severidade | Solução |
|----------|-----------|---------|
| Sem paginação | ALTA | Implementar Page<T> |
| N+1 queries | ALTA | Usar @Query com fetch join |
| Sem índices de BD | ALTA | Criar índices nas chaves estrangeiras |
| Sem cache distribuído | MÉDIA | Migrar para Redis |
| Sem code-splitting no frontend | MÉDIA | Lazy load rotas |

### 4.3 Qualidade 🟡

| Problema | Severidade | Solução |
|----------|-----------|---------|
| Sem testes | ALTA | Adicionar JUnit5 + Mockito (80% coverage) |
| Sem retry/circuit breaker na IA | MÉDIA | Resilience4j |
| Sem logging estruturado | MÉDIA | SLF4J + logback |
| Sem versionamento de API | MÉDIA | `/api/v1/` paths |

---

## 5. Recomendações por Prioridade

### 5.1 SPRINT 1: Segurança (1-2 semanas)

```
[ ] Implementar autenticação JWT
    - Adicionar Spring Security
    - Criar controller /auth/login
    - Validar token em requests

[ ] CORS restritivo
    - Restringir allowed-origins
    - Remover wildcard headers

[ ] Validação de entrada
    - @Valid em controllers
    - Custom validators

[ ] Rate limiting
    - Bucket4j
    - 100 req/min por IP
```

### 5.2 SPRINT 2: Performance (1-2 semanas)

```
[ ] Paginação
    - Page<T> em listagens
    - Padrão: 20 itens/página

[ ] Otimização de queries
    - Audit com P6Spy
    - Adicionar fetch joins

[ ] Índices de BD
    - Migrations com índices

[ ] Caching distribuído
    - Redis setup
    - Cache invalidation strategy
```

### 5.3 SPRINT 3: Qualidade (1-2 semanas)

```
[ ] Testes unitários (80% coverage)
    - Service tests
    - Helper tests

[ ] Testes de integração
    - Testcontainers
    - API integration tests

[ ] Logging estruturado
    - SLF4J + logback JSON
    - Correlation IDs
```

### 5.4 SPRINT 4: API & Frontend (1 semana)

```
[ ] Versionamento de API
    - /api/v1/ paths

[ ] Lazy loading no frontend
    - Code-splitting de rotas

[ ] Memoização
    - React.memo em listas
    - useMemo/useCallback

[ ] Error Boundaries
    - Componentes com fallbacks
```

---

## 6. Estrutura de Pastas Recomendada

### Backend (Proposto)

```
menthoros/
├── src/main/java/com/menthoros/
│   ├── api/
│   │   ├── controller/
│   │   ├── dto/
│   │   │   ├── request/
│   │   │   ├── response/
│   │   │   └── mapper/
│   │   └── exception/
│   ├── domain/
│   │   ├── model/ (entities)
│   │   ├── repository/
│   │   └── value/
│   ├── application/
│   │   ├── service/
│   │   │   ├── interface/
│   │   │   ├── impl/
│   │   │   └── helper/
│   │   └── validator/
│   ├── infrastructure/
│   │   ├── config/
│   │   ├── persistence/
│   │   ├── cache/
│   │   └── integration/ (OpenAI)
│   ├── shared/
│   │   ├── constant/
│   │   ├── util/
│   │   └── converter/
│   └── MenthorosApplication.java
├── src/test/
│   ├── java/com/menthoros/
│   │   ├── integration/
│   │   ├── unit/
│   │   └── fixtures/
│   └── resources/
├── src/main/resources/
│   ├── db/migration/
│   ├── prompts/
│   └── application*.yml
└── docker/
```

### Frontend (Proposto)

```
menthoros-front/
├── src/
│   ├── api/
│   │   ├── client/ (OpenAPI generated)
│   │   ├── config.ts
│   │   └── interceptors.ts
│   ├── features/
│   │   ├── atletas/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   ├── types/
│   │   │   └── services/
│   │   ├── planos/
│   │   ├── treinos/
│   │   └── dashboard/
│   ├── shared/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── constants/
│   │   └── types/
│   ├── theme/
│   │   ├── tokens.ts
│   │   ├── utilities.ts
│   │   └── index.ts
│   ├── layout/
│   ├── router/
│   ├── context/
│   ├── store/ (Redux ou Zustand)
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── .storybook/
├── vite.config.ts
└── vitest.config.ts
```

---

## 7. Dependências Recomendadas

### Backend - Segurança & Qualidade

```xml
<!-- Segurança -->
<dependency>
    <groupId>org.springframework.security</groupId>
    <artifactId>spring-security-oauth2-resource-server</artifactId>
</dependency>
<dependency>
    <groupId>com.nimbusds</groupId>
    <artifactId>nimbus-jose-jwt</artifactId>
</dependency>

<!-- Rate Limiting -->
<dependency>
    <groupId>com.github.vladimir-bukhtoyarov</groupId>
    <artifactId>bucket4j-core</artifactId>
    <version>7.10.0</version>
</dependency>

<!-- Resilience -->
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot3</artifactId>
</dependency>

<!-- Logging -->
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
</dependency>

<!-- Testes -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>postgresql</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```

### Frontend - Qualidade & Testing

```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@vitest/ui": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0",
    "react-hook-form": "^7.47.0",
    "dompurify": "^3.0.6",
    "axios-retry": "^2.8.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "react-window": "^8.8.0",
    "react-error-boundary": "^4.0.0",
    "@storybook/react": "^7.5.0",
    "@storybook/addon-essentials": "^7.5.0"
  }
}
```

---

## 8. Métricas de Sucesso

| Métrica | Meta | Frequência |
|---------|------|-----------|
| Code Coverage | ≥80% | Diário (CI/CD) |
| Response Time | <200ms p95 | Semanal |
| Uptime | 99.5% | Mensal |
| OWASP Top 10 Vulnerabilities | 0 | Mensal (scanning) |
| Número de Exceções não Tratadas | <5/dia | Diário |
| LightHouse Score | ≥80 | Semanal |
| Bundle Size | <200KB gzip | Semanal |

---

## 9. Checklist de Implementação

### Backend

- [ ] Autenticação JWT/OAuth2
- [ ] Rate limiting
- [ ] Validação de entrada (@Valid)
- [ ] Paginação em listagens
- [ ] Otimização de queries (N+1)
- [ ] Índices de BD
- [ ] Cache distribuído (Redis)
- [ ] Retry/Circuit breaker (Resilience4j)
- [ ] Logging estruturado
- [ ] Correlação IDs
- [ ] Testes (Unit + Integration 80%)
- [ ] API versioning (/api/v1/)
- [ ] CORS restritivo
- [ ] Error handling padronizado
- [ ] Documentação JavaDoc

### Frontend

- [ ] Lazy loading de rotas
- [ ] React.memo em componentes pesados
- [ ] useMemo/useCallback
- [ ] Error Boundaries
- [ ] Validação de formulários (Zod + React Hook Form)
- [ ] Sanitização de HTML (DOMPurify)
- [ ] Retry automático (axios-retry)
- [ ] Request debouncing
- [ ] Virtual scrolling (listas grandes)
- [ ] Testes (Vitest 80%)
- [ ] Storybook
- [ ] Performance profiling
- [ ] CSRF protection
- [ ] Proteção de rotas autenticadas
- [ ] Logging do cliente

---

## 10. Próximos Passos

### Imediato (Esta semana)

1. Criar branch de segurança
2. Implementar autenticação básica (JWT)
3. Adicionar validação de entrada
4. Setup de testes (JUnit5 + Vitest)

### Curto prazo (1 mês)

1. SPRINT 1-2: Implementar todas as melhorias críticas
2. Adicionar monitoramento (Prometheus + Grafana)
3. Setup de CI/CD com validação de qualidade

### Médio prazo (2-3 meses)

1. Migração para Redis (cache distribuído)
2. Implementar CQRS para relatórios complexos
3. Adotar Zustand para estado global
4. Adicionar testes E2E (Cypress/Playwright)

### Longo prazo (>3 meses)

1. Microsserviços (opcional, se escala for necessária)
2. Event sourcing (traceabilidade de eventos)
3. GraphQL (se necessário resolver over-fetching)
4. Mobile app (React Native)

---

## Conclusão

O projeto Menthoros tem uma **base sólida** com boas práticas de arquitetura. As principais oportunidades de melhoria estão em:

1. **Segurança** (crítico) - Implementar autenticação/autorização
2. **Performance** (alta) - Paginação, otimização de queries
3. **Qualidade** (média) - Testes, logging, resiliência

Com a implementação das recomendações deste documento, o projeto estará alinhado com **melhores práticas atuais** de desenvolvimento web em produção.

---

**Autor:** Análise de Arquitetura Automatizada
**Data:** 28 de fevereiro de 2026
**Versão:** 1.0

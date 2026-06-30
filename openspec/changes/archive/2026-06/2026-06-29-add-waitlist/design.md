## Context

O Menthoros está em pré-lançamento. A landing (`marketing-landing-page`) comunica o produto mas não
captura interesse; os CTAs levam ao dashboard interno, sem porta de entrada para quem ainda não tem
conta. Esta change adiciona uma **waitlist pública** — a fatia vertical mínima que liga a landing à
captação do beta fechado: uma tabela, um endpoint público e uma página de formulário.

A persona primária do produto é o **treinador**. A waitlist segmenta treinador vs. atleta para priorizar
convites de teste à persona que mais importa.

> Este design incorpora os achados da revisão de produto (lente do treinador) e da pré-mortem
> adversarial cross-model (Codex), ambas verificadas contra o código real do backend/frontend.

## Goals / Non-Goals

**Goals**

- Capturar interessados (nome, e-mail, telefone opcional, perfil, faixa de atletas) de forma pública.
- Persistir no domínio Menthoros (PostgreSQL) com idempotência por e-mail resiliente a concorrência.
- Página `/waitlist` no tema do produto, responsiva, com aviso LGPD e tela de confirmação.
- Repontar os CTAs de conversão da landing para a waitlist sem quebrar "Entrar".
- Anti-abuso de MVP: honeypot + rate-limit leve por IP.

**Non-Goals**

- E-mail de confirmação / double opt-in.
- Tela de admin ou endpoint de listagem/export (consulta é direta no banco no MVP).
- CAPTCHA/Turnstile, integração real com UTM/CRM.
- Qualquer escrita tenant-scoped ou relação com `tb_usuario`.

## Decisions

### D0 — Construir no stack vs. ferramenta externa

**Decisão: construir no próprio stack.** Justificativa: dados no PostgreSQL desde o início (para cruzar
com usuários futuros e segmentar o beta), branding consistente com o produto e base para rastreamento de
`origem`/UTM. Alternativas (Tally, Google Forms, Mailchimp) entrariam no ar em horas sem tocar nos repos,
mas deixariam os dados fora do domínio e sem identidade visual — descartadas para esta fase. O custo
adicional (endpoint público a proteger) é mitigado por D1/D3/D4.

### D1 — Endpoint público e isolamento de tenant

`POST /api/v1/waitlist` — segue a convenção `/api/v1/` mandatória do módulo (como `/api/v1/status`, que
também é público). O path é adicionado a `CoreSecurityProperties.publicPaths` (`permitAll`). Para
requisições **anônimas** (sem `Authorization`) o `JwtTenantFilter` já passa direto (só processa quando há
JWT válido). **Porém**, `JwtTenantFilter.shouldNotFilter()` hoje só ignora `/api/admin/` — um usuário
**autenticado** que navegue para `/waitlist` (com o token injetado globalmente pelo client OpenAPI)
cairia na exigência de `tenant_id`. Mitigação: **incluir `/api/v1/waitlist` em `shouldNotFilter()`** para
garantir que o caminho público nunca dependa de tenant, com ou sem token. (Sem novo `SecurityFilterChain`
— apenas a linha do filtro.)

**CORS:** `CorsConfig` lê `app.cors.allowed-origins` (default localhost). A origem da landing **deve**
estar em `CORS_ALLOWED_ORIGINS` (env, sem hardcode no código), senão o preflight `OPTIONS` de um `POST`
JSON falha. Por ora a origem liberada é a **URL atual do frontend no Railway** (serviço front,
padrão `https://<front-service>.up.railway.app`), confirmada do domínio do serviço no deploy; um domínio
custom de produção é **adicionado ao mesmo env** quando existir (tarefa de devops, não bloqueia código).
Testes de CORS usam uma origem de teste, não a real.

### D2 — Entidade própria, sem herança de base

**`Waitlist` é um `@Entity` simples** que declara o próprio `@Id @GeneratedValue(strategy = UUID)`,
seguindo o padrão das entidades reais (ex.: `Atleta`). **Não** estende `BaseEntity` (classe órfã, sem
`@MappedSuperclass` — Hibernate falharia no boot por id não reconhecido) **nem** `AuditableEntity` (é
`@MappedSuperclass` mas adiciona `created_by`/`updated_by` via `AuditingEntityListener` — desnecessário
e ruidoso para um insert sem `Authentication`). `createdAt` é `Instant` com default `Instant.now()` (coluna `TIMESTAMPTZ DEFAULT NOW()`).

### D3 — Idempotência por e-mail resiliente a concorrência

Normalização: `email_normalized` = `trim` + lowercase `Locale.ROOT`, persistida em coluna própria com
**índice único** (`uk_waitlist_email_normalized`) — não depender de `lower()` + collation do Postgres.
Fast-path: `existsByEmailNormalized` evita a maioria dos casos. **Mas** `existsBy` + `insert` tem janela
de corrida; o `GlobalExceptionHandler` **não** trata `DataIntegrityViolationException` como idempotente.
Portanto o `WaitlistService` **captura explicitamente** a violação do índice único e a converte em
resposta idempotente `200` ("já está na lista"). (Alternativa equivalente: `INSERT ... ON CONFLICT DO
NOTHING` via query nativa.)

### D4 — Anti-abuso: honeypot + rate-limit leve por IP

1. **Honeypot** `website` (campo oculto): se preenchido, descarta silenciosamente e responde como
   sucesso (bot não percebe rejeição).
2. **Rate-limit por IP** num filtro/interceptor leve usando **Caffeine** (já é dependência — sem
   bucket4j/resilience4j): **5 submissões por minuto por IP** (janela deslizante) sobre `POST
   /api/v1/waitlist`; excedente → `429 Too Many Requests`. Valor exposto via propriedade de
   configuração (ex.: `app.waitlist.rate-limit.per-minute=5`) para ajuste sem redeploy de código. Fecha o
   vetor de loop de `curl` que o honeypot não pega. CAPTCHA/Turnstile fica como follow-up.

### D5 — Rota dedicada `/waitlist`

Página própria **fora de `ProtectedRoute`**, irmã de `/` e `/auth/login` no `createHashRouter`. Link
compartilhável; os CTAs da landing navegam para ela. Risco registrado pela pré-mortem: se adicionada por
engano dentro do bloco `ProtectedRoute`, o visitante seria redirecionado ao login — coberto por teste de
render sem token.

### D6 — Campo "qtd de atletas" condicional ao perfil

Renderizado só quando `perfil = TREINADOR`. No backend é opcional e nulo para atleta. Faixas: `ATE_10`,
`DE_11_A_30`, `DE_31_A_100`, `MAIS_DE_100`.

### D7 — Consentimento LGPD (no escopo, bloqueia go-live)

Coleta nome/e-mail/telefone de pessoas físicas → exige base legal (LGPD). No escopo desta change: aviso
curto de finalidade no formulário + link para política de privacidade + **checkbox de aceite obrigatório**
(client-side bloqueia o submit). O backend registra o aceite (`aceiteLgpd` + `created_at` serve de
carimbo temporal). Sem aceite, o cadastro não é enviado.

**Texto do aviso (fixado no spec):**

> "Ao entrar na lista, você concorda em receber comunicações do Menthoros sobre o acesso ao beta.
> Tratamos seus dados (nome, e-mail e, se informado, telefone) apenas para contato sobre o teste,
> conforme a [Política de Privacidade](/privacidade). Você pode pedir a remoção a qualquer momento."

**Link da política:** não há política publicada ainda — o link aponta para a **rota placeholder
`/privacidade`** (a ser preenchida com o conteúdo real). Publicar a política é **pré-requisito de
go-live** (subtarefa 4.3), mas **não bloqueia a implementação** do formulário.

## Data Model

`tb_waitlist` (migração `V43__Create_waitlist.sql`, aditiva — **revalidar numeração antes do merge**):

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | uuid | PK (GenerationType.UUID) |
| `nome` | varchar(120) | NOT NULL |
| `email` | varchar(180) | NOT NULL (valor original informado) |
| `email_normalized` | varchar(180) | NOT NULL; índice **único** `uk_waitlist_email_normalized` |
| `telefone` | varchar(20) | NULL |
| `perfil` | varchar(20) | NOT NULL (`TREINADOR`/`ATLETA`) |
| `qtd_atletas` | varchar(20) | NULL |
| `aceite_lgpd` | boolean | NOT NULL |
| `origem` | varchar(40) | NULL, default `'landing'` |
| `created_at` | timestamptz | NOT NULL, default `now()` |

## API Contract

`POST /api/v1/waitlist` — público, sem auth.

Request:
```json
{
  "nome": "Maria Treinadora",
  "email": "maria@exemplo.com",
  "telefone": "+55 11 99999-9999",
  "perfil": "TREINADOR",
  "qtdAtletas": "DE_11_A_30",
  "aceiteLgpd": true,
  "website": ""
}
```

Respostas:
- `201 Created` — cadastrado.
- `200 OK` — e-mail já existente (idempotente, inclusive sob corrida) **ou** honeypot acionado.
- `400 Bad Request` — validação (nome/e-mail/perfil/`aceiteLgpd` ausente ou falso).
- `429 Too Many Requests` — rate-limit por IP excedido.

`website` é honeypot (vazio no fluxo legítimo). `aceiteLgpd` deve ser `true`.

## Backend Components

- `entity/Waitlist` — `@Entity @Table(name = "tb_waitlist")`, `@Id @GeneratedValue(UUID)` próprio;
  enums `@Enumerated(STRING)`; `createdAt` `Instant` (default `Instant.now()`, coluna `TIMESTAMPTZ`).
  **Não** herda Base/Auditable.
- `enums/PerfilWaitlist` { TREINADOR, ATLETA }, `enums/FaixaAtletas` { ATE_10, DE_11_A_30, DE_31_A_100, MAIS_DE_100 }.
- `dto/input/WaitlistInputDto` — `@NotBlank nome`, `@NotBlank @Email email`, `@NotNull perfil`,
  `@NotNull @AssertTrue aceiteLgpd`, `telefone?`, `qtdAtletas?`, `website?` (honeypot);
  `dto/output/WaitlistOutputDto` — `status`, `mensagem`.
- `repository/WaitlistRepository` — `boolean existsByEmailNormalized(String emailNormalized)`.
- `services/WaitlistService` (interface, enum `Resultado`) + `services/impl/WaitlistServiceImpl` —
  normaliza e-mail (`trim`/lower `Locale.ROOT`), checa honeypot, fast-path `existsBy`, persiste com
  `saveAndFlush` e **captura `DataIntegrityViolationException`** convertendo em resultado idempotente;
  o controller mapeia para 200 vs 201.
- `controller/WaitlistController` — `@RestController @RequestMapping("/api/v1/waitlist")`, `@Valid`,
  `@ApiResponses` (201/200/400/429), sem `@RequireTenant` (público, como `StatusController`).
- `security/WaitlistRateLimitFilter` — `OncePerRequestFilter` + Caffeine, janela por IP, `429` no excedente.
- `JwtTenantFilter.shouldNotFilter()` — incluir `/api/v1/waitlist`; `CoreSecurityProperties.publicPaths`
  — adicionar `/api/v1/waitlist`.

## Frontend Components

- `constants/routes.ts` — `WAITLIST: '/waitlist'`.
- `App.tsx` — `{ path: '/waitlist', element: <WaitlistPage /> }` **fora** de `ProtectedRoute`.
- `pages/waitlist/WaitlistPage.tsx` — form MUI no tema dark/lime: nome, e-mail, telefone (opcional),
  select de perfil, select condicional de faixa de atletas, **checkbox LGPD + link de política**,
  honeypot oculto. Estados idle → enviando → sucesso/erro. **Preserva os valores em erro de rede**
  (não reseta no `finally`); diferencia validação/backend/rede/`429`. Feedback acessível (`Alert` com
  `role="alert"`/`aria-live`, foco gerenciado). Responsivo.
- `api/services/WaitlistService.ts` — `postWaitlist(payload)` no padrão dos services existentes; **sem**
  declarar `auth` (não exigir token).
- `pages/landing/LandingPage.tsx` — handlers dos CTAs de conversão passam a `navigate('/waitlist')`;
  "Entrar" mantém `/auth/login`.

## Testing Strategy

**Backend (JUnit5/Mockito/MockMvc):**
- Service: persiste cadastro válido; e-mail duplicado → idempotente; **corrida simulada** (mock lança
  `DataIntegrityViolationException`) → 200 sem 2ª linha; honeypot descartado; normalização de e-mail.
- Controller/web: `POST` sem auth → 201; **`POST` com token mas sem tenant → não rejeita** (shouldNotFilter);
  corpo inválido / `aceiteLgpd=false` → 400; duplicado → 200; sem CSRF/sem auth passa.
- Rate-limit: exceder a janela por IP → 429.

**Frontend:**
- Render do form; validação de obrigatórios + checkbox LGPD; campo de atletas só p/ treinador; fluxo
  sucesso/erro; **valores preservados após erro de rede**; acessibilidade do feedback; CTAs da landing
  navegam para `/waitlist` e "Entrar" para `/auth/login`; render de `/waitlist` sem token (sem redirect).

## Rollout / Rollback

- Rollout: migração `V43` aditiva (revalidar numeração no merge); declarar `CORS_ALLOWED_ORIGINS` de
  produção; deploy backend e frontend. Sem feature flag (superfície nova isolada).
- Rollback: **forward-only** (Flyway Community não reverte). Reverter os PRs remove código mas não o
  schema; a tabela `tb_waitlist` pode permanecer sem efeito. Drop exigiria migração corretiva própria +
  confirmação explícita (operação destrutiva).

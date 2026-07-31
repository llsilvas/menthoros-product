# Design — add-coach-lgpd-consent

> **Revisado em 2026-07-31** após product-review (veredito: Refine) e pre-mortem adversarial
> cross-model via `codex` (veredito: NO-GO da versão anterior). As duas revisões estão incorporadas
> abaixo; os achados que mudaram o design estão marcados com **[PM]** (pre-mortem) e **[PR]**
> (product-review).

## Enquadramento — o que este gate é e o que ele não é

**[PM] Achado que muda o enquadramento da change.** `JwtTenantFilter.doFilterInternal` chama
`usuarioSyncService.syncUsuarioFromJwt(jwt, tenantId)` em **toda requisição autenticada**
(`JwtTenantFilter.java:95`), criando/atualizando a linha em `tb_usuario` com nome, e-mail, avatar e
registro de acesso — **antes** de qualquer controller ou interceptor rodar.

Consequência: o tratamento dos dados pessoais do coach **já ocorreu** quando o gate de
consentimento é avaliado. Portanto:

- O `403` **não é** a base legal do tratamento e não deve ser descrito como tal.
- A base legal do sync inicial é a **execução do contrato** com a assessoria (o coach é usuário de
  um serviço contratado), e precisa estar declarada no RIPD — não o consentimento.
- O consentimento coletado aqui cobre o **aceite dos Termos e da Política**, e o `403` é um
  **controle de produto** que garante que o coach não opere a plataforma sem ter aceitado.

Essa distinção é o principal ajuste em relação à versão anterior desta spec, que vendia o gate como
garantia de conformidade do tratamento.

## Backend — persistência

**Migração `V73__add_lgpd_consent_usuario.sql`** (última existente: `V72`):

```sql
-- =====================================================================
-- V73: Consentimento LGPD do coach (titular de dados)
-- =====================================================================

ALTER TABLE tb_usuario
    ADD COLUMN IF NOT EXISTS lgpd_consent_granted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tb_usuario
    ADD COLUMN IF NOT EXISTS lgpd_consented_at TIMESTAMPTZ;

DO $$
BEGIN
    RAISE NOTICE '✅ V73 - consentimento LGPD adicionado em tb_usuario';
END$$;
```

**[PM] Lock da migração:** em PostgreSQL ≥ 11, `ADD COLUMN ... NOT NULL DEFAULT <constante>` é
metadata-only e não reescreve a tabela. `tb_usuario` tem uma linha por usuário (escala de centenas,
não milhões), então a operação é trivial aqui. Registrar a versão mínima do PostgreSQL na validação
da task 1.1; se algum dia a premissa mudar, migrar em duas fases (nullable → backfill → `SET NOT NULL`).

**Nomenclatura (ADR-0007):** campos novos em inglês. `tb_waitlist.aceite_lgpd` é legado e não é tocado.

**Tipo do timestamp:** `TIMESTAMPTZ` / `Instant`, divergindo do resto de `tb_usuario`
(`timestamp without time zone` / `LocalDateTime`). Consentimento é registro legal — o fuso não pode
ser ambíguo. Divergência deliberada.

### Entidade

```java
@Column(name = "lgpd_consent_granted", nullable = false)
@Builder.Default
private boolean lgpdConsentGranted = false;

@Column(name = "lgpd_consented_at")
private Instant lgpdConsentedAt;
```

> `@Builder.Default` é obrigatório — a entidade usa `@Builder` e sem ele o Lombok ignora o
> inicializador.

## Backend — endpoints

**`POST /api/v1/users/me/consent`**

- Input `ConsentInputDto` (record em `dto/input/`) com `termsAccepted` e `privacyPolicyAccepted`,
  ambos `@NotNull @AssertTrue` — o aceite parcial cai em `400` pelo Bean Validation, sem lógica no
  service (CA4).
- `@PreAuthorize("isAuthenticated()")`; retorna `ResponseEntity<Void>` `200`.
- **Sem `@RequireTenant`** — self-resolving pelo `sub` do JWT, igual ao `GET /me` existente.

**`GET /api/v1/users/me`** — adicionar `lgpdConsentGranted` ao `UsuarioMeOutputDto`.
`lgpdConsentedAt` **não** é exposto aqui (fica com `add-coach-settings-page`).

### Idempotência sob concorrência

**[PM]** A versão anterior dizia "só grava quando `!isLgpdConsentGranted()`" — isso é idempotente em
sequência, mas **não sob concorrência**: dois POSTs simultâneos (duplo clique, retry) leem `false`,
gravam timestamps diferentes e o último commit vence, corrompendo a data do registro legal.

**Solução:** update condicional atômico no repositório, não read-modify-write:

```java
// JPQL — nomes de CAMPO da entidade, não de coluna. Bulk update: sem nativeQuery.
@Modifying(flushAutomatically = true, clearAutomatically = true)
@Query("""
    UPDATE Usuario u
       SET u.lgpdConsentGranted = true, u.lgpdConsentedAt = :now
     WHERE u.id = :id
       AND u.assessoria.id = :tenantId
       AND u.lgpdConsentGranted = false
    """)
int grantConsent(@Param("id") UUID id, @Param("tenantId") UUID tenantId, @Param("now") Instant now);
```

Retorno `0` significa "já havia consentido" → o service responde `200` sem tocar em nada. O banco
garante a invariante; a corrida deixa de existir.

**Três detalhes que não são opcionais:**

- **É JPQL, não SQL nativo.** Os identificadores são campos da entidade
  (`u.lgpdConsentGranted`), nunca colunas (`lgpd_consent_granted`). Sem `nativeQuery = true`.
- **`clearAutomatically`/`flushAutomatically` são obrigatórios.** Bulk update passa ao lado do
  cache de 1º nível: o `Usuario` que o `JwtTenantFilter` já carregou **nesta mesma request**
  ficaria stale, e uma leitura posterior devolveria `lgpdConsentGranted = false` logo após o
  aceite. Consequência a respeitar: depois do `clear()` as entidades ficam **detached** — o
  service não pode continuar usando a instância anterior, nem o atributo da request (que passa a
  apontar para um objeto stale). O endpoint de consentimento está na whitelist, então o
  interceptor não o lê nessa request; ainda assim, **não reutilizar** o objeto após o update.
- **O `WHERE` inclui o tenant.** O `id` é o `sub` do Keycloak e já é globalmente único, mas o
  filtro por `assessoria.id` mantém a query tenant-scoped de fato, e não só na descrição.

```java
/**
 * Registra o consentimento LGPD do usuário autenticado.
 *
 * Idempotent: YES — update condicional atômico; reenvio preserva o lgpdConsentedAt original.
 * Side Effects: Database update (tb_usuario)
 * Tenant-aware: YES — resolve o caller pelo sub do JWT + query tenant-scoped
 */
```

## Backend — enforcement

**Mecanismo:** `HandlerInterceptor` (`LgpdConsentInterceptor`) registrado via `WebMvcConfigurer`.

### Precondições (fail-safe explícito)

**[PM]** A versão anterior assumia que `Usuario` e `TenantContext` estão sempre resolvidos. Não estão:

- `JwtTenantFilter.shouldNotFilter` isenta `/api/admin/**` e `/api/v1/waitlist` (`JwtTenantFilter.java:57`)
  → nessas rotas **não há `TenantContext`**.
- Se o sync falha e a leitura direta não acha o usuário, o filtro segue com `usuario == null`
  (`JwtTenantFilter.java:110`).
- Rotas públicas (`/api/v1/strava/webhook`, `/api/v1/strava/callback`, `/api/v1/asaas/webhook`,
  `/api/v1/waitlist`) chegam sem `Authentication`.

**Contrato do interceptor — ordem obrigatória de guardas, todas *antes* de qualquer decisão:**

1. `Authentication` ausente ou não é `Jwt` → **passa** (rota pública; não é problema do gate).
2. `TenantContext` não populado → **passa** (rota tenant-less por design).
3. Role do caller ≠ `TECNICO` → **passa** (atleta e admin fora do escopo).
4. Rota na whitelist → **passa**.
5. `Usuario` não resolvido → **bloqueia com `503`**, não `403`. Não se decide consentimento no
   escuro, e o erro precisa ser distinguível de "falta consentir" (mesmo espírito do `503` que o
   `JwtTenantFilter` já usa quando não consegue verificar o status da conta).
6. `lgpdConsentGranted == false` → **`403 LGPD_CONSENT_REQUIRED`**.

**[PM] Origem do `Usuario`:** o interceptor **não** refaz a busca. `JwtTenantFilter` passa a
depositar o `Usuario` já resolvido num atributo da request, e o interceptor lê de lá. Isso elimina
uma segunda query por escrita (o risco de performance da versão anterior) e garante que os dois
componentes decidam sobre o mesmo objeto.

**Contrato explícito do atributo** — sem isso vira acoplamento frágil entre dois componentes que
não se referenciam:

```java
// JwtTenantFilter — constante pública, é contrato entre filtro e interceptor
public static final String USUARIO_ATTR = JwtTenantFilter.class.getName() + ".usuario";
```

- Tipo esperado: `Usuario`. O interceptor lê com `instanceof` e trata "ausente ou de outro tipo"
  como **não resolvido** → guarda 5 (`503`), nunca como "sem consentimento".
- O filtro deposita o atributo **inclusive quando `usuario == null`?** Não: se não resolveu, não
  deposita. Ausência do atributo é o sinal de não-resolvido.
- Testes obrigatórios cobrindo presença **e** ausência do atributo (task 2.4).

### Whitelist

**[PM] Matching por padrão MVC, nunca por `String.startsWith` no `requestURI`.** Usar o
`HandlerMethod` / `BEST_MATCHING_PATTERN_ATTRIBUTE` resolvido pelo Spring, que já normalizou
context path, `//`, trailing slash, `;matrix=params` e percent-encoding. Comparar strings cruas de
URI é bypass fácil.

| Isenção | Motivo |
|---|---|
| `POST /api/v1/users/me/consent` | deadlock — bloquear o próprio aceite |
| Rotas `permitAll` da `SecurityFilterChain` | webhooks e callbacks públicos; já cobertas pela guarda 1 |
| `/api/admin/**` | tenant-less por design; cobertas pela guarda 2 |
| `GET /actuator/health` | **apenas health** — não `/actuator/**` |

**[PM] `/actuator/**` foi estreitado para `GET /actuator/health`**: a config atual só expõe
`health` publicamente, e isentar o prefixo inteiro abriria o gate para qualquer endpoint actuator
mutável que venha a ser exposto.

**[PM] "Todo GET é leitura" é falso** e foi removido como regra. `StravaAuthController` tem
`@GetMapping("/auth")` e `@GetMapping("/callback")` que disparam OAuth e persistem a integração.
A guarda de método continua valendo como filtro barato (`GET`/`HEAD`/`OPTIONS` não são bloqueados),
mas a spec **não afirma** que isso equivale a "sem efeito colateral" — a task 2.2 exige auditar os
`GET` com efeito e decidir caso a caso. Nenhum deles é operação de coach hoje, então nenhum entra
no gate nesta change; o ponto é não registrar uma premissa falsa.

**[PM] Novos endpoints herdam o gate por construção** — o interceptor é global por método HTTP, não
uma lista de rotas protegidas. Um `@PostMapping` novo já nasce coberto. Por isso não se cria um
delta de spec canônico: a garantia é estrutural, não documental.

### Rollout — feature flag obrigatória

**[PM] + [PR]** Habilitar o gate junto com o deploy do código é o maior risco operacional da change:
todos os coaches existentes nascem com `lgpd_consent_granted = false`, e qualquer bug no modal, no
cliente OpenAPI, no CORS ou no handler trava a operação de **todos** os técnicos ao mesmo tempo.

**Contrato de rollout em três estágios**, controlado por propriedade
`app.lgpd.consent-enforcement` (`off` | `report-only` | `on`), default `off`.

**A flag é um `enum` com binding validado, não uma `String`.** Um valor inválido (typo em
`application.yml`, variável de ambiente errada) precisa **falhar no boot** — se cair silenciosamente
em `off`, o enforcement é desligado em produção sem ninguém perceber, que é exatamente o modo de
falha que a flag existe para evitar.

```java
public enum ConsentEnforcementMode { OFF, REPORT_ONLY, ON }

@ConfigurationProperties(prefix = "app.lgpd")
@Validated
public record LgpdProperties(@NotNull ConsentEnforcementMode consentEnforcement) {}
```

Spring converte `report-only` → `REPORT_ONLY` por relaxed binding; valor desconhecido lança na
inicialização.

| Estágio | Comportamento |
|---|---|
| `off` | Interceptor não bloqueia. Modal já aparece e o aceite já é gravado. |
| `report-only` | Não bloqueia; **loga** cada request que *seria* bloqueada, com `usuarioId`, rota e tenant. Serve para medir a cauda de coaches sem aceite e descobrir rotas esquecidas antes de doer. |
| `on` | Bloqueia com `403`. |

Sequência: deploy em `off` → comunicação prévia aos coaches ativos → `report-only` até a cauda
esvaziar → `on`. A flag também é o botão de pânico: um `403` em massa se reverte por configuração,
sem redeploy nem rollback de migração.

### Tratamento do erro

`LgpdConsentRequiredException` + `@ExceptionHandler` no `GlobalExceptionHandler` (nunca try/catch no
controller) → `403` com código `LGPD_CONSENT_REQUIRED`, para o frontend distinguir de um `403` de
autorização comum.

## Frontend

**`CoachConsentDialog`** (`src/features/coach/components/CoachConsentDialog.tsx`):

- MUI `Dialog` com `disableEscapeKeyDown`, sem fechar por backdrop, sem botão de fechar.
- Responsivo (`fullScreen` em telas pequenas via `useMediaQuery`).
- 2 checkboxes:
  1. "Li e aceito os **Termos de Uso**" — link placeholder (`#`) até o documento existir
  2. "Consinto com o tratamento dos meus dados pessoais (nome, e-mail, avatar e registro de acesso)
     conforme a **Política de Privacidade**" — link para `/privacidade` (rota já existe)
- Botão "Aceitar e continuar" desabilitado até ambos marcados (CA2); estados de `loading` e `error`.

> Texto do segundo checkbox é rascunho e depende de validação jurídica (Q2).

**[PR] Continuidade visual com o wizard.** `coach-first-login-wizard` exibe **outro** overlay
bloqueante logo após este, no momento em que aquela change identifica como determinante para
retenção. Para não empilhar duas barreiras visualmente distintas, `CoachConsentDialog` nasce com um
**cabeçalho de passo** ("Passo 1 de 4 — Consentimento") e usa o mesmo container/stepper que o wizard
adotará. A decisão de UI unificada é registrada aqui para que a change dependente não precise
retrabalhar o modal.

**`CoachLayout`**: se `!me.lgpdConsentGranted` → renderiza **apenas** o `CoachConsentDialog` (sem
`CoachSidebar`, sem `<Outlet />`). Após o `200`, refetch de `me` libera a navegação.

**Cliente da API:** tipos gerados por `openapi-typescript-codegen` — regenerar, não editar à mão.

## Fluxo

```
Coach autentica (Keycloak)
        ↓
JwtTenantFilter sincroniza tb_usuario  ← tratamento já ocorre aqui (base legal: contrato)
        ↓
GET /api/v1/users/me → lgpdConsentGranted = false
        ↓
CoachLayout → CoachConsentDialog (bloqueante, "Passo 1 de 4")
        ↓
(escrita nesse estado, com flag em `on` → 403 LGPD_CONSENT_REQUIRED)
        ↓
Coach marca os 2 checkboxes → "Aceitar e continuar"
        ↓
POST /api/v1/users/me/consent → update condicional atômico → 200
        ↓
refetch de me → true → navegação liberada
```

## Impacto em código existente

| Arquivo | Mudança |
|---|---|
| `entity/Usuario.java` | +2 campos |
| `repository/UsuarioRepository.java` | +1 `@Modifying` `grantConsent()` |
| `dto/output/UsuarioMeOutputDto.java` | +1 campo (`lgpdConsentGranted`) |
| `dto/input/ConsentInputDto.java` | **novo** |
| `controller/UsuarioController.java` | +1 endpoint `POST /me/consent` |
| `services/UsuarioService.java` + `impl` | +1 método `registerConsent()` |
| `security/JwtTenantFilter.java` | deposita o `Usuario` resolvido num atributo da request |
| `interceptor/LgpdConsentInterceptor.java` | **novo** + registro no `WebMvcConfigurer` |
| `exception/LgpdConsentRequiredException.java` | **novo** |
| `exception/GlobalExceptionHandler.java` | +1 `@ExceptionHandler` |
| `db/migration/V73__add_lgpd_consent_usuario.sql` | **novo** |
| `application.yml` | +`app.lgpd.consent-enforcement` (default `off`) |
| `features/coach/components/CoachConsentDialog.tsx` | **novo** |
| `features/coach/layout/CoachLayout.tsx` | interceptação do consentimento |

## Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **[PM] Lock-out em massa dos coaches** | Crítico | Flag `off` → `report-only` → `on`; reversão por configuração sem redeploy. Leitura nunca bloqueia, então o coach sempre carrega a tela e o modal. |
| **[PM] Bypass da whitelist por matching de string** | Alto | Matching por padrão MVC resolvido; testes com trailing slash, `//`, `;matrix`, percent-encoding e context path (task 2.2). |
| **[PM] Interceptor quebra webhooks / rotas públicas / admin** | Alto | Guardas 1 e 2 (sem `Authentication` ou sem `TenantContext` → passa), antes de qualquer decisão. Testes dedicados por classe de rota. |
| **[PM] `Usuario` não resolvido → decisão no escuro** | Alto | Guarda 5: `503`, nunca `403`. |
| **[PM] Corrida no registro do aceite** | Médio | Update condicional atômico no banco; teste de concorrência. |
| **[PM] Gate confundido com base legal do tratamento** | Alto | Enquadramento explícito no topo deste documento; RIPD declara execução de contrato como base do sync. |
| **[PM] Prova legal fraca (sem versão de política)** | Médio | **Aceito por decisão explícita** (booleano + timestamp). Consequência registrada: não é possível re-solicitar aceite quando a Política mudar, nem provar *qual texto* foi aceito. Ver Q4. |
| **[PM] `UPDATE` manual como fallback não deixa trilha** | Médio | Fallback operacional removido do design. Se um coach travar, o caminho é a flag (`off`), não SQL solto. |
| **[PR] Dois modais bloqueantes no primeiro login** | Médio | Stepper compartilhado com `coach-first-login-wizard` ("Passo 1 de 4"). |
| **[PM] `GET` com efeito colateral** | Baixo | Auditados (Strava OAuth); nenhum é operação de coach. Premissa falsa "GET = leitura" removida da spec. |
| **[PM] Lock da migração** | Baixo | `ADD COLUMN` com default constante é metadata-only em PG ≥ 11; tabela pequena. |
| **`@Builder` ignorando o default** | Baixo | `@Builder.Default` + teste de criação. |

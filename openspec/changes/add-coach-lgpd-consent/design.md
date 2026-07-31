# Design — add-coach-lgpd-consent

> **Revisado em 2026-07-31** após product-review (veredito: Refine), pre-mortem adversarial
> cross-model via `codex` (veredito: NO-GO da versão anterior) e gate DoR. Achados marcados com
> **[PM]** (pre-mortem) e **[PR]** (product-review).
>
> **Revisão de 2026-07-31 (Q4 reaberta):** a decisão de guardar apenas booleano + timestamp foi
> **revertida**. O consentimento passa a ser versionado e append-only. Ver § "Modelo de dados".

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

## Modelo de dados — append-only versionado

**Decisão (Q4, revertida em 2026-07-31):** guardar `boolean + timestamp` em `tb_usuario` responde
"consentiu?" mas não "consentiu **com o quê**?". Pior: no dia em que a Política mudar, um
re-consentimento sobrescreveria a linha e **destruiria a prova do aceite anterior** — a mesma
lacuna, deslocada para o passado. Consentimento é registro legal: nada é sobrescrito.

**Tabela nova, append-only** — uma linha por aceite:

```sql
-- =====================================================================
-- V73: Consentimento LGPD do coach — registro append-only versionado
-- =====================================================================

CREATE TABLE IF NOT EXISTS tb_usuario_lgpd_consent (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id     UUID NOT NULL REFERENCES tb_usuario(id) ON DELETE CASCADE,
    tenant_id      UUID NOT NULL,
    policy_version VARCHAR(20) NOT NULL,
    terms_version  VARCHAR(20) NOT NULL,
    consented_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_usuario_lgpd_consent_versoes
        UNIQUE (usuario_id, policy_version, terms_version)
);

CREATE INDEX IF NOT EXISTS idx_usuario_lgpd_consent_tenant_usuario
    ON tb_usuario_lgpd_consent(tenant_id, usuario_id);

DO $$
BEGIN
    RAISE NOTICE '✅ V73 - tb_usuario_lgpd_consent criada com sucesso';
END$$;
```

Segue o padrão de tabela do repo: prefixo `tb_`, PK `UUID DEFAULT gen_random_uuid()`, FK com
`ON DELETE CASCADE`, `tenant_id UUID NOT NULL` sem FK (gerido pela aplicação), `TIMESTAMPTZ`,
constraint e índice nomeados, índice composto `(tenant_id, ...)`.

**`tb_usuario` não é alterada.** Não há coluna `lgpd_consent_granted` — ela seria estado
redundante, capaz de divergir da tabela de consentimentos. "Está consentido?" é **derivado**:
existe linha com as versões vigentes?

### O que a `UNIQUE` compra de graça

**[PM] O update condicional atômico da versão anterior deixa de existir.** A corrida que ele
resolvia (dois POSTs simultâneos gravando timestamps diferentes) some sozinha: o aceite vira um
`INSERT`, e `UNIQUE (usuario_id, policy_version, terms_version)` garante que só um vence. O
segundo viola a constraint e é tratado como no-op idempotente.

Isso também **elimina** toda a discussão de `@Modifying`/`clearAutomatically`/cache de 1º nível:
não há mais bulk update, só insert de uma entidade nova.

### Versionamento por data de vigência

Versão é a **data de vigência** do documento, string `YYYY-MM-DD` (ex.: `"2026-06-30"`). Legível,
ordenável, e casa com o "última atualização" que a própria Política já exibe.

**O backend é a fonte da verdade**, via configuração:

```yaml
app:
  lgpd:
    consent-enforcement: off       # off | report-only | on
    policy-version: "2026-06-30"
    terms-version: "2026-08-01"
```

```java
public enum ConsentEnforcementMode { OFF, REPORT_ONLY, ON }

@ConfigurationProperties(prefix = "app.lgpd")
@Validated
public record LgpdProperties(
        @NotNull ConsentEnforcementMode consentEnforcement,
        @NotBlank String policyVersion,
        @NotBlank String termsVersion) {}
```

Valor inválido ou ausente **falha no boot** — nunca cai em default silencioso.

## Backend — endpoints

**`POST /api/v1/users/me/consent`**

```java
public record ConsentInputDto(
    @NotNull @AssertTrue Boolean termsAccepted,
    @NotNull @AssertTrue Boolean privacyPolicyAccepted,
    @NotBlank String policyVersion,
    @NotBlank String termsVersion) {}
```

**Por que o cliente envia as versões que ele renderizou.** Se o servidor simplesmente carimbasse a
versão vigente, um coach com a página aberta durante um deploy que troca a Política seria
registrado aceitando um texto que **nunca viu** — um registro legal falso, que é pior do que
registro nenhum. Então:

- O cliente envia as versões que exibiu.
- O servidor compara com as vigentes. Divergiu → **`409 CONSENT_VERSION_STALE`**, sem gravar. O
  frontend recarrega e reapresenta o texto novo.

- `@PreAuthorize("isAuthenticated()")`; retorna `ResponseEntity<Void>`.
- **Sem `@RequireTenant`** — self-resolving pelo `sub` do JWT, igual ao `GET /me`.
- `200` no primeiro aceite e no reenvio das mesmas versões (idempotente).

**`GET /api/v1/users/me`** — acrescenta ao `UsuarioMeOutputDto`:

| Campo | Origem |
|---|---|
| `lgpdConsentGranted` | **derivado** — existe consentimento com as versões vigentes? |
| `lgpdCurrentPolicyVersion` | config (o cliente precisa ecoar de volta) |
| `lgpdCurrentTermsVersion` | config |

O nome `lgpdConsentGranted` é mantido para não quebrar o contrato do front, mas passa a ser
computado, não persistido. `lgpdConsentedAt` **não** entra aqui — fica com
`add-coach-settings-page`, que lê o histórico.

### Registro do aceite

```java
/**
 * Registra o consentimento LGPD do usuário autenticado para as versões vigentes.
 *
 * Idempotent: YES — reenvio das mesmas versões é no-op; a UNIQUE do banco arbitra a corrida.
 * Side Effects: Database insert (tb_usuario_lgpd_consent) — nunca update, nunca delete.
 * Tenant-aware: YES — resolve o caller pelo sub do JWT; grava e consulta com tenant_id.
 */
```

Fluxo: validar versões contra a config → `INSERT` → `DataIntegrityViolationException` na
constraint é capturada e tratada como sucesso (`200`), porque significa "este usuário já aceitou
exatamente estas versões".

> Capturar a violação de constraint é aceitável aqui e **não** viola a regra de "sem try/catch para
> mapear HTTP": não estamos mapeando status, estamos traduzindo uma corrida vencida em no-op no
> service. O `@ExceptionHandler` do `GlobalExceptionHandler` segue sendo o único lugar que decide
> status.

### Re-consentimento

Quando `policy-version` muda na config, `lgpdConsentGranted` passa a computar `false` para todo
mundo → o modal reaparece → o aceite grava uma **nova linha**, preservando a anterior. É
exatamente o comportamento que a Q4 pedia.

**Consequência operacional séria:** com a flag em `on`, bumpar a versão **bloqueia a escrita de
todos os coaches de uma vez**. Um bump de Política é, na prática, um mini-relançamento do rollout
— ver "Riscos".

## Backend — enforcement

**Mecanismo:** `HandlerInterceptor` (`LgpdConsentInterceptor`) registrado via `WebMvcConfigurer`.

### Precondições (fail-safe explícito)

**[PM]** A versão anterior assumia que `Usuario` e `TenantContext` estão sempre resolvidos. Não estão:

- `JwtTenantFilter.shouldNotFilter` isenta `/api/admin/**` e `/api/v1/waitlist` (`JwtTenantFilter.java:57`)
  → nessas rotas **não há `TenantContext`**.
- Se o sync falha e a leitura direta não acha o usuário, o filtro segue com `usuario == null`
  (`JwtTenantFilter.java:110`).
- Rotas públicas (webhooks, callbacks, waitlist) chegam sem `Authentication`.

**Ordem obrigatória de guardas, todas antes de qualquer decisão:**

1. `Authentication` ausente ou não é `Jwt` → **passa** (rota pública).
2. `TenantContext` não populado → **passa** (rota tenant-less por design).
3. Role do caller ≠ `TECNICO` → **passa**.
4. Rota na whitelist → **passa**.
5. `Usuario` não resolvido → **`503`**, nunca `403`. Não se decide consentimento no escuro.
6. Sem consentimento das versões vigentes → **`403 LGPD_CONSENT_REQUIRED`**.

**Custo da guarda 6:** uma query `EXISTS` indexada em `tb_usuario_lgpd_consent`. Ela roda **só**
depois das guardas 1–5, ou seja, apenas em escrita de coach fora da whitelist — leitura nunca
paga. Se virar gargalo, cachear por request; não otimizar antes de medir.

**Contrato do atributo de request** — sem isso vira acoplamento frágil entre dois componentes que
não se referenciam:

```java
// JwtTenantFilter — constante pública, é contrato entre filtro e interceptor
public static final String USUARIO_ATTR = JwtTenantFilter.class.getName() + ".usuario";
```

- Tipo esperado: `Usuario`. Ausente ou de outro tipo → **não resolvido** → guarda 5 (`503`).
- O filtro **não** deposita o atributo quando não resolve. Ausência é o sinal.

### Whitelist

**[PM] Matching por padrão MVC resolvido** (`BEST_MATCHING_PATTERN_ATTRIBUTE` / `HandlerMethod`),
**nunca** `String.startsWith` no `requestURI` — o padrão já normalizou context path, `//`,
trailing slash, `;matrix=params` e percent-encoding. Comparar URI cru é bypass fácil.

| Isenção | Motivo |
|---|---|
| `POST /api/v1/users/me/consent` | deadlock — bloquear o próprio aceite |
| Rotas `permitAll` da `SecurityFilterChain` | webhooks e callbacks; já cobertas pela guarda 1 |
| `/api/admin/**` | tenant-less por design; cobertas pela guarda 2 |
| `GET /actuator/health` | **apenas health** — não `/actuator/**` |

**[PM] "Todo GET é leitura" é falso** e foi removido como regra. `StravaAuthController` tem
`@GetMapping("/auth")` e `@GetMapping("/callback")` que disparam OAuth e persistem integração. A
guarda de método segue valendo como filtro barato (`GET`/`HEAD`/`OPTIONS` não bloqueiam), mas a
spec **não afirma** que isso equivale a "sem efeito colateral".

**[PM] Novos endpoints herdam o gate por construção** — o interceptor é global por método HTTP, não
uma lista de rotas protegidas. Por isso não se cria delta de spec canônico: a garantia é estrutural.

### Rollout — feature flag obrigatória

Habilitar o gate junto com o deploy é o maior risco operacional: todos os coaches nascem sem
consentimento, e qualquer bug no modal, no cliente OpenAPI, no CORS ou no handler trava a operação
de **todos** ao mesmo tempo.

| Estágio | Comportamento |
|---|---|
| `off` | Não bloqueia. Modal já aparece e o aceite já é gravado. |
| `report-only` | Não bloqueia; **loga** cada request que *seria* bloqueada (`usuarioId`, rota, tenant). |
| `on` | Bloqueia com `403`. |

Sequência: deploy em `off` → comunicação prévia → `report-only` até a cauda esvaziar → `on`.
Também é o botão de pânico: reverte por configuração, sem redeploy.

### Tratamento de erro

`LgpdConsentRequiredException` e `ConsentVersionStaleException` + `@ExceptionHandler` no
`GlobalExceptionHandler` → `403 LGPD_CONSENT_REQUIRED` e `409 CONSENT_VERSION_STALE`, para o
frontend distinguir de erros de autorização comuns.

## Frontend

**`CoachConsentDialog`** (`src/features/coach/components/CoachConsentDialog.tsx`):

- MUI `Dialog` com `disableEscapeKeyDown`, sem fechar por backdrop, sem botão de fechar.
- Responsivo (`fullScreen` em telas pequenas via `useMediaQuery`).
- 2 checkboxes:
  1. "Li e aceito os **Termos de Uso**" — link placeholder (`#`) até o documento existir
  2. "Consinto com o tratamento dos meus dados pessoais (nome, e-mail, avatar e registro de acesso)
     conforme a **Política de Privacidade**" — link para `/privacidade` (rota já existe)
- Botão "Aceitar e continuar" desabilitado até ambos marcados.
- Envia de volta `lgpdCurrentPolicyVersion`/`lgpdCurrentTermsVersion` **recebidos do `/users/me`** —
  não constantes hardcoded no front, para não haver duas fontes de verdade.
- `409 CONSENT_VERSION_STALE` → refetch de `me` e reapresentação do texto, com aviso de que os
  termos foram atualizados.

> Texto do segundo checkbox é rascunho e depende de validação jurídica (Q2).

**[PR] Continuidade visual com o wizard.** `coach-first-login-wizard` exibe **outro** overlay
bloqueante logo após este, no momento que aquela change identifica como determinante para
retenção. Para não empilhar duas barreiras distintas, o dialog nasce com cabeçalho de passo
("Passo 1 de 4 — Consentimento") no mesmo container/stepper que o wizard adotará.

**`CoachLayout`**: se `!me.lgpdConsentGranted` → renderiza **apenas** o `CoachConsentDialog` (sem
`CoachSidebar`, sem `<Outlet />`). Após o `200`, refetch de `me` libera a navegação.

**`PrivacidadePage`**: a data de vigência exibida na página deve bater com `app.lgpd.policy-version`.
Divergência aí significa que o coach aceitou um texto e o sistema registrou outra versão.

**Cliente da API:** tipos gerados por `openapi-typescript-codegen` — regenerar, não editar à mão.

## Fluxo

```
Coach autentica (Keycloak)
        ↓
JwtTenantFilter sincroniza tb_usuario  ← tratamento já ocorre aqui (base legal: contrato)
        ↓
GET /api/v1/users/me → lgpdConsentGranted = false + versões vigentes
        ↓
CoachLayout → CoachConsentDialog (bloqueante, "Passo 1 de 4")
        ↓
(escrita nesse estado, com flag em `on` → 403 LGPD_CONSENT_REQUIRED)
        ↓
Coach marca os 2 checkboxes → "Aceitar e continuar" (ecoa as versões exibidas)
        ↓
POST /users/me/consent → versões conferem → INSERT em tb_usuario_lgpd_consent → 200
                       → versões defasadas → 409 → front recarrega o texto novo
        ↓
refetch de me → lgpdConsentGranted = true → navegação liberada
```

## Impacto em código existente

| Arquivo | Mudança |
|---|---|
| `entity/UsuarioLgpdConsent.java` | **novo** |
| `repository/UsuarioLgpdConsentRepository.java` | **novo** (`existsBy...`, `findTopBy...OrderByConsentedAtDesc`) |
| `entity/Usuario.java` | **inalterada** |
| `dto/output/UsuarioMeOutputDto.java` | +3 campos (granted derivado + 2 versões vigentes) |
| `dto/input/ConsentInputDto.java` | **novo** |
| `config/LgpdProperties.java` + `ConsentEnforcementMode` | **novos** |
| `controller/UsuarioController.java` | +1 endpoint `POST /me/consent` |
| `services/UsuarioService.java` + `impl` | +`registerConsent()`, +derivação do granted |
| `security/JwtTenantFilter.java` | expõe `USUARIO_ATTR` |
| `interceptor/LgpdConsentInterceptor.java` | **novo** + registro no `WebMvcConfigurer` |
| `exception/` | +`LgpdConsentRequiredException`, +`ConsentVersionStaleException` |
| `exception/GlobalExceptionHandler.java` | +2 `@ExceptionHandler` |
| `db/migration/V73__create_tb_usuario_lgpd_consent.sql` | **novo** |
| `application.yml` | +`app.lgpd.*` |
| `features/coach/components/CoachConsentDialog.tsx` | **novo** |
| `features/coach/layout/CoachLayout.tsx` | interceptação do consentimento |

## Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **Lock-out em massa dos coaches** | Crítico | Flag `off`→`report-only`→`on`; reversão por configuração. Leitura nunca bloqueia. |
| **Bump de versão é um novo lock-out** | Alto | Trocar `policy-version` invalida o consentimento de **todos**. Procedimento obrigatório: baixar para `report-only` **antes** do bump, comunicar, e só então voltar para `on`. Registrado nos gates do bloco 5. |
| **[PM] Bypass da whitelist por matching de string** | Alto | Matching por padrão MVC; testes com trailing slash, `//`, `;matrix`, encoding. |
| **[PM] Interceptor quebra webhooks / públicas / admin** | Alto | Guardas 1 e 2 antes de qualquer decisão; testes por classe de rota. |
| **[PM] `Usuario` não resolvido → decisão no escuro** | Alto | Guarda 5: `503`, nunca `403`. |
| **Registro legal falso (aceite de texto não exibido)** | Alto | Cliente ecoa as versões renderizadas; servidor rejeita divergência com `409`. |
| **Versão da config divergir do texto publicado** | Médio | `PrivacidadePage` exibe a data de vigência; conferência manual no gate 5.2. Sem isso, o registro aponta para um texto que ninguém viu. |
| **[PM] Gate confundido com base legal** | Alto | Enquadramento no topo; RIPD declara execução de contrato como base do sync. |
| **Query extra por escrita de coach** | Baixo | `EXISTS` indexado, só após as guardas 1–5; leitura não paga. Cachear por request se medir gargalo. |
| **[PR] Dois modais bloqueantes no primeiro login** | Médio | Stepper compartilhado com `coach-first-login-wizard`. |
| **[PM] `GET` com efeito colateral** | Baixo | Auditados (Strava OAuth); nenhum é operação de coach. |
| **Lock da migração** | Baixo | `CREATE TABLE` novo, sem tocar em `tb_usuario`. Zero risco de lock em tabela existente. |

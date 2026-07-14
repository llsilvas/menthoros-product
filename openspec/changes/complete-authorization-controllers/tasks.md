# Tasks: Complete Authorization on Remaining Controllers

> **Refinado em 2026-07-14 contra o código real** (`/implement init`, branch
> `feature/complete-authorization-controllers`, base `e8b9a9e`). A spec original é de maio e
> envelheceu em pontos materiais — correções aplicadas abaixo:
>
> 1. **`anyRequest().authenticated()` já vale** (`CoreSecurityConfig`): anônimo já recebe 401
>    em tudo que não é público. O entregável real é **autorização por papel (403)** + guarda de
>    tenant, não o 401.
> 2. **Convenção de papel do projeto:** `hasRole('ATLETA')`/`hasAnyRole('TECNICO', 'ADMIN')` —
>    sem prefixo `ROLE_` (o plano original usava `hasRole('ROLE_ATLETA')`, que nunca casaria).
> 3. **Papéis corrigidos pela evidência de consumo:** os widgets de adesão
>    (`GraficoAdesaoWidget`/`TaxaAdesaoWidget`/`ResumoSemanalWidget`), o `ProvasProximasWidget`
>    e o `SyncStravaButton` vivem nas telas do **coach** — `hasRole('ROLE_ATLETA')` quebraria
>    o produto. Padrão correto: `hasAnyRole('TECNICO', 'ADMIN')` (o dominante no repo, 45
>    ocorrências).
> 4. **`/callback` e `/webhook` já são públicos por config** (`stravaPaths` → `permitAll`) —
>    tasks viram verificação/documentação, não mudança.
> 5. **Não existe `*AuthTest` de referência** (a spec citava um inexistente). O padrão real com
>    segurança ativa é `CoachTreinoControllerTest` (`@WebMvcTest` SEM `addFilters = false` +
>    `@WithMockUser`/`springSecurity()`).
> 6. **Inventário atual (32 controllers):** além dos 4 alvo, têm zero `@PreAuthorize`:
>    `StatusController` e `WaitlistController` (públicos por design, em `publicPaths`) e
>    `UsuarioController` (`GET /users/me` — coberto por `authenticated()`; anotação de
>    consistência incluída na task 5).
> 7. Nenhum dos 4 controllers alvo tem `@RequireTenant` nem `resolverAtletaIdAtual` — os que
>    recebem `atletaId` ganham a guarda de tenant (padrão do repo).

## 1. MetricasController — papel + tenant

- [x] 1.1 `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` + `@RequireTenant` (padrão dos
      endpoints coach que recebem `atletaId`) em `getAdesaoSemanal` e `getAdesaoDiaria`.
      Consumidor: widgets da home do coach. Documentar 403 no Swagger.
      TDD: teste com segurança ativa (padrão `CoachTreinoControllerTest`) — sem papel → 403;
      TECNICO → 200; ATLETA → 403.
      verify: `./mvnw test -Dtest=MetricasControllerTest` verde e widgets do coach seguem
      funcionando (papel TECNICO no token de dev).

## 2. ProvasProximasController — papel

- [x] 2.1 `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` em `getProvasProximas` (consumidor:
      `ProvasProximasWidget` da home do coach; retorna provas do tenant inteiro — jamais
      ATLETA). Import de `@PreAuthorize` já existe e está sem uso.
      TDD: sem papel → 403; TECNICO → 200; ATLETA → 403.
      verify: `./mvnw test -Dtest=ProvasProximasControllerTest`.

## 3. StravaActivityController — papel + tenant

- [x] 3.1 `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` + `@RequireTenant` em
      `sync(atletaId)` e `getSyncStatus(atletaId)` (consumidor: `SyncStravaButton` nas telas
      do coach — hoje qualquer autenticado dispara sync de qualquer atleta do tenant).
      TDD: sem papel → 403; TECNICO → 200 (service mockado); ATLETA → 403; cross-tenant → 403
      via aspect.
      verify: `./mvnw test -Dtest=StravaActivityControllerTest` (classe já existe — estender).

## 4. StravaAuthController — papel seletivo (callback público)

- [x] 4.1 *(ampliado na execução: `status` e `disconnect` — também por `atletaId`, sem
      consumidor no front — receberam o mesmo guard por consistência)* `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` em `getAuthorizationUrl(atletaId)`
      (e `startAuth`, se existir no código atual — conferir assinatura real; consumidor é o
      coach via `SyncStravaButton.handleConnect`). **`callback()` fica SEM anotação** — já é
      público por `stravaPaths` e recebe redirect do Strava (obs. histórica: precisa continuar
      público).
      TDD: url → sem papel 403 / TECNICO 200; callback → **sem token 302** (teste com filtros
      ativos prova que o `permitAll` da config segue valendo).
      verify: `./mvnw test` no pacote do controller.

## 5. Consistência e verificação dos públicos

- [x] 5.1 `UsuarioController.getMe`: `@PreAuthorize("isAuthenticated()")` (consistência com os
      outros `/me`; comportamento inalterado — já exigia token pela config).
      `StravaWebhookController` e `WaitlistController`/`StatusController`: sem mudança de
      código; adicionar teste (ou asserção em teste existente) provando que GET/POST do
      webhook respondem sem JWT (segurança = verify token) e documentação Swagger sem 401.
      verify: `./mvnw test -Dtest=UsuarioControllerTest,StravaWebhookControllerTest`.

## 6. Gate final

- [x] 6.1 Suíte completa verde: **1413 testes, 0 falhas** (+34 novos; base era 1379).
      Commits por seção na branch `feature/complete-authorization-controllers`
      (dc1dae6, 559297b, f102972, 9878317, 1d0b90e). Descoberta importante da execução:
      o slice `@WebMvcTest` NÃO carrega a `CoreSecurityConfig` — testes de controller
      existentes nunca exercitaram `@PreAuthorize`/`@RequireTenant` (falso verde);
      criado `testsupport/AuthWebMvcTestConfig` que importa a cadeia real
      (`@EnableMethodSecurity` + `JwtTenantFilter` + aspect) — padrão para novos testes
      de autorização.
      **Pendente (pré-PR): smoke manual** dos fluxos do coach em dev com token TECNICO
      (widgets de adesão/provas na home; sync Strava no roster) — requer ambiente local
      de pé (Keycloak + Postgres).

- [x] 6.2 **QA gate executado (2026-07-14)** — code-reviewer + security-reviewer +
      clean-code-reviewer em paralelo. Resultado e ações:
      - **Critical (security, CORRIGIDO em 37757c1):** `getProvasProximas` era global
        (`Tenant-aware: NO`) — vazava provas/atletas de todas as assessorias para
        qualquer TECNICO/ADMIN. Query agora filtra por `assessoria.id` + `TenantContext`
        (o CA original da spec já exigia esse isolamento).
      - **Importants de clean code (CORRIGIDOS em 3887f34):** helpers JWT duplicados 5×
        → `testsupport/JwtTestSupport`; ordem de anotações no `UsuarioController`;
        javadoc do `AuthWebMvcTestConfig`.
      - Suíte final: **1414 testes, 0 falhas**.

## Débitos registrados no QA (fora do escopo — NÃO herdar, tratar em change própria)

- **OAuth Strava — `state` sem assinatura (High):** `state = atletaId` puro; callback
  público resolve o atleta via `findByIdBasic` sem tenant. Permite account-linking/CSRF:
  atacante completa o fluxo OAuth com a própria conta Strava e `state` de atleta alheio
  (inclusive cross-tenant), poluindo a integração da vítima. Mitigação: `state` como
  nonce assinado/expirável vinculado à sessão que iniciou o fluxo.
- **Webhook Strava — POST sem validação (High):** o verify token só protege o GET
  (handshake). O POST de eventos aceita payload de qualquer origem; blast radius limitado
  (só age se `ownerId` casar com integração ativa), mas permite forjar delete/create
  (treino → CANCELADO) e queimar rate limit. Mitigação mínima: validar `subscription_id`.
- **`Map<String, Object>` como retorno** em `StravaAuthController.getAuthorizationUrl`/
  `status` (viola padrão DTO do CLAUDE.md; pré-existente).
- **`MetricasAdesaoService` recebe `String atletaId`** — round-trip UUID→String→UUID com
  o controller; alinhar assinatura para `UUID`.
- **`startAuth` usa `@RequestParam atletaId`** em vez de path variable (convenção REST).
- **Premissa estrutural:** `hasAnyRole` sozinho não isola tenant (roles são globais do
  realm) — novo endpoint com resource-id DEVE combinar `@PreAuthorize` + `@RequireTenant`
  ou filtro por `TenantContext` no service; e `TenantValidationRepository` só cobre 6
  tipos de recurso (tipo não coberto → fail-closed com 403 sem log claro).

---

## Notas de escopo (mantidas da spec original + refinamento)

- Non-goals inalterados: sem novos papéis, sem rate limiting, sem mudança de DTO/contrato.
- O IDOR intra-tenant de `PlanoTreinoController.buscarPlanoSemanal` (débito registrado em
  changes anteriores) NÃO é escopo desta change — aqui só os 5 controllers da spec + a
  anotação de consistência do `UsuarioController`.
- Decisão de papel registrada: endpoints com `atletaId` de consumo coach-only ficam
  TECNICO/ADMIN. Se um dia o shell do atleta precisar de adesão/sync self-service, a rota
  correta é um endpoint `/me` novo (padrão `resolverAtletaIdAtual`), não afrouxar estes.

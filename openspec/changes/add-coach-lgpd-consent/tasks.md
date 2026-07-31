# Tasks — add-coach-lgpd-consent

**Tamanho:** S · **Trilha:** Full

Branch: `feature/add-coach-lgpd-consent` nos **dois** repos (`apps/menthoros-backend`,
`apps/menthoros-front`), criada a partir de `develop` antes de qualquer código.

---

## 1. Backend — persistência e contrato

- [ ] **1.1 Migração Flyway `V73__add_lgpd_consent_usuario.sql`**
  - `ALTER TABLE tb_usuario ADD COLUMN IF NOT EXISTS lgpd_consent_granted BOOLEAN NOT NULL DEFAULT false;`
  - `ALTER TABLE tb_usuario ADD COLUMN IF NOT EXISTS lgpd_consented_at TIMESTAMPTZ;`
  - Bloco `DO $$ ... RAISE NOTICE ... END$$;` conforme o padrão de migrações.
  - Conferir que `V72` continua sendo a última antes de criar — renumerar se outra change entrou.
  - **Validação:** `./mvnw clean test` (Flyway roda no contexto de teste).

- [ ] **1.2 Entidade `Usuario.java`**
  - `lgpdConsentGranted` (`boolean`, `@Column(nullable = false)`, `@Builder.Default = false`).
  - `lgpdConsentedAt` (`Instant`, nullable).
  - **Teste:** `UsuarioTest` — `Usuario.builder()...build()` nasce com `lgpdConsentGranted == false`
    e `lgpdConsentedAt == null` (protege contra o `@Builder` ignorar o default).
  - **Validação:** `./mvnw clean test`

- [ ] **1.3 `ConsentInputDto` (record em `dto/input/`)**
  - Campos `termsAccepted` e `privacyPolicyAccepted` (`Boolean`), ambos com `@NotNull` +
    `@AssertTrue` e mensagem em PT-BR.
  - `@Schema(description = ...)` na classe e em cada campo.
  - **Validação:** `./mvnw clean compile`

- [ ] **1.4 `UsuarioMeOutputDto` — expor `lgpdConsentGranted`**
  - Adicionar campo `boolean lgpdConsentGranted` com `@Schema`.
  - Atualizar o mapeamento em `UsuarioServiceImpl.getCurrentUser()`.
  - **Não** expor `lgpdConsentedAt` (fora do escopo — ver `add-coach-settings-page`).
  - **Teste:** `UsuarioServiceImplTest` — `getCurrentUser()` reflete o flag da entidade.
  - **Validação:** `./mvnw clean test`

- [ ] **1.5 `UsuarioRepository.grantConsent()` — update condicional atômico**
  - **JPQL** (nomes de campo da entidade, **sem** `nativeQuery`):
    `UPDATE Usuario u SET u.lgpdConsentGranted = true, u.lgpdConsentedAt = :now
     WHERE u.id = :id AND u.assessoria.id = :tenantId AND u.lgpdConsentGranted = false`.
  - `@Modifying(clearAutomatically = true)` — protege contra leitura stale **dentro da própria
    transação** de `registerConsent()` (o método carrega o `Usuario` para resolver o caller antes
    do update). Precedente: `RaceProjectionSnapshotRepository`. **Não** usar
    `flushAutomatically`: não há mutação pendente a descarregar.
  - Nota verificada: com `open-in-view: false` e `syncUsuarioFromJwt` em `@Transactional` próprio,
    o `Usuario` vindo do `JwtTenantFilter` já está detached — não é afetado por este update.
  - Filtrar por `assessoria.id` também — a query precisa ser tenant-scoped de fato, não só na
    descrição.
  - Read-modify-write no service **não** é aceitável: dois POSTs concorrentes gravariam timestamps
    diferentes e o último commit venceria, corrompendo o registro legal.
  - **Teste:** `@DataJpaTest` — segunda chamada retorna `0` e **não** altera o `lgpd_consented_at`
    da primeira (CA13); carregar o `Usuario`, rodar o update e reler na **mesma** transação
    enxerga `lgpdConsentGranted = true` (prova que o cache foi limpo); `id` correto mas de outro
    tenant retorna `0` e não altera nada.
  - **Validação:** `./mvnw clean test`

- [ ] **1.6 `UsuarioService.registerConsent()` + impl**
  - JavaDoc obrigatório: `Idempotent: YES`, `Side Effects: Database update (tb_usuario)`,
    `Tenant-aware: YES`.
  - Resolve o caller pelo `sub` do JWT (mesmo caminho de `getCurrentUser()`) e delega ao
    `grantConsent()`. Retorno `0` do update → `200` sem tocar em nada (CA5).
  - Log de entrada/saída com `usuarioId` e `tenantId`.
  - **Teste:** `UsuarioServiceImplTest` (`@Nested class RegisterConsent`) — primeiro aceite chama
    o repositório (CA3); retorno `0` não gera erro e responde normalmente (CA5); usuário
    inexistente no tenant → `DomainNotFoundException` (CA8); `@BeforeEach`/`@AfterEach` com
    `TenantContext`.
  - **Validação:** `./mvnw clean test`

- [ ] **1.7 Endpoint `POST /api/v1/users/me/consent` no `UsuarioController`**
  - `@PreAuthorize("isAuthenticated()")`, `@Valid @RequestBody ConsentInputDto`.
  - `@Operation` + `@ApiResponses` (`200`, `400`, `401`, `404`).
  - Retorna `ResponseEntity<Void>` (`200`). Sem try/catch.
  - Comentário explicando a ausência de `@RequireTenant` (self-resolving), no mesmo espírito do
    comentário já existente no topo da classe.
  - **Teste:** `UsuarioControllerTest` com `@WebMvcTest(UsuarioController.class)` + `MockMvc` +
    `@MockBean UsuarioService` — `200` com ambos `true` (CA3); `400` com aceite parcial e com
    campo nulo (CA4); `401` sem JWT.
  - **Validação:** `./mvnw clean test`

## 2. Backend — enforcement

- [ ] **2.1 `LgpdConsentRequiredException` + handler**
  - Exceção nova em `exception/`.
  - `@ExceptionHandler` no `GlobalExceptionHandler` → `403` com código `LGPD_CONSENT_REQUIRED`,
    no mesmo formato de erro dos handlers existentes.
  - **Validação:** `./mvnw clean compile`

- [ ] **2.2 `JwtTenantFilter` — expor o `Usuario` resolvido**
  - Constante pública `USUARIO_ATTR` no `JwtTenantFilter` — é **contrato** entre filtro e
    interceptor, não um atributo anônimo.
  - Depositar o `Usuario` resolvido pelo sync nesse atributo, para o interceptor consumir sem
    refazer a query. **Não** depositar quando não resolveu: a ausência do atributo é o sinal de
    "não resolvido".
  - Mudança aditiva — não alterar o comportamento existente de sync, fail-safe ou `503`.
  - **Teste:** atributo presente e tipado quando o sync resolve; **ausente** quando o sync falha e
    a leitura direta não acha o usuário.
  - **Validação:** `./mvnw clean test`

- [ ] **2.3 Flag `app.lgpd.consent-enforcement`**
  - `enum ConsentEnforcementMode { OFF, REPORT_ONLY, ON }` + `@ConfigurationProperties` com
    `@Validated`/`@NotNull` — **não** uma `String`.
  - **Default `OFF`** no `application.yml`. Valor inválido deve **falhar no boot**, nunca cair
    silenciosamente em `OFF` (isso desligaria o enforcement em produção sem sinal).
  - `report-only`: não bloqueia, mas loga `usuarioId`, rota e tenant de cada request que seria
    bloqueada.
  - **Teste:** binding de `off`/`report-only`/`on` resolve os três enums; valor desconhecido
    falha na inicialização do contexto.
  - **Validação:** `./mvnw clean test`

- [ ] **2.4 `LgpdConsentInterceptor` + registro no `WebMvcConfigurer`**
  - **Ordem obrigatória de guardas** (ver `design.md`): (1) sem `Authentication`/`Jwt` → passa;
    (2) sem `TenantContext` → passa; (3) role ≠ `TECNICO` → passa; (4) whitelist → passa;
    (5) `Usuario` não resolvido → **`503`**; (6) sem consentimento → `403`.
  - **Matching por padrão MVC resolvido** (`BEST_MATCHING_PATTERN_ATTRIBUTE` / `HandlerMethod`),
    **nunca** `String.startsWith` no `requestURI` — comparação de URI crua é bypass fácil.
  - Whitelist: `POST /api/v1/users/me/consent`, rotas `permitAll` da `SecurityFilterChain`,
    `/api/admin/**`, e **apenas `GET /actuator/health`** (não `/actuator/**`).
  - `GET`/`HEAD`/`OPTIONS` não são bloqueados — mas **não** registrar na spec que "GET = sem efeito
    colateral": auditar os `GET` com efeito (ex.: `StravaAuthController` `/auth` e `/callback`) e
    confirmar que nenhum é operação de coach.
  - **Teste:** `LgpdConsentInterceptorTest` — coach sem consentimento em `POST` com flag `on` →
    exceção (CA6); mesmo coach com flag `off` → passa e com `report-only` → passa e loga (CA10);
    `GET` → passa (CA7); próprio `POST /users/me/consent` → passa (CA7); coach com consentimento →
    passa; `ATLETA` sem consentimento → passa; sem `Authentication` → passa; sem `TenantContext` →
    passa (CA11); atributo `USUARIO_ATTR` **ausente** → `503` (CA12); atributo presente mas de
    tipo inesperado → `503`, nunca `403`.
  - **Teste de bypass de path:** `/api/v1/users/me/consent/`, `//api/v1/users/me/consent`,
    `;matrix=params` e percent-encoding continuam sendo reconhecidos como a rota isenta.
  - **Validação:** `./mvnw clean test`

- [ ] **2.5 Teste de integração do enforcement**
  - `@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")` com a flag em `on`:
    coach sem consentimento recebe `403 LGPD_CONSENT_REQUIRED` num endpoint de escrita real; após
    `POST /users/me/consent`, a mesma escrita passa.
  - Verificar que um webhook público (`/api/v1/strava/webhook`) e uma rota `/api/admin/**`
    continuam funcionando com a flag em `on` (CA11).
  - **Validação:** `./mvnw clean test`

## 3. Frontend

- [ ] **3.1 Regenerar o cliente OpenAPI**
  - Backend no ar → regenerar via `openapi-typescript-codegen` para trazer
    `lgpdConsentGranted` no tipo de `/users/me` e o novo método de consentimento.
  - Não editar tipos gerados à mão.
  - **Validação:** `npm run lint && npm run build`

- [ ] **3.2 `CoachConsentDialog`**
  - `src/features/coach/components/CoachConsentDialog.tsx`.
  - MUI `Dialog` bloqueante: `disableEscapeKeyDown`, sem fechar por backdrop, sem botão de fechar.
  - Responsivo — `fullScreen` em telas pequenas via `useMediaQuery`.
  - 2 checkboxes (Termos de Uso → link `#`; Política de Privacidade → link `/privacidade`).
  - Cabeçalho de passo ("Passo 1 de 4 — Consentimento") no mesmo container/stepper que
    `coach-first-login-wizard` vai adotar, para os dois overlays não parecerem barreiras distintas.
  - Botão "Aceitar e continuar" desabilitado até ambos marcados; `loading` no submit; `Alert` de erro.
  - **Teste:** `CoachConsentDialog.test.tsx` — botão desabilitado com 0 e com 1 checkbox e
    habilitado com 2 (CA2); submit chama o serviço; erro da API renderiza o `Alert`.
  - **Validação:** `npm run lint && npm run build && npm test`

- [ ] **3.3 `CoachLayout` — interceptar o consentimento**
  - Após carregar `me`, se `!me.lgpdConsentGranted` → renderizar **somente** o
    `CoachConsentDialog` (sem `CoachSidebar`, sem `<Outlet />`).
  - Após o `200`, refetch de `me` libera a navegação.
  - **Teste:** `CoachLayout.test.tsx` — com `lgpdConsentGranted=false` exibe o modal e **não**
    renderiza a sidebar (CA1); com `true` renderiza o layout normal sem modal; após o aceite,
    refetch libera.
  - **Validação:** `npm run lint && npm run build && npm test`

## 4. Verificação end-to-end (P0)

- [ ] **4.1** `V73` aplica em banco com dados existentes sem perda; coaches antigos ficam com
  `lgpd_consent_granted = false` (CA9). Confirmar a versão do PostgreSQL de produção (≥ 11).
- [ ] **4.2** Coach existente: login → modal bloqueante → aceitar → dashboard liberado.
- [ ] **4.3** Com a flag em `on`: escrita sem consentimento retorna `403 LGPD_CONSENT_REQUIRED`;
  após o aceite, passa (CA6).
- [ ] **4.4** Leitura e o endpoint de consentimento nunca são bloqueados (CA7).
- [ ] **4.5** Atleta e admin não são afetados pelo enforcement.
- [ ] **4.6** Isolamento de tenant: aceite do coach A não altera o coach B (CA8).
- [ ] **4.7** Reenvio do aceite preserva o `lgpd_consented_at` original, inclusive com dois POSTs
  concorrentes (CA5, CA13).
- [ ] **4.8** Flag em `off` não bloqueia nada; em `report-only` não bloqueia e produz log (CA10).
- [ ] **4.9** Webhooks públicos e rotas `/api/admin/**` seguem funcionando com a flag em `on` (CA11).
- [ ] **4.10** Modal responsivo em telas pequenas e grandes.
- [ ] **4.11** `./mvnw clean test` e `npm run lint && npm run build && npm test` verdes nos dois repos.

## 5. Gates antes de virar a flag para `on`

Estes itens **não bloqueiam a implementação nem o merge** — bloqueiam a ativação do enforcement
em produção.

- [ ] **5.1** Texto do checkbox de privacidade validado juridicamente (Q2).
- [ ] **5.2** Documento de Termos de Uso publicado e o link placeholder (`#`) substituído (Q2).
- [ ] **5.3** Comunicação prévia enviada aos coaches ativos (Q1).
- [ ] **5.4** Período em `report-only` concluído com a cauda de coaches sem aceite esvaziada.
- [ ] **5.5** RIPD declara a execução de contrato como base legal do sync em `tb_usuario`
  (o consentimento cobre Termos/Política, não o sync — ver "Enquadramento" no `design.md`).

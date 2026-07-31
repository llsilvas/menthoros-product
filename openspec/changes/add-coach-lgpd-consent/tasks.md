# Tasks — add-coach-lgpd-consent

**Tamanho:** S · **Trilha:** Full

Branch: `feature/add-coach-lgpd-consent` nos **dois** repos (`apps/menthoros-backend`,
`apps/menthoros-front`), criada a partir de `develop` antes de qualquer código.

---

## 1. Backend — persistência e contrato

- [ ] **1.1 Migração Flyway `V73__create_tb_usuario_lgpd_consent.sql`**
  - `CREATE TABLE IF NOT EXISTS tb_usuario_lgpd_consent` com `id UUID PK DEFAULT gen_random_uuid()`,
    `usuario_id UUID NOT NULL REFERENCES tb_usuario(id) ON DELETE CASCADE`, `tenant_id UUID NOT NULL`,
    `policy_version VARCHAR(20) NOT NULL`, `terms_version VARCHAR(20) NOT NULL`,
    `consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
  - `CONSTRAINT uk_usuario_lgpd_consent_versoes UNIQUE (usuario_id, policy_version, terms_version)`
    — é ela que garante idempotência e resolve a concorrência (CA5, CA13).
  - `CREATE INDEX IF NOT EXISTS idx_usuario_lgpd_consent_tenant_usuario ON
    tb_usuario_lgpd_consent(tenant_id, usuario_id)`.
  - Bloco `DO $$ ... RAISE NOTICE ... END$$;` conforme o padrão de migrações.
  - **`tb_usuario` NÃO é alterada** — nenhuma coluna nova lá.
  - Conferir que `V72` continua sendo a última antes de criar.
  - **Validação:** `./mvnw clean test`

- [ ] **1.2 Entidade `UsuarioLgpdConsent` + repository**
  - Entidade em `entity/`, mapeando a tabela; `consentedAt` como `Instant`; `@ManyToOne(LAZY)`
    para `Usuario`.
  - `UsuarioLgpdConsentRepository` com:
    - `boolean existsByUsuarioIdAndTenantIdAndPolicyVersionAndTermsVersion(...)` — usado pelo
      interceptor e pela derivação do granted;
    - `Optional<UsuarioLgpdConsent> findTopByUsuarioIdOrderByConsentedAtDesc(UUID usuarioId)` —
      último aceite, consumido por `add-coach-settings-page`.
  - **Nunca** expor update ou delete: a tabela é append-only por contrato.
  - **Teste:** `@DataJpaTest` — insert grava as versões; segundo insert com as **mesmas** versões
    viola `uk_usuario_lgpd_consent_versoes` (CA5/CA13); insert com versão **diferente** cria
    segunda linha e **preserva** a primeira intacta (CA15).
  - **Validação:** `./mvnw clean test`

- [ ] **1.3 `LgpdProperties` + `ConsentEnforcementMode`**
  - `enum ConsentEnforcementMode { OFF, REPORT_ONLY, ON }`.
  - `@ConfigurationProperties(prefix = "app.lgpd")` + `@Validated`, record com
    `@NotNull consentEnforcement`, `@NotBlank policyVersion`, `@NotBlank termsVersion`.
  - `application.yml`: `consent-enforcement: off` + as duas versões vigentes (`YYYY-MM-DD`).
  - Valor inválido/ausente **falha no boot** — nunca default silencioso.
  - **Teste:** binding de `off`/`report-only`/`on`; valor desconhecido e versão em branco falham a
    inicialização do contexto.
  - **Validação:** `./mvnw clean test`

- [ ] **1.4 `ConsentInputDto` (record em `dto/input/`)**
  - `termsAccepted` e `privacyPolicyAccepted` (`Boolean`) com `@NotNull` + `@AssertTrue`, mensagens
    em PT-BR.
  - `policyVersion` e `termsVersion` (`String`) com `@NotBlank` — o cliente ecoa o que renderizou.
  - `@Schema` na classe e em cada campo.
  - **Validação:** `./mvnw clean compile`

- [ ] **1.5 `UsuarioMeOutputDto` — granted derivado + versões vigentes**
  - `boolean lgpdConsentGranted` — **computado** em `getCurrentUser()` via
    `existsByUsuarioIdAndTenantIdAndPolicyVersionAndTermsVersion` com as versões da config. Não é
    campo persistido.
  - `String lgpdCurrentPolicyVersion` e `String lgpdCurrentTermsVersion`, vindos da config — o
    front precisa deles para ecoar no aceite.
  - **Não** expor `lgpdConsentedAt` (fica com `add-coach-settings-page`).
  - **Teste:** `UsuarioServiceImplTest` — sem registro → `false`; com registro das versões vigentes
    → `true`; com registro de versão **antiga** → `false` (CA16).
  - **Validação:** `./mvnw clean test`

- [ ] **1.6 `UsuarioService.registerConsent()` + impl**
  - JavaDoc obrigatório: `Idempotent: YES`, `Side Effects: Database insert
    (tb_usuario_lgpd_consent) — nunca update, nunca delete`, `Tenant-aware: YES`.
  - Resolve o caller pelo `sub` do JWT (mesmo caminho de `getCurrentUser()`).
  - **Valida as versões recebidas contra a config**; divergiu → `ConsentVersionStaleException`
    (CA14). Sem isso, um coach com a página aberta durante um deploy seria registrado aceitando
    um texto que nunca viu.
  - Insere a linha. `DataIntegrityViolationException` na constraint → tratada como **no-op
    idempotente**, retorna sucesso (CA5). Isso não é mapeamento de HTTP no service — é traduzir
    corrida perdida em no-op; o status segue decidido no `GlobalExceptionHandler`.
  - Log de entrada/saída com `usuarioId`, `tenantId` e versões.
  - **Teste:** `UsuarioServiceImplTest` (`@Nested class RegisterConsent`) — primeiro aceite insere
    (CA3); versão defasada → `ConsentVersionStaleException` e **nenhum** insert (CA14); violação
    de constraint → sem erro (CA5); usuário inexistente no tenant → `DomainNotFoundException`
    (CA8); `@BeforeEach`/`@AfterEach` com `TenantContext`.
  - **Validação:** `./mvnw clean test`

- [ ] **1.7 Endpoint `POST /api/v1/users/me/consent` no `UsuarioController`**
  - `@PreAuthorize("isAuthenticated()")`, `@Valid @RequestBody ConsentInputDto`.
  - `@Operation` + `@ApiResponses` (`200`, `400`, `401`, `404`, `409`).
  - Retorna `ResponseEntity<Void>` (`200`). Sem try/catch.
  - Comentário explicando a ausência de `@RequireTenant` (self-resolving), no mesmo espírito do
    comentário já existente no topo da classe.
  - **Teste:** `@WebMvcTest(UsuarioController.class)` + `MockMvc` + `@MockBean UsuarioService` —
    `200` com aceite completo e versões corretas (CA3); `400` com aceite parcial, campo nulo ou
    versão em branco (CA4); `409` quando o service lança `ConsentVersionStaleException` (CA14);
    `401` sem JWT.
  - **Validação:** `./mvnw clean test`

## 2. Backend — enforcement

- [ ] **2.1 Exceções + handlers**
  - `LgpdConsentRequiredException` e `ConsentVersionStaleException` em `exception/`.
  - Dois `@ExceptionHandler` no `GlobalExceptionHandler` → `403 LGPD_CONSENT_REQUIRED` e
    `409 CONSENT_VERSION_STALE`, no mesmo formato de erro dos handlers existentes.
  - Códigos distintos importam: o front trata `403` mostrando o modal e `409` recarregando o texto
    atualizado.
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

- [ ] **2.3 Modo `report-only`**
  - O enum e o `LgpdProperties` já vieram na task 1.3 — aqui é só o comportamento.
  - `REPORT_ONLY`: **não** bloqueia, mas loga cada request que *seria* bloqueada, com `usuarioId`,
    rota e tenant. É o insumo para saber quando é seguro virar `ON`.
  - `OFF`: nem bloqueia nem loga.
  - **Teste:** coberto junto com 2.4 (CA10).
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
  - Backend no ar → regenerar via `openapi-typescript-codegen` para trazer `lgpdConsentGranted`,
    `lgpdCurrentPolicyVersion` e `lgpdCurrentTermsVersion` no tipo de `/users/me`, além do novo
    método de consentimento.
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
  - **Envia as versões recebidas do `/users/me`** (`lgpdCurrentPolicyVersion`/
    `lgpdCurrentTermsVersion`) — **nunca** constantes hardcoded no front, para não criar segunda
    fonte de verdade.
  - `409 CONSENT_VERSION_STALE` → refetch de `me` e reapresentação, avisando que os termos foram
    atualizados.
  - **Teste:** `CoachConsentDialog.test.tsx` — botão desabilitado com 0 e com 1 checkbox e
    habilitado com 2 (CA2); submit envia as versões vindas de `me`; `409` dispara refetch e mantém
    o modal aberto (CA14); erro genérico da API renderiza o `Alert`.
  - **Validação:** `npm run lint && npm run build && npm test`

- [ ] **3.4 `PrivacidadePage` — data de vigência alinhada**
  - A data exibida na Política precisa bater com `app.lgpd.policy-version`. Divergência significa
    que o coach aceitou um texto e o sistema registrou outra versão.
  - Conferência é manual (documento estático); registrar a data vigente no topo da página.
  - **Validação:** `npm run lint && npm run build`

- [ ] **3.3 `CoachLayout` — interceptar o consentimento**
  - Após carregar `me`, se `!me.lgpdConsentGranted` → renderizar **somente** o
    `CoachConsentDialog` (sem `CoachSidebar`, sem `<Outlet />`).
  - Após o `200`, refetch de `me` libera a navegação.
  - **Teste:** `CoachLayout.test.tsx` — com `lgpdConsentGranted=false` exibe o modal e **não**
    renderiza a sidebar (CA1); com `true` renderiza o layout normal sem modal; após o aceite,
    refetch libera.
  - **Validação:** `npm run lint && npm run build && npm test`

## 4. Verificação end-to-end (P0)

- [ ] **4.1** `V73` cria `tb_usuario_lgpd_consent` vazia sem tocar em `tb_usuario`; coaches
  existentes passam a computar `lgpdConsentGranted = false` por ausência de registro (CA9).
- [ ] **4.2** Coach existente: login → modal bloqueante → aceitar → dashboard liberado.
- [ ] **4.3** Com a flag em `on`: escrita sem consentimento retorna `403 LGPD_CONSENT_REQUIRED`;
  após o aceite, passa (CA6).
- [ ] **4.4** Leitura e o endpoint de consentimento nunca são bloqueados (CA7).
- [ ] **4.5** Atleta e admin não são afetados pelo enforcement.
- [ ] **4.6** Isolamento de tenant: aceite do coach A não altera o coach B (CA8).
- [ ] **4.7** Reenvio do aceite não cria segunda linha e preserva o `consented_at` original,
  inclusive com dois POSTs concorrentes (CA5, CA13).
- [ ] **4.8** Flag em `off` não bloqueia nada; em `report-only` não bloqueia e produz log (CA10).
- [ ] **4.9** Webhooks públicos e rotas `/api/admin/**` seguem funcionando com a flag em `on` (CA11).
- [ ] **4.10** **Ciclo de re-consentimento:** aceitar a versão vigente → bumpar
  `app.lgpd.policy-version` → `me` volta a `lgpdConsentGranted = false` e o modal reaparece (CA16)
  → aceitar de novo cria **segunda** linha, com a primeira intacta (CA15).
- [ ] **4.11** **Versão defasada:** enviar aceite com `policyVersion` antigo retorna
  `409 CONSENT_VERSION_STALE` e não grava (CA14).
- [ ] **4.12** Data de vigência exibida na `PrivacidadePage` bate com `app.lgpd.policy-version`.
- [ ] **4.13** Modal responsivo em telas pequenas e grandes.
- [ ] **4.14** `./mvnw clean test` e `npm run lint && npm run build && npm test` verdes nos dois repos.

## 5. Gates antes de virar a flag para `on`

Estes itens **não bloqueiam a implementação nem o merge** — bloqueiam a ativação do enforcement
em produção.

- [ ] **5.1** Texto do checkbox de privacidade validado juridicamente (Q2).
- [ ] **5.2** Documento de Termos de Uso publicado e o link placeholder (`#`) substituído (Q2).
- [ ] **5.3** Comunicação prévia enviada aos coaches ativos (Q1).
- [ ] **5.4** Período em `report-only` concluído com a cauda de coaches sem aceite esvaziada.
- [ ] **5.5** RIPD declara a execução de contrato como base legal do sync em `tb_usuario`
  (o consentimento cobre Termos/Política, não o sync — ver "Enquadramento" no `design.md`).
- [ ] **5.6** `app.lgpd.policy-version` e `terms-version` apontam para as datas de vigência **reais**
  dos documentos publicados, não para placeholders.
- [ ] **5.7** Decisão da **Q6** registrada: nenhum backfill de "aceite presumido" para coaches
  existentes (o correto sob LGPD é não presumir; registrar explicitamente para não virar dúvida
  depois).

## 6. Procedimento de bump de versão (operacional, pós-entrega)

Trocar a Política ou os Termos **invalida o consentimento de todos os coaches de uma vez**. Com a
flag em `on`, isso é um lock-out em massa. Sequência obrigatória, toda vez:

- [ ] **6.1** Baixar a flag para `report-only` **antes** de publicar a nova versão.
- [ ] **6.2** Publicar o documento e atualizar `app.lgpd.*` com a nova data de vigência.
- [ ] **6.3** Comunicar os coaches.
- [ ] **6.4** Acompanhar o log de `report-only` até a cauda de não-aceites esvaziar.
- [ ] **6.5** Voltar para `on`.

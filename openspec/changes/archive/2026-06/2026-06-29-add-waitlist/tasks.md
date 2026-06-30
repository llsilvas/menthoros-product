## 1. Backend — Migração e domínio

- [x] 1.1 Criar migração `V43__Create_waitlist.sql` (`tb_waitlist` + `email_normalized` + índice único `uk_waitlist_email_normalized` + `aceite_lgpd`). Validação de numeração: confirmado que a maior versão atual é `V42` e `V43` está livre — **revalidar com `ls db/migration/V43*` imediatamente antes do merge**; se outra branch tiver introduzido `V43`, renumerar para a próxima livre e atualizar esta task
- [x] 1.2 Criar enums `PerfilWaitlist` e `FaixaAtletas` em `enums/`
- [x] 1.3 Criar `entity/Waitlist` como `@Entity` próprio (`@Id @GeneratedValue(UUID)`, `Instant createdAt`) — **não** herdar `BaseEntity`/`AuditableEntity`
- [x] 1.4 Criar `repository/WaitlistRepository` com `existsByEmailNormalized`
- [x] Validação: `AtletaRepositoryTest` (IT Testcontainers Postgres) verde — Flyway aplica V43 e Hibernate `validate` confere a entidade `Waitlist`

## 2. Backend — Service, contrato e segurança

- [x] 2.1 Criar `dto/input/WaitlistInputDto` + `dto/output/WaitlistOutputDto` com Bean Validation (`@NotBlank` nome, `@NotBlank @Email` email, `@NotNull` perfil, `@NotNull @AssertTrue` aceiteLgpd; telefone/qtdAtletas/website opcionais)
- [x] 2.2 Implementar `services/WaitlistService` (interface) + `services/impl/WaitlistServiceImpl` (TDD): normaliza e-mail (`trim`/lower `Locale.ROOT`), valida honeypot, fast-path `existsBy`, persiste e **captura `DataIntegrityViolationException`** → idempotente
- [x] 2.3 Criar `controller/WaitlistController` — `POST /api/v1/waitlist` (`@Valid`, `@ApiResponses`), mapeia 201 (novo/honeypot) / 200 (duplicado) / 400 (validação) / 429 (rate-limit)
- [x] 2.4 Incluir `/api/v1/waitlist` em `JwtTenantFilter.shouldNotFilter()` (hoje só `/api/admin/`) e em `CoreSecurityProperties.publicPaths`
- [x] 2.5 Implementar rate-limit por IP em `POST /api/v1/waitlist` via `security/WaitlistRateLimitFilter` com Caffeine: **5 submissões/minuto por IP** (propriedade `app.waitlist.rate-limit.per-minute=5`) → `429` no excedente
- [x] 2.6 CORS: `CorsConfig` já lê `CORS_ALLOWED_ORIGINS` por env (sem mudança de código). **Pendente de deploy:** adicionar a URL do front no Railway ao env do backend (devops)
- [x] Validação: `./mvnw test` — suite completo verde (1046 testes); `WaitlistServiceImplTest` 6/6 (AC3, AC3b corrida, AC4 honeypot, normalização). Testes web do controller (AC1, AC2, AC5b, AC10, AC11) na Seção 5.2

## 3. Frontend — Rota e página

- [x] 3.1 Adicionar `WAITLIST: '/waitlist'` (+ `PRIVACIDADE: '/privacidade'`) em `constants/routes.ts`
- [x] 3.2 Registrar `/waitlist` (e `/privacidade`) **fora** de `ProtectedRoute` no `App.tsx` (irmãs de `/` e `/auth/login`)
- [x] 3.3 Criar `services/WaitlistService.ts` (`inscrever`, `fetch` público sem auth) + `hooks/useWaitlist.ts` (estado/erro) + `types/Waitlist.ts`. (Em `src/services/`, não `src/api/` que é gerado)
- [x] 3.4 Criar `pages/waitlist/WaitlistPage.tsx` — form no tema (nome, e-mail, telefone opcional, perfil), faixa de atletas **condicional** ao perfil treinador, **checkbox LGPD + link de política** (`/privacidade`, placeholder), honeypot oculto, estados idle/enviando/sucesso/erro, responsivo. + `PrivacidadePage.tsx` placeholder
- [x] 3.5 Preservar valores do form em erro (hook não toca o estado do form); diferenciar validação/backend/rede/`429` em `useWaitlist`; feedback acessível (`Alert role="alert"`, foco no título de sucesso)
- [x] Validação: `npm run lint` (No issues) + `npm run build` (✓ tsc + vite)

## 4. Frontend — Integração da landing

- [x] 4.1 Repontar os CTAs de conversão da landing (`Começar grátis`, `Começar agora`, planos) para `navigate('/waitlist')` (handler `goToWaitlist`)
- [x] 4.2 "Entrar" passou a ir a `/auth/login` (handler `goToLogin`) — antes ia ao dashboard
- [ ] 4.3 (pré-go-live, **não bloqueia código**) Publicar a Política de Privacidade na rota `/privacidade` (hoje placeholder) com o conteúdo real antes do lançamento público
- [x] Validação: `npm run lint` (No issues) + `npm run build` (✓)

## 5. Testes

- [x] 5.1 Backend: `WaitlistServiceImplTest` (6) — cadastro, idempotência, **corrida via `DataIntegrityViolationException`**, honeypot, normalização
- [x] 5.2 Backend: `WaitlistControllerIT` (6, IT real) — 201 sem auth, 400 inválido/`aceiteLgpd=false`, 200 duplicado, honeypot 201 sem persistir, 429 rate-limit, sem CSRF; `JwtTenantFilterShouldNotFilterTest` (AC5b: `/api/v1/waitlist` isento)
- [x] 5.3 Frontend: `WaitlistPage.test.tsx` (5) — LGPD habilita envio, campo condicional, honeypot oculto, sucesso, erro preservando valores; `LandingPage.test.tsx` (2) — CTAs → `/waitlist`, Entrar → `/auth/login`
- [x] Validação: backend `./mvnw test` (1047, 0 falhas); frontend `npm run test:run` (259, 0 falhas) + `lint` + `build`

## 6. Aceitação

- [x] 6.1 AC1–AC5b, AC10–AC11 (backend) verificados: AC1/AC2/AC3/AC10/AC11 em `WaitlistControllerIT`; AC3b/AC4 em `WaitlistServiceImplTest`; AC5b em `JwtTenantFilterShouldNotFilterTest`
- [x] 6.2 AC6–AC9 (frontend): AC6 rota fora de `ProtectedRoute` (renderiza standalone); AC7/AC8 em `WaitlistPage.test`; AC9 em `LandingPage.test`
- [x] 6.3 IT `cadastroValidoSemAuth` grava em `tb_waitlist` com `aceite_lgpd=true` (+ perfil/faixa/`created_at`); tela de confirmação coberta por `WaitlistPage` (AC8)

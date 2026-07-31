# Tasks — keycloak-user-onboarding-auth

## Backend (7 tasks)

- [ ] 1.1 **DTO `CoachSignupInputDto`:** record com `nome`, `email`, `senha`, `nomeAssessoria`, `dominioAssessoria`; validações `@NotBlank`, `@Email`, `@Size`.
- [ ] 1.2 **Serviço `CoachSignupService`:** método `cadastrar()` que, em uma transação, (a) cria Assessoria via `AssessoriaService`, (b) provisiona Keycloak user + organization, (c) cria Usuario vinculado, (d) retorna token JWT para login automático.
- [ ] 1.3 **Endpoint `POST /api/public/signup`:** público (sem auth), chama `CoachSignupService`, retorna 201 + `{ token, redirectTo }`.
- [ ] 1.4 **Verificar domínio único** — `AssessoriaRepository.existsByDominio()` já cobre; erro 409 se duplicado.
- [ ] 1.5 **Verificar e-mail único** — validar no Keycloak antes de criar; erro 409 se já existir.
- [ ] 1.6 **Plano padrão:** toda assessoria criada via signup recebe `plano = BASIC`, `maxAtletas = 10`, `maxTecnicos = 1`.
- [ ] 1.7 **Testes:** `CoachSignupServiceTest` — cadastro feliz, domínio duplicado, e-mail duplicado, rollback em falha parcial.

## Frontend (5 tasks)

- [ ] 2.1 **Página `CoachSignupPage`** (`/cadastro`): formulário MUI com 5 campos (nome, email, senha, nome assessoria, domínio) + checkbox LGPD (Termos + Privacidade).
- [ ] 2.2 **Validação client-side** — e-mail válido, senha ≥ 8 caracteres, domínio `[a-z0-9-]+`, nome assessoria obrigatório.
- [ ] 2.3 **`useCoachSignup` hook:** chama `POST /api/public/signup`, gerencia estados loading/error/success.
- [ ] 2.4 **Login automático pós-cadastro:** receber token JWT → `localStorage.setItem` → `useAuth().login(token)` → redirect.
- [ ] 2.5 **Testes:** `CoachSignupPage.test.tsx` — renderiza form, valida campos, submete, redireciona.

## Verificação (6 tasks)

- [ ] 3.1 Cadastro feliz: coach criado, assessoria criada, login automático → modal consentimento.
- [ ] 3.2 Domínio duplicado: erro 409, mensagem amigável.
- [ ] 3.3 E-mail Keycloak enviado (verify-email).
- [ ] 3.4 Rollback: se Keycloak falhar após criar Assessoria, assessoria é desfeita.
- [ ] 3.5 Rota pública `/cadastro` acessível sem auth.
- [ ] 3.6 Senha nunca logada (mascarada no front, ausente nos logs do backend).

## Sizing: M (~18 tasks)

**Tamanho:** M · **Trilha:** Full

> Critérios de seleção da trilha: toca **dois repositórios** (backend + frontend), introduz **novo contrato de API** (`POST /api/v1/waitlist`) e **novo schema de banco** (`tb_waitlist`). Qualquer um desses já obriga Full.

## Why

O Menthoros está em fase pré-lançamento e ainda não abre auto-cadastro. A `marketing-landing-page`
apresenta o produto, mas deliberadamente deixou a captura de leads de fora ("first version will focus
on product storytelling, not lead capture forms"). Hoje os CTAs da landing ("Começar grátis/agora")
levam direto ao dashboard interno — sem porta de entrada para o interessado que ainda não tem conta.

Falta um mecanismo para **capturar quem quer testar o Menthoros** — sobretudo treinadores (persona
primária) — e formar a fila do beta fechado. Sem isso, o interesse gerado pela landing se perde.

## What Changes

- Adicionar uma **waitlist pública** que registra interessados em testar o Menthoros.
- Backend: novo endpoint público `POST /api/v1/waitlist` que persiste em uma nova tabela
  `tb_waitlist` (sem tenant — cadastro global, pré-signup).
- Frontend: nova **rota pública** `/waitlist` com formulário (nome, e-mail, telefone opcional, perfil
  treinador/atleta e — só para treinador — faixa de atletas atendidos) e tela de confirmação.
- Repontar os CTAs de conversão da landing ("Começar grátis", "Começar agora", planos) para `/waitlist`;
  o botão **"Entrar"** permanece indo a `/auth/login`.
- Aviso de privacidade + checkbox de aceite **LGPD** obrigatório no formulário (bloqueia o envio).
- Anti-abuso: honeypot + **rate-limit leve por IP** (Caffeine), e-mail único idempotente e Bean Validation.

> **Decisão D0 — construir vs. ferramenta externa:** optou-se por **construir no próprio stack** (dados no
> PostgreSQL desde o início para cruzar com usuários futuros, branding consistente, base para UTM), em vez
> de Tally/Google Forms. Detalhe em `design.md` (D0).

## Capabilities

### New Capabilities

- `waitlist`: Captura pública de interessados no beta do Menthoros, com perfil e segmentação básica,
  persistida no domínio Menthoros para consulta direta.

### Modified Capabilities

- `marketing-landing-page`: Os CTAs de conversão passam a direcionar para `/waitlist` em vez do
  dashboard interno; "Entrar" segue para o login. (Sem alteração de layout/conteúdo das seções.)

## Impact

- **Banco (backend):** migração Flyway `V43__Create_waitlist.sql` — tabela `tb_waitlist` com constraint
  única `uk_waitlist_email_normalized` em `email_normalized`. Não destrutiva.
- **API (backend):** novo controller público `POST /api/v1/waitlist` (convenção `/api/v1/` do módulo).
  Ajustes pontuais: adicionar `/api/v1/waitlist` a `CoreSecurityProperties.publicPaths` (permitAll, como
  `/api/v1/status`); incluir `/api/v1/waitlist` em `JwtTenantFilter.shouldNotFilter()` (hoje só ignora
  `/api/admin/`) para que usuário autenticado também não dependa de tenant nesse caminho; o
  `CorsConfig` já lê `CORS_ALLOWED_ORIGINS` por env (sem mudança de código).
- **Domínio (backend):** `entity/Waitlist` (entidade própria com `@Id` próprio — **não** herda
  `BaseEntity`/`AuditableEntity`), `enums/PerfilWaitlist`, `enums/FaixaAtletas`,
  `dto/input/WaitlistInputDto` + `dto/output/WaitlistOutputDto`, `repository/WaitlistRepository`,
  `services/WaitlistService` (interface) + `services/impl/WaitlistServiceImpl` (idempotência resiliente a
  corrida), `controller/WaitlistController`, `security/WaitlistRateLimitFilter` (Caffeine).
- **UI (frontend):** nova rota `/waitlist` fora de `ProtectedRoute`; `pages/waitlist/WaitlistPage.tsx`;
  `api/services/WaitlistService.ts`; ajuste dos handlers de CTA em `pages/landing/LandingPage.tsx` e
  da constante em `constants/routes.ts`.
- **Segurança/multi-tenancy:** endpoint público sem auth — risco mitigado por não expor dados de
  tenant, honeypot e validação. Sem leitura pública (consulta dos cadastros é direta no banco).

## Critérios de aceite

Backend — `POST /api/v1/waitlist`:

- **AC1 — cadastro válido:** *Given* um corpo válido (nome, e-mail, perfil) *When* `POST /api/v1/waitlist`
  *Then* responde `201 Created` e persiste uma linha em `tb_waitlist` com `created_at` preenchido — **sem
  exigir autenticação**.
- **AC2 — campos obrigatórios:** *Given* corpo sem `nome`, `email` inválido ou `perfil` ausente *When*
  `POST` *Then* responde `400 Bad Request` com os erros de validação e **não** persiste.
- **AC3 — e-mail duplicado é idempotente:** *Given* um e-mail já cadastrado (case-insensitive) *When*
  novo `POST` com o mesmo e-mail *Then* responde `200 OK` ("já está na lista") e **não** cria linha
  duplicada.
- **AC3b — idempotência sob corrida:** *Given* duas requisições concorrentes com o mesmo e-mail *When*
  ambas passam o `existsBy` e tentam inserir *Then* o índice único dispara `DataIntegrityViolationException`,
  o service a **captura** e responde `200 OK` — **nunca** vaza `409/500`.
- **AC4 — honeypot:** *Given* corpo com o campo honeypot `website` preenchido *When* `POST` *Then* a
  requisição é tratada como bot (não persiste) e responde de forma indistinguível de sucesso (`200/201`).
- **AC5 — sem tenant:** *Given* a requisição pública sem JWT *When* `POST` *Then* o `JwtTenantFilter`
  não popula `TenantContext` e a operação conclui sem erro de tenant.
- **AC5b — caminho público com token:** *Given* uma requisição a `/api/v1/waitlist` **com** header
  `Authorization` (usuário logado) *When* `POST` *Then* o `JwtTenantFilter` ignora o caminho
  (`shouldNotFilter`) e a operação conclui sem exigir `tenant_id`.
- **AC10 — consentimento LGPD:** *Given* o corpo sem `aceiteLgpd = true` *When* `POST` *Then* responde
  `400` e não persiste; *And* o formulário **bloqueia** o envio enquanto o checkbox de aceite não estiver
  marcado, exibindo o aviso de finalidade (texto em design D7) + link para a política em `/privacidade`.
- **AC11 — rate-limit por IP:** *Given* um mesmo IP excedendo **5 submissões/minuto** (padrão
  configurável `app.waitlist.rate-limit.per-minute`) *When* novos `POST` *Then* responde `429 Too Many
  Requests` sem persistir.

Frontend — rota `/waitlist`:

- **AC6 — rota pública:** *Given* um visitante não autenticado *When* acessa `/waitlist` *Then* o
  formulário renderiza **sem** redirecionar para login.
- **AC7 — campo condicional:** *Given* o perfil selecionado é "Treinador" *When* o form renderiza *Then*
  o campo "quantos atletas você atende" aparece; *When* perfil é "Atleta" *Then* o campo fica oculto.
- **AC8 — envio com sucesso:** *Given* o form preenchido validamente *When* enviado *Then* exibe a tela
  de confirmação ("Você está na lista") e não mantém o usuário no formulário.
- **AC9 — CTAs da landing:** *Given* a landing *When* o usuário clica "Começar grátis"/"Começar agora"
  *Then* navega para `/waitlist`; *When* clica "Entrar" *Then* navega para `/auth/login`.

## Métrica de sucesso

- **Leads de treinador capturados:** nº de cadastros com `perfil = TREINADOR` em `tb_waitlist` — semente
  do beta fechado (persona primária). Meta inicial: ≥ 30 treinadores na fila nas primeiras 4 semanas.
- **Taxa de conversão da landing → waitlist:** submissões de `/waitlist` ÷ visitantes da landing.
  (Ligação com a rotina do treinador é indireta nesta fase pré-produto — ver Open Questions.)

## Open Questions & Assumptions

**Decisões tomadas (revisões product + pré-mortem):**

- **D0 — construir no stack** (vs. ferramenta externa): dados no PostgreSQL desde já, branding, base UTM.
- **LGPD no escopo** (bloqueia go-live): aviso + checkbox de aceite obrigatório → AC10.
- **Anti-spam** = honeypot + **rate-limit leve por IP** (Caffeine) no MVP. CAPTCHA/Turnstile é follow-up.

**Premissas assumidas (validadas no código):**

- `/api/v1/waitlist` adicionado a `publicPaths` (permitAll); para requisição anônima o `JwtTenantFilter`
  já passa. Ajuste: incluir `/api/v1/waitlist` em `shouldNotFilter()` para cobrir também usuário autenticado.
- A waitlist é **global, sem tenant** — `Waitlist` é entidade própria (não herda `BaseEntity`, que é
  órfã e sem `@MappedSuperclass`; nem `AuditableEntity`, que adicionaria `created_by/updated_by`).
- Idempotência por e-mail normalizado (`trim`+lower) em coluna própria com índice único, com captura de
  `DataIntegrityViolationException` para resiliência a corrida.
- MVP **não** envia e-mail de confirmação nem expõe tela de admin; consulta direta no PostgreSQL.
- Faixas de "quantos atletas atende": `ATE_10`, `DE_11_A_30`, `DE_31_A_100`, `MAIS_DE_100`.

**Em aberto (não bloqueiam a implementação):**

- A métrica de sucesso liga-se à rotina do treinador apenas de forma indireta (captação pré-produto) —
  aceitável para uma feature de aquisição, mas registrado como tensão com a estrela-guia.
- Conteúdo real da **Política de Privacidade** em `/privacidade` (hoje placeholder) — pré-requisito de
  **go-live**, não de implementação (task 4.3). Texto do aviso já fixado em design D7.
- Domínio custom de produção no CORS: por ora usa a URL do front no Railway; custom entra via env quando
  existir (devops). `origem`/UTM real fica como follow-up.

**Resolvidos no gate de DoR:** taxa de rate-limit (5/min por IP), numeração `V43` (livre, revalidar no
merge), texto do aviso LGPD (design D7), origem CORS (URL Railway via env).

**Limitação aceita (QA gate):** o rate-limit usa `X-Forwarded-For`, que o cliente pode forjar para
escapar do contador. Aceito por ser endpoint público de dado de baixo valor com anti-spam best-effort;
o reforço (confiar no XFF só do proxy do Railway via `server.forward-headers-strategy`) é tarefa de infra
no go-live, não-bloqueante. Enumeração de e-mail (200 vs 201, AC3) mantida — risco baixo para waitlist.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Spam/abuso em endpoint público | Honeypot + **rate-limit por IP** (Caffeine) + Bean Validation; CAPTCHA como follow-up |
| Hibernate falha no boot por herança de `BaseEntity` (sem `@MappedSuperclass`) | `Waitlist` declara o próprio `@Id`; não herda Base/Auditable |
| Corrida em e-mail duplicado vazando `409/500` | Índice único + **captura de `DataIntegrityViolationException`** → `200` idempotente |
| Usuário autenticado em `/waitlist` rejeitado por falta de tenant | `/api/v1/waitlist` em `shouldNotFilter()`; teste com token sem tenant |
| Vazamento de dados de tenant via rota pública | Entidade sem tenant; nada de tenant lido/escrito; sem endpoint de leitura |
| Preflight CORS falha em produção | Declarar domínio da landing em `CORS_ALLOWED_ORIGINS` |
| Risco legal LGPD na coleta de dados pessoais | Aviso + checkbox de aceite obrigatório (AC10), registro de `aceiteLgpd` |
| Form perde dados em erro de rede | Não resetar estado no `finally`; preservar valores + retry |
| CTAs da landing apontando para fluxo inexistente | Rota `/waitlist` entregue na mesma change (walking skeleton) |

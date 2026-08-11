# Tasks — keycloak-user-onboarding-auth

## 0. Pré-condição herdada — o gateway admin não funciona hoje

> Achado em 2026-08-06 durante a `disable-ropc-direct-grant`, roteado para cá porque **o signup
> desta change depende inteiramente dele** para provisionar organização e usuário no Keycloak.

- [x] 0.1 **Já provisionado — verificado no Railway em 2026-08-09.** `KC_ADMIN_USER`,
      `KC_ADMIN_PASSWORD`, `KEYCLOAK_SERVER_URL` (domínio privado
      `menthoros-keycloak.railway.internal:8080`), `KEYCLOAK_ISSUER_URI` e `KEYCLOAK_JWK_URI`
      estão definidos no serviço `menthoros-backend`, ambiente `develop`.
      📌 A task estava marcada como aberta por desatualização do documento, não por falta de
      execução — o que muda a leitura do risco de merge: o endpoint **funcionaria** no Railway,
      não falharia.
- [x] 0.2 **NÃO precisa.** Verificado em 2026-08-09:
      - os `*IT` de controller autenticam com o post-processor `jwt()` (JWT sintético), não com
        token real — nenhum direct grant envolvido;
      - o endpoint desta change é público: `/api/public/**` **já consta** em
        `CoreSecurityProperties.publicPaths` (`config/core/CoreSecurityProperties.java:22`).
      O `menthoros-test` só seria ligado para exploração manual de API, temporariamente, pelo
      procedimento do `menthoros-infra/keycloak/README.md`.
      📌 **De quebra, confirma o escopo da 2.4b:** o Spring Security já libera a rota; o que
      falta é a isenção no `JwtTenantFilter`, que é outro filtro, mais cedo na cadeia.
      ~~Conferir se o `menthoros-test` precisa ser ligado~~ para algum teste desta change. Ele
      nasce `enabled: false` desde 2026-08-06 (mantém direct grant, e deixá-lo ligado devolveria o
      vetor que o corte eliminou). Procedimento em `menthoros-infra/keycloak/README.md`.

## 1. Discovery e decisões

- [x] 1.1 **Mapeado em 2026-08-09.** Caminhos reais, com o que se reaproveita:

      | O que | Onde | Reaproveita? |
      |---|---|---|
      | Fluxo PKCE do front | `context/auth/{oidcConfig,userManager,AuthProvider}.ts(x)` | ✅ pronto — o cadastro só precisa iniciá-lo |
      | Claim de tenant | scope **optional** `organization` → `tenant_id` no claim | ✅ já pedido em `oidcConfig.ts` |
      | Tenant por request | `JwtTenantFilter` → `TenantContext` | ⚠️ precisa da isenção da 2.4b |
      | Rota pública no Security | `CoreSecurityProperties.publicPaths` já tem `/api/public/**` | ✅ nada a fazer |
      | Gate LGPD | `LgpdConsentInterceptor` já libera sem JWT/tenant | ✅ nada a fazer |
      | Conflito (409) | `DuplicateResourceException` → `CONFLICT` | ✅ **não criar exceção nova** |
      | Falha do Keycloak (502) | `KeycloakIntegrationException` → `BAD_GATEWAY` | ✅ **não criar exceção nova** |
      | Gateway Keycloak | `KeycloakOrganizationGatewayImpl` | ⚠️ só `criarOrganization` e `enviarConviteAtleta` — o resto é a 2.3 |
      | Rate limit | `WaitlistRateLimitFilter` (Caffeine, por `getRemoteAddr()`) | ⚠️ generalizar na 2.6 |
      | Honeypot | `WaitlistInputDto` + resposta indistinguível no controller | ✅ copiar o padrão |
      | Slug | `tb_assessoria.dominio` **UNIQUE** | ✅ **não criar campo** |

      📌 **O reaproveitamento é maior do que a estimativa L sugere.** O que a change realmente
      constrói é o **orquestrador** e a **tabela de provisionamento** — quase todo o resto já
      existe e só precisa ser conectado.
- [x] 1.2 **ADR 0009 escrito** — `apps/menthoros-backend/docs/adr/0009-provisionamento-de-signup-sem-transacao-entre-postgres-e-keycloak.md`,
      com as cinco decisões e as consequências, para que sobrevivam ao arquivamento da change.
      ~~Decidir e documentar em ADR curto:~~ ~~container de tenant~~, ~~verificação de e-mail~~,
      ~~estado de provisionamento~~, compensação/reconciliação e proteção anti-abuso.
      **Três já decididas em 2026-08-07 e registradas no `design.md`:**
      - **tenant = Organizations** (não grupo/atributo) — é o caminho já implementado no gateway;
        vêm juntas as restrições de um-usuário-uma-organização e do scope optional.
      - **`verifyEmail: true` no realm**, desconsiderando os cadastros existentes (decisão do CTO).
      - **estado de provisionamento** = tabela `tb_signup_provisioning` (V75), esboçada no design.
      Restam **compensação/reconciliação** (detalhe operacional do runbook) e **anti-abuso**
      (ligado à 2.6: generalizar o `WaitlistRateLimitFilter` ou criar outro).
- [x] 1.3 **FEITO em 2026-08-07 — `spec.md` reescrito.** A versão anterior especificava
      `POST /api/public/auth/login` com `username`/`password` devolvendo `accessToken`, e
      `POST /api/admin/usuarios` — ou seja, **ROPC**, o grant desligado no realm em 2026-08-06.
      Como `specs/` vira contrato canônico ao arquivar, aquilo consagraria de volta o que a
      `disable-ropc-direct-grant` eliminou. Agora especifica o signup público, PKCE para o login,
      a travessia dos filtros, a compensação em ordem inversa, a verificação de e-mail nativa e
      o anti-abuso.

## 2. Backend

- [x] 2.1 `CoachSignupInputDto` + 35 testes. Normalização no construtor compacto roda **antes** da
      validação, então ` ADMIN ` não escapa da reserva por caixa alta. A senha fica fora da
      normalização de propósito — trim mudaria o segredo escolhido.
      ⚠️ **`default` é slug reservado de fato**, não hipotético: é o tenant semeado pela V2.
      ⚠️ **O realm não tem `passwordPolicy`** — o `@Size` da senha é hoje o *único* portão de
      força. Ver 4.x.
      *verify:* `./mvnw test -Dtest=CoachSignupInputDtoTest` → 35/35 verdes.
- [x] 2.2 `V75__create_tb_signup_provisioning.sql` + `SignupProvisioningMigrationTest`.
      Ajustes contra o esboço do `design.md`, por divergência com o banco real: `slug`
      **varchar(100)** (não 120), acompanhando `tb_assessoria.dominio`; `email` **varchar(180)**,
      espelhando o DTO. CHECK no `status` e índice parcial na varredura de reconciliação.
      *verify:* validado contra **Postgres 17 descartável**, não só por leitura — os cinco
      comportamentos passaram, incluindo o que sustenta a compensação: após o `DELETE` da
      assessoria o rastro preserva `slug` e `correlation_id`, a referência vira `NULL` e o slug
      é reaproveitado. O teste JUnit exige Testcontainers e roda no CI (sem Docker local).

- [x] 2.3 Oito primitivas novas no `KeycloakOrganizationGateway`. Contratos **verificados contra um
      Keycloak 26.7 real**, não inferidos: busca exige `exact=true` (senão casa por prefixo);
      role-mapping exige a *representation* completa da role; `POST members` recebe o id como
      string JSON crua. `DELETE` tolera 404 — a compensação precisa convergir.
      🚨 **Bloqueio encontrado e RESOLVIDO em 2026-08-09.** `send-verify-email` num usuário
      desabilitado responde `400 {"errorMessage":"User is disabled"}` e **nenhum e-mail sai** —
      a sequência "nasce desabilitado → envia → habilita" trava sempre. Spec, design e proposal
      corrigidos: o usuário nasce **habilitado** com required action `VERIFY_EMAIL`, e a barreira
      passa a ser ela + `verifyEmail: true` no realm (ver **4.0**).
      *verify:* `./mvnw test -Dtest='KeycloakOrganizationGatewayImpl*Test,CoachSignupInputDtoTest'` → 55/55.
- [x] 2.4 `CoachSignupServiceImpl` + `SignupProvisioning` + repositório. Compensação em pilha
      (LIFO); falha da própria compensação vira `RECONCILIATION_REQUIRED` e **não** é retentada.
      A assessoria é criada **primeiro** de propósito: é o passo mais barato de desfazer e o único
      que resolve a corrida de slug sem janela.
      ⚠️ **Alinhamentos com o schema real, encontrados ao integrar:** `email` do DTO de 180 → **100**
      (espelha `tb_usuario.email`; maior passaria na validação e estouraria a coluna); `Assessoria`
      não tem mais campo `trial` (migrou para `Assinatura`); coluna `resultado` → `result`, já que
      tabela nova segue o ADR-0007.
      *verify:* 17 testes — ordem do provisionamento, ordem inversa da compensação, os quatro
      pontos de falha, idempotência, chave reusada e honeypot. Sem `LENIENT`.
- [x] 2.4b `JwtTenantFilter` isenta `/api/public/**` por **prefixo** — deliberado, porque o
      namespace inteiro é tenant-less por definição, ao contrário do `/api/v1/waitlist`, que é uma
      rota pública isolada dentro de um namespace com tenant (aquele segue com match exato).
      *verify:* 6 testes, incluindo que o prefixo **não** vaza para `/api/publicidade`.
- [x] 2.5 `CoachSignupController` — `201` sem token algum. **Não existe campo de token no output
      DTO**, e isso é o requisito, não omissão. `Idempotency-Key` opcional; gerada quando ausente
      (a gerada não protege do duplo clique — só o cliente sabe que dois envios são a mesma
      intenção — mas mantém o rastro).
      ✅ **Feature flag e limite de corpo entregues em 2026-08-09.**
      `CoachSignupProperties` (`app.coach-signup`), no padrão do `LgpdProperties`: `@Validated` e
      **default `enabled=false`** — o deploy nunca liga sozinho um endpoint anônimo que provisiona
      no Keycloak e cria tenant. Flag desligada responde **404**, não 503: 503 anunciaria a um
      scanner um endpoint ainda não lançado e convidaria a retry que nunca funciona.
      📌 O `@Validated` aqui protege a direção oposta à do LGPD: lá um typo desligaria o
      enforcement em silêncio; aqui **ligaria** a porta pública sem ninguém decidir.
      📌 Limite de corpo é `PublicRequestSizeLimitFilter`, contando bytes na **leitura do stream**
      — não no `Content-Length`, que o cliente declara e pode omitir com `Transfer-Encoding:
      chunked`. Há teste que força `getContentLength() = -1`, senão ele passaria pelo corte
      antecipado e ficaria verde sem exercitar a contagem.
      📌 **Nada no frontend linka para `/cadastro`** (verificado) — a página existe e não é
      anunciada, coerente com a flag desligada. **Lançar = ligar a flag + adicionar o link.**
      *verify:* 7 testes — 201/400/409/502, repasse da chave, e o corpo da resposta conferido
      contra a senha enviada.
- [x] 2.6 `WaitlistRateLimitFilter` → **`PublicEndpointRateLimitFilter`**, atendendo as duas rotas
      públicas com limites próprios — uma política só, como a decisão exigia.
      📌 **A divisão entre filtro e serviço não é por preferência, é por visibilidade:** um filtro
      de servlet **não enxerga o e-mail** sem consumir o corpo da requisição, e o teto global
      precisa de contagem persistida (memória de processo zeraria a cada deploy e se
      multiplicaria por instância). IP no filtro; e-mail/dia e teto global no serviço.
      ⚠️ Propriedade `app.waitlist.rate-limit.per-minute` **preservada com o nome antigo** —
      renomeá-la faria os ambientes que já a configuram voltarem em silêncio ao default.
      ✅ **CORS/CSRF: nada a fazer, e a razão é substantiva.** O CSRF está desabilitado
      globalmente (`CoreSecurityConfig:39`), o que é correto para API stateless com JWT — e numa
      rota pública **não há credencial ambiente** (cookie/sessão) para um site terceiro abusar,
      que é a premissa do ataque. CORS é central (`CorsConfig` + `app.cors.allowed-origins`) e a
      rota herda. Verificado, não assumido.
      🔴 **Service account de menor privilégio: NÃO entregue, e é dívida real.** O gateway
      autentica como **`admin` do realm `master` via `admin-cli`, por password grant**
      (`application.yml:369-370`) — ou seja, credencial de administrador **global** do Keycloak
      para uma operação que só precisa criar organization e usuário no realm `menthoros`.
      É o oposto de menor privilégio, e o auto-cadastro **amplia a exposição**: essa credencial
      passa a ser exercida por requisição anônima.
      📌 **Deliberadamente adiado, não esquecido.** Corrigir exige client dedicado com
      `client_credentials` + roles de `realm-management` no realm da aplicação, mudança no realm
      versionado **e** troca do mecanismo de autenticação do gateway — que hoje serve também ao
      convite de atleta. É escopo de change própria; fazê-lo aqui misturaria mudança de
      segurança transversal com a entrega do cadastro.
      ➡️ **Abrir change `harden-keycloak-service-account` antes de ligar a flag em produção.**
      *verify:* 88 testes nas áreas tocadas; contadores das duas rotas independentes; limite
      checado **antes** da disponibilidade, para não vazar se o e-mail existe.
- [x] 2.7 Métrica única `signup.coach` com tag de desfecho; `tenantId` no MDC a partir do momento
      em que existe, removido no `finally`. Runbook em
      `apps/menthoros-backend/docs/coach-signup-reconciliation-runbook.md`.
      📌 `falha_compensada` e `reconciliacao_necessaria` são desfechos **distintos**: o primeiro é
      rotina e não pede ação; o segundo deixou órfão e exige gente. Somá-los esconderia o único
      que importa.
      📌 O runbook registra a armadilha do diagnóstico: **`assessoria_id` nulo não prova que a
      assessoria foi apagada** — a FK é `ON DELETE SET NULL`, então nulo é "apagada **ou** nunca
      criada". Quem decide é o `slug`, que permanece na linha.
      *verify:* 26 testes no serviço, incluindo varredura das tags de todos os meters contra
      e-mail/senha e checagem de que o MDC não vaza `tenantId`.
- [x] 2.8 33 testes no serviço + 35 no DTO + 15 no gateway + 7 no controller.
      A auditoria mostrou que a cobertura anterior tinha **dois** pontos de falha; faltavam quatro.
      Cada etapa agora tem teste do que a compensação desfaz **e do que ela não toca**.
      📌 **Segredos em log passaram a ser verificados de verdade** (`ListAppender` sobre o logger,
      nos caminhos de sucesso e de compensação). Antes só a resposta HTTP e o `error_detail` eram
      checados — o log, que é onde o vazamento costuma acontecer, não era.
      📌 Um teste pegou assertiva minha forte demais: `verifyNoInteractions` no gateway falhava
      porque a pré-checagem **consulta** o Keycloak. O que importa é que nada foi **criado**.
      *verify:* `./mvnw clean test` → 2468 testes, 135 erros — **todos** de Testcontainers sem
      Docker nesta máquina, mesma contagem de antes das 29 adições.
- [x] 2.9 **`./mvnw clean verify` — BUILD SUCCESS** (2026-08-09, Docker local ligado pelo CTO).
      **2469 testes Surefire + 62 Failsafe (`*IT`), 0 falhas, 0 erros**, 1min55.
      🚨 **O `verify` pegou um bug que o `test` jamais pegaria:** o `SignupProvisioningMigrationTest`
      falhava com `column "trial" of relation "tb_assessoria" does not exist`. A coluna existiu na
      V45 e foi removida pela **V70**; escrevi o `INSERT` lendo a V45. O teste depende de
      Testcontainers, então durante toda a seção 2 ele **nunca executou** — exatamente o buraco que
      o `CLAUDE.md` do backend documenta.
      📌 O compilador já havia dado essa mesma informação na 2.4 (`.trial(false)` não compilou no
      builder). SQL cru em string não tem compilador para proteger — vale desconfiar de todo
      `INSERT` escrito a partir de migration antiga.

## 3. Frontend

- [x] 3.1 Rota `/cadastro` fora do `ProtectedRoute`, formulário acessível, honeypot e links
      informativos para Termos/Privacidade — **sem checkbox de aceite**.
      🚨 **Defeito de contrato corrigido antes:** o `CoachSignupInputDto` exigia `aceiteLgpd`
      (copiado do waitlist na 2.1). Contradizia a `proposal.md` ("fora do escopo"), o `design.md`
      ("não contém checkbox") e a `spec.md` ("o aceite acontece na primeira sessão autenticada").
      Passou pelo `verify` verde da 2.9 — **teste passando não detecta requisito errado**.
- [x] 3.2 `CoachSignupService` + `useCoachSignup`, no padrão do `WaitlistService`/`useWaitlist`.
      📌 A chave de idempotência vive num `ref` e **sobrevive ao retry**: falha de rede ou `502`
      reusa a mesma chave. Chave nova por requisição derrotaria o mecanismo. Só é descartada quando
      o usuário edita o formulário — aí a intenção mudou e reenviar devolveria `409`.
- [x] 3.3 Após `201`, confirmação de verificação de e-mail e CTA. **O login não começa sozinho:**
      redirecionar levaria a uma tela de verificação pendente que o usuário ainda não pode resolver.
      Nada gravado em `localStorage` (há teste).
- [x] 3.4 16 testes de componente + **4 E2E**.
      🚨 **O E2E pegou um bug que nenhum teste de componente veria:** quem abria `/#/cadastro` sem
      sessão era mandado para o **login** — a restauração silenciosa retorna na raiz e o
      `AuthProvider` forçava `#/auth/login` para qualquer origem. Correto para rota protegida,
      quebrado para o cadastro, já que quem vai criar conta é exatamente quem não tem uma. A origem
      passou a ser guardada antes do redirect e restaurada quando é rota pública.
      📌 Testes usam `createHashRouter` real, não `MemoryRouter` — regra do `CLAUDE.md`, que registra
      um link perdido assim antes.
- [x] 3.5 `npm run lint` limpo · `npm run build` OK · `npm run test:run` **852 testes, 111 arquivos**
      · `npm run test:e2e` **19 passed**.

## 4. Entrega

- [x] 4.0 **Aplicado no HomeLab em 2026-08-09** — `verifyEmail: true` e
      `passwordPolicy: "length(12) and notUsername and notEmail"` no `menthoros-realm.json`
      (`menthoros-infra`, branch `feature/keycloak-user-onboarding-auth`, commit `2b350ec`).
      *verify:* **enforcement provado por experimento**, não por leitura do realm — criar usuário via
      admin API com senha `curta123` → `400 invalidPasswordMinLengthMessage`; com senha igual ao
      e-mail → `400 invalidPasswordNotUsernameMessage`. SMTP e `revokeRefreshToken` intactos.
      📌 O `notUsername` confirmou a necessidade do ajuste no backend (`a5e55c1`): sem ele, esse
      `400` chegaria ao usuário como **502** — "tente novamente em instantes" para um erro que só
      ele pode corrigir.
      ⚠️ **PENDENTE: aplicar no Railway.** Só o HomeLab foi sincronizado.
      ⚠️ **Efeito colateral no dev:** o usuário `leandro` está com `emailVerified=false`. O próximo
      login dele passa pela tela de verificação e exige clicar no link do e-mail (o SMTP funciona,
      então o e-mail chega). Decisão de CTO já registrada na proposal foi "desconsiderar cadastros
      existentes" — isto é a consequência concreta dela.
- [x] 4.1 **Verificada ponta a ponta contra ambiente real** — API em 2026-08-09, perna de navegador
      em **2026-08-10** (backend local + Keycloak do HomeLab + Postgres com a V75 aplicada).
      ✅ `POST` real → **201**; `Assessoria` BASIC (10/1) criada; `Usuario` local com role `TECNICO`;
      Organization no Keycloak com **`tenant_id` batendo exatamente** com o id da assessoria
      (`88cc4801-…`); usuário **habilitado** com `requiredActions=[VERIFY_EMAIL]`; rastro em `ACTIVE`;
      `result` guardado sem senha nem token.
      ✅ Reenvio da mesma chave → **201 sem duplicar** (1 assessoria, 1 linha de rastro).
      ✅ Mesma chave com payload diferente → **409**. Slug repetido → **409**. E-mail repetido → **409**.
      ✅ Senha igual ao e-mail → **400**, não 502 — prova em ambiente real de que o alinhamento com a
      `passwordPolicy` (commit `a5e55c1`) era necessário.
      ✅ **Rate limit disparou sozinho** durante os testes (`429` na 4ª requisição do mesmo IP), o que
      o validou sem que eu precisasse forçá-lo.
      ✅ **Perna de navegador fechada em 2026-08-10, pelo founder:** link de verificação recebido em
      `contato@menthoros.com`, entrada pelo fluxo PKCE e a cadeia claims → consentimento → dashboard
      percorrida com sucesso. Era a única etapa não automatizável da change — o ROPC está desligado
      de propósito e o link chega por e-mail.
      ⚠️ **Grau de evidência menor que o do resto da 4.1:** confirmação verbal do founder
      ("funcionando"), sem captura de tela nem log anexado, e sem registro etapa a etapa como no
      trecho de API acima. Suficiente para destravar a 4.2; **não** suficiente para ser a única
      prova quando a 4.3 ligar a flag em ambiente com usuário real.
      📌 Ambiente deixado no ar: backend `:8099` (worktree `.worktrees/onboarding-backend`), front
      `:5174`, Postgres no container `menthoros-4a1-db`.
- [x] 4.2 **Feito em 2026-08-10 contra Keycloak e Postgres reais** (Testcontainers —
      `CoachSignupCompensacaoIT`; o HomeLab ficou de fora porque a injeção de falha exigiria mexer
      no banco compartilhado).
      ✅ Falha injetada no insert do `Usuario` local — o passo mais tardio que ainda tem organização,
      usuário, role e vínculo de membro criados atrás dele, então exercita a pilha inteira de
      compensação. Depois do desfazer: **usuário e organização não existem mais no Keycloak**
      (consultado pela admin API) e a assessoria sumiu do banco. Nenhuma conta utilizável.
      ✅ **Controle positivo** incluído: a mesma consulta encontra um usuário que existe. Sem ele os
      `isEmpty()` provariam nada — query errada devolve lista vazia sempre.
      🐞 **Achou um bug, e do tipo que teste unitário não alcança.** A V75 declarou
      `assessoria_id` com `ON DELETE SET NULL` para a compensação poder apagar a assessoria. O
      Postgres zera a coluna no delete, mas a entidade em memória segue com o id antigo: o UPDATE
      que grava `FAILED` reescreve a referência pendurada e **viola a FK**. Toda falha compensada
      terminava com (1) o rastro congelado no último passo bem-sucedido, invisível à varredura por
      `RECONCILIATION_REQUIRED`; (2) um 500 sobre constraint de banco no lugar da causa real; (3)
      métrica e rastro discordando, porque `contar("falha_compensada")` roda antes do UPDATE.
      ✅ **Corrigido pela V76**, que derruba a FK — decisão do founder: preservar o id para perícia,
      mesma convenção de `tenant_id`. `SignupProvisioningMigrationTest` afirmava o comportamento
      anterior e foi atualizado.
      📌 Suíte na branch: **2476 unitários + 65 de integração**, `clean verify` verde.
- [x] 4.3 **Feito em 2026-08-11 no HomeLab** (Railway deliberadamente de fora — ver ressalva).
      ✅ **Flag ligada e desligada, com a V76 aplicada pelo Flyway no boot** contra o Postgres real.
      ✅ **Kill switch validado nos dois sentidos** — e a sonda do runbook estava errada: `POST` com
      corpo vazio devolve `400` com a flag ligada **ou** desligada, porque a validação do `@Valid`
      roda antes do teste da flag. Num incidente, quem sondasse assim concluiria "não desligou"
      quando desligou. Substituída por corpo válido com o honeypot preenchido (404 desligado, 201
      ligado), que não cria nada — confirmado no banco.
      ✅ **Runbook executado nos dois resíduos de QA** do HomeLab: `GET` de confirmação, `DELETE` do
      usuário e da organização no Keycloak (204 nos quatro), ausência confirmada por consulta,
      `DELETE` do `Usuario` local e da `Assessoria`, rastro anotado.
      📌 **A V76 se provou no ambiente real:** o `assessoria_id` sobreviveu ao `DELETE` da
      assessoria. Antes dela a FK teria zerado a coluna, e o rastro não diria qual tenant existiu.
      🐞 **Lacuna encontrada:** o guard antes do `DELETE` manda **PARAR** quando há usuário vinculado
      — correto para `RECONCILIATION_REQUIRED`, onde o `Usuario` local não deveria existir, mas não
      cobre desfazer um cadastro que **deu certo**. É o mesmo caminho de uma exclusão a pedido do
      titular (LGPD). Rascunho do procedimento ficou no runbook; formalizar é change própria.
      ⚠️ **"Observar métricas" não é executável hoje.** `/actuator/prometheus` responde **401** (só
      `/actuator/health` é público) e **não existe coletor** — não há Prometheus nem Grafana em
      `menthoros-infra`. O contador `signup_coach_total{desfecho}` existe e está correto; o que não
      existe é quem olhe. A regra PromQL sugerida no runbook pressupõe um Prometheus que ninguém
      subiu. Mesmo ponto cego já registrado na `enable-backend-ci`.
      ⚠️ **Railway não foi ligado, de propósito:** o endpoint é anônimo e provisiona tenant; a
      proposal condiciona abrir `/cadastro` ao público ao enforcement LGPD estar `on`, e ele segue
      em `report-only` com o gate jurídico e os Termos de Uso pendentes.

## Estimativa

L (aprox. 15–25 dias de engenharia, mais configuração de infraestrutura/e-mail). Identidade pública, multi-tenancy, integração não transacional e anti-abuso tornam a estimativa M original irrealista.

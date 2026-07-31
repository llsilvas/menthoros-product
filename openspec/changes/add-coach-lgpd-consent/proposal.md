# add-coach-lgpd-consent — Consentimento LGPD do Coach

**Tamanho:** S · **Trilha:** Full

> Trilha escalada de Fast para Full pelos critérios do `config.yaml`: a change toca **dois repos**
> (backend + frontend), altera **schema de banco** e **contrato de API**, e carrega risco
> legal/compliance (LGPD).

**Status:** proposta
**Criado:** 2026-07-31
**Revisado:** 2026-07-31 (escopo reduzido — perfil do coach extraído para `add-coach-settings-page`)

## Problema

O Menthoros processa dados pessoais de treinadores (nome, e-mail, avatar, registro de acesso) sem
consentimento documentado. A Política de Privacidade e o RIPD cobrem atletas e assessorias, mas o
coach como titular de dados está descoberto — risco identificado na auditoria de 2026-07-31.

Sem prova de consentimento, a base legal para tratar os dados do coach é frágil e não há registro
auditável de quando e o que cada coach aceitou.

## Escopo

1. **Campos de consentimento** na entidade `Usuario` + migração Flyway (`V73`)
2. **Endpoint `POST /api/v1/users/me/consent`** — registra o aceite (idempotente)
3. **Campo `lgpdConsentGranted`** exposto no `GET /api/v1/users/me` para o frontend decidir a exibição
4. **Enforcement no backend** — coach sem consentimento recebe `403` em operações de escrita,
   atrás de flag de rollout (`off` → `report-only` → `on`)
5. **Modal bloqueante no primeiro login** (`CoachConsentDialog`) com 2 checkboxes

> **Enquadramento (ajustado após pre-mortem):** o `JwtTenantFilter` já sincroniza os dados do coach
> em `tb_usuario` a cada request autenticada, **antes** de qualquer gate. Logo, o `403` **não é** a
> base legal do tratamento — é um **controle de produto** que impede o coach de operar a plataforma
> sem ter aceitado os Termos e a Política. A base legal do sync é a execução do contrato com a
> assessoria, e precisa estar declarada no RIPD. Ver `design.md` § "Enquadramento".

## Fora do escopo

- **Página de perfil/configurações do coach** — extraída para `add-coach-settings-page`
- Versionamento da Política de Privacidade / re-consentimento (decisão registrada: booleano +
  timestamp; re-consentimento futuro exigirá nova migração e change própria)
- Auto-cadastro de coach (`keycloak-user-onboarding-auth`)
- Wizard de boas-vindas (`coach-first-login-wizard`)
- Consentimento do atleta (já coberto pela Política vigente)
- Termos de Uso como documento (link placeholder até o documento existir)

## Critérios de aceite

**CA1 — Coach sem consentimento é interceptado no login**
> **Dado** um coach (role `TECNICO`) com `lgpdConsentGranted = false`
> **Quando** ele autentica e o frontend chama `GET /api/v1/users/me`
> **Então** a resposta traz `lgpdConsentGranted: false` e o `CoachLayout` renderiza o
> `CoachConsentDialog` sem sidebar nem conteúdo navegável.

**CA2 — Botão só habilita com os dois aceites**
> **Dado** o `CoachConsentDialog` aberto
> **Quando** zero ou apenas um dos dois checkboxes está marcado
> **Então** o botão "Aceitar e continuar" permanece desabilitado.

**CA3 — Aceite é registrado com timestamp**
> **Dado** um coach com `lgpdConsentGranted = false`
> **Quando** ele envia `POST /api/v1/users/me/consent` com `termsAccepted: true` e
> `privacyPolicyAccepted: true`
> **Então** o backend retorna `200`, grava `lgpdConsentGranted = true` e
> `lgpdConsentedAt = now()`.

**CA4 — Aceite parcial é rejeitado**
> **Dado** um coach sem consentimento
> **Quando** ele envia `POST /api/v1/users/me/consent` com qualquer um dos dois campos `false`
> **Então** o backend retorna `400` e **não** grava consentimento.

**CA5 — Reenvio é idempotente**
> **Dado** um coach que já consentiu
> **Quando** ele reenvia `POST /api/v1/users/me/consent` com ambos `true`
> **Então** o backend retorna `200` e **preserva** o `lgpdConsentedAt` original (não sobrescreve).

**CA6 — Escrita bloqueada sem consentimento**
> **Dado** um coach com `lgpdConsentGranted = false` e a flag `app.lgpd.consent-enforcement = on`
> **Quando** ele chama qualquer endpoint de escrita (`POST`/`PUT`/`PATCH`/`DELETE`) fora da
> whitelist
> **Então** o backend retorna `403` com código `LGPD_CONSENT_REQUIRED`.

**CA7 — Leitura e o próprio consentimento permanecem liberados**
> **Dado** um coach com `lgpdConsentGranted = false`
> **Quando** ele chama `GET /api/v1/users/me` ou `POST /api/v1/users/me/consent`
> **Então** o backend responde normalmente (sem `403`).

**CA8 — Isolamento por tenant**
> **Dado** dois coaches em assessorias distintas
> **Quando** o coach A registra consentimento
> **Então** apenas o `Usuario` do coach A é alterado; o coach B permanece com
> `lgpdConsentGranted = false`.

**CA9 — Migração preserva dados existentes**
> **Dado** o banco com coaches já cadastrados
> **Quando** a `V73` é aplicada
> **Então** nenhuma linha é perdida e todos recebem `lgpd_consent_granted = false`.

**CA10 — Flag de rollout controla o enforcement**
> **Dado** um coach sem consentimento
> **Quando** a flag está em `off`
> **Então** nenhuma escrita é bloqueada;
> **E quando** a flag está em `report-only`
> **Então** a escrita passa mas é registrada em log com `usuarioId`, rota e tenant.

**CA11 — Rotas sem autenticação ou sem tenant não são afetadas**
> **Dado** uma requisição a rota pública (webhook, callback, waitlist) ou a `/api/admin/**`
> **Quando** o interceptor a avalia
> **Então** ela passa sem `403` e sem `503`, independentemente de consentimento.

**CA12 — Usuário não resolvido falha fechado e distinguível**
> **Dado** um JWT válido cujo `Usuario` não pôde ser resolvido
> **Quando** ele chama um endpoint de escrita com a flag em `on`
> **Então** o backend retorna `503` (não `403`) — a falha de resolução não é confundida com
> ausência de consentimento.

**CA13 — Registro do aceite é atômico sob concorrência**
> **Dado** um coach sem consentimento
> **Quando** dois `POST /api/v1/users/me/consent` chegam simultaneamente
> **Então** apenas um grava, ambos retornam `200`, e existe um único `lgpdConsentedAt` final.

## Métrica de sucesso

- **Cobertura:** 100% dos coaches ativos com consentimento registrado em até **14 dias** após o
  deploy (consulta: `SELECT count(*) FROM tb_usuario WHERE role='TECNICO' AND ativo AND NOT
  lgpd_consent_granted` → zero).
- **Atrito na rotina do treinador:** o aceite é uma interação única de **< 30 segundos**, sem
  passos adicionais em logins seguintes — a change protege a operação sem custo recorrente de
  tempo para o coach.
- **Auditabilidade:** para qualquer coach, é possível responder "quando consentiu" a partir de um
  único campo (`lgpd_consented_at`).

## Open Questions & Assumptions

**Premissas assumidas** (validadas contra o código em 2026-07-31):

- **A1.** O `UsuarioController` está mapeado em `/api/v1/users`, portanto o endpoint é
  `/api/v1/users/me/consent` — a versão anterior desta proposta dizia `/api/v1/me`, que não existe.
- **A2.** Nomes de identificadores novos em **inglês**, conforme ADR-0007 (`lgpdConsentGranted`,
  `lgpdConsentedAt`), ainda que `tb_waitlist.aceite_lgpd` (legado) use PT.
- **A3.** `lgpd_consented_at` é `TIMESTAMPTZ` mapeado como `Instant`, divergindo das colunas
  legadas de `tb_usuario` (`timestamp without time zone` / `LocalDateTime`). Justificativa: um
  timestamp de consentimento é **registro legal** e não pode ser ambíguo quanto a fuso; as demais
  colunas da tabela são operacionais. Divergência deliberada.
- **A4.** O enforcement se aplica **somente à role `TECNICO`**. Atletas e admins não são afetados
  por esta change.
- **A5.** O modal é bloqueante no frontend, mas a garantia real é o `403` do backend — o frontend
  é conveniência de UX, não controle de segurança.
- **A7.** *(verificada no pre-mortem)* `JwtTenantFilter` grava em `tb_usuario` a cada request
  autenticada, antes do gate. O `403` é controle de produto, não base legal — ver "Enquadramento".
- **A8.** *(verificada)* `/api/admin/**` e `/api/v1/waitlist` rodam **sem** `TenantContext`
  (`JwtTenantFilter.shouldNotFilter`), e o `Usuario` pode ser `null` quando o sync falha. O
  interceptor trata os dois casos explicitamente.
- **A9.** `ADD COLUMN NOT NULL DEFAULT false` é metadata-only em PostgreSQL ≥ 11 e `tb_usuario`
  tem escala de centenas de linhas — sem risco de lock relevante. Confirmar a versão do PG na
  task 1.1.
- **A6.** O link de "Termos de Uso" é placeholder (`#`) até o documento existir; o checkbox
  correspondente permanece obrigatório para não precisar de nova migração quando o documento sair.

**Em aberto:**

- **Q1.** *(promovida a gate de deploy — não é mais "decidir depois")* Coaches ativos em produção
  precisam de comunicação prévia antes de a flag ir para `on`. A sequência obrigatória é
  `off` → aviso → `report-only` até a cauda esvaziar → `on`. **Quem dispara o aviso e em que prazo?**
  A implementação não é bloqueada (a flag nasce `off`), mas a virada para `on` é.
- **Q2.** O texto do checkbox de privacidade e os Termos de Uso precisam de validação jurídica.
  **Recomendação do product-review:** não virar a flag para `on` enquanto o link de Termos for
  placeholder — coletar aceite apontando para documento inexistente é prova legal fraca. Coletar
  em `off`/`report-only` é aceitável.
- **Q3.** A whitelist precisa ser revisada quando `keycloak-user-onboarding-auth` entrar — o fluxo
  de auto-cadastro cria `Usuario` antes do aceite.
- **Q4.** *(levantada no pre-mortem)* Sem `policyVersion`/`termsVersion`, não é possível provar
  **qual texto** o coach aceitou nem re-solicitar aceite quando a Política mudar. A decisão de
  ficar em booleano + timestamp foi tomada conscientemente — vale confirmar com o jurídico se é
  suficiente, sabendo que corrigir depois exige nova migração e change própria.
- **Q5.** *(product-review)* `coach-first-login-wizard` empilha um segundo overlay bloqueante logo
  após este. O design já prevê stepper compartilhado ("Passo 1 de 4"), mas a decisão de UI
  unificada precisa ser confirmada antes de as duas changes irem para implementação.

## Impacto

- **Backend:** `Usuario.java` (+2 campos), migração `V73`, `ConsentInputDto`, `UsuarioService` +
  `UsuarioServiceImpl`, `UsuarioController` (+1 endpoint), `UsuarioMeOutputDto` (+1 campo),
  novo interceptor de enforcement, `GlobalExceptionHandler` (+1 handler)
- **Frontend:** `CoachConsentDialog`, `CoachLayout` (interceptação), cliente OpenAPI regenerado
- **Documentação:** Política de Privacidade, Mapeamento de Dados e RIPD já atualizados

## Dependências

- **Destrava:** `keycloak-user-onboarding-auth` e `coach-first-login-wizard` (ambas declaram esta
  change como dependência)
- **Depende de:** nenhuma

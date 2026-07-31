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

1. **Tabela append-only `tb_usuario_lgpd_consent`** + migração Flyway (`V73`) — uma linha por
   aceite, versionada por data de vigência da Política e dos Termos
2. **Endpoint `POST /api/v1/users/me/consent`** — registra o aceite (idempotente via `UNIQUE`)
3. **`lgpdConsentGranted` derivado** + versões vigentes expostos no `GET /api/v1/users/me`
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
- **Automação do bump de versão** — trocar a Política é uma operação manual (editar
  `PrivacidadePage`, atualizar `app.lgpd.policy-version`, seguir o procedimento de rollout). Não
  há painel nem fluxo de publicação nesta change.
- **Consentimento granular por finalidade** — o aceite aqui é dos dois documentos como um todo,
  não opt-in por tipo de tratamento.
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

**CA3 — Aceite é registrado com versão e timestamp**
> **Dado** um coach sem consentimento das versões vigentes
> **Quando** ele envia `POST /api/v1/users/me/consent` com ambos os aceites `true` e as versões
> vigentes
> **Então** o backend retorna `200` e grava **uma linha** em `tb_usuario_lgpd_consent` com
> `policy_version`, `terms_version`, `consented_at` e `tenant_id`.

**CA4 — Aceite parcial é rejeitado**
> **Dado** um coach sem consentimento
> **Quando** ele envia `POST /api/v1/users/me/consent` com qualquer um dos dois aceites `false`
> **Então** o backend retorna `400` e **não** grava linha alguma.

**CA5 — Reenvio é idempotente**
> **Dado** um coach que já aceitou as versões vigentes
> **Quando** ele reenvia o mesmo aceite
> **Então** o backend retorna `200` e **não** cria segunda linha; o `consented_at` original é
> preservado.

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
> **Então** grava-se **uma** linha com o `tenant_id` do coach A; o coach B segue sem registro e com
> `lgpdConsentGranted = false`. Um `Usuario` cujo tenant divirja do `TenantContext` **não** é
> aceito para gravação.

**CA9 — Migração não toca em dados existentes**
> **Dado** o banco com coaches já cadastrados
> **Quando** a `V73` é aplicada
> **Então** `tb_usuario_lgpd_consent` é criada vazia, `tb_usuario` permanece inalterada, e todo
> coach existente passa a computar `lgpdConsentGranted = false` por ausência de registro.

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
> **Quando** dois `POST /api/v1/users/me/consent` chegam simultaneamente com as mesmas versões
> **Então** a constraint `uk_usuario_lgpd_consent_versoes` garante **uma única** linha, e ambas as
> requisições retornam `200`.

**CA14 — Versão defasada é rejeitada, não carimbada**
> **Dado** que a Política vigente passou a ser `2026-11-01`
> **Quando** um coach envia o aceite declarando `policyVersion: "2026-06-30"` (a que sua página
> exibia)
> **Então** o backend retorna `409 CONSENT_VERSION_STALE` e **não** grava — o registro nunca
> afirma que ele aceitou um texto que não viu.

**CA15 — Re-consentimento preserva o histórico**
> **Dado** um coach que aceitou a Política `2026-06-30`
> **Quando** a vigente muda para `2026-11-01` e ele aceita a nova
> **Então** existem **duas** linhas em `tb_usuario_lgpd_consent`, e a de `2026-06-30` permanece
> intacta com seu `consented_at` original.

**CA16 — Mudança de versão reabre o gate**
> **Dado** um coach com consentimento da Política `2026-06-30`
> **Quando** a configuração passa a exigir `2026-11-01`
> **Então** `GET /users/me` retorna `lgpdConsentGranted = false` e o modal reaparece.

## Métrica de sucesso

- **Cobertura:** 100% dos coaches ativos com consentimento das versões vigentes em até **14 dias**
  após o deploy:
  ```sql
  SELECT count(*) FROM tb_usuario u
   WHERE u.role = 'TECNICO' AND u.ativo
     AND NOT EXISTS (SELECT 1 FROM tb_usuario_lgpd_consent c
                      WHERE c.usuario_id = u.id
                        AND c.policy_version = :policyVersionVigente
                        AND c.terms_version  = :termsVersionVigente)  -- → zero
  ```
- **Atrito na rotina do treinador:** o aceite é uma interação única de **< 30 segundos**, sem
  passos adicionais em logins seguintes — a change protege a operação sem custo recorrente de
  tempo para o coach.
- **Auditabilidade:** para qualquer coach é possível responder **o quê**, **qual versão** e
  **quando** — inclusive para aceites já superados por uma versão mais nova, que permanecem no
  histórico.

## Open Questions & Assumptions

**Premissas assumidas** (validadas contra o código em 2026-07-31):

- **A1.** O `UsuarioController` está mapeado em `/api/v1/users`, portanto o endpoint é
  `/api/v1/users/me/consent` — a versão anterior desta proposta dizia `/api/v1/me`, que não existe.
- **A2.** Nomes de identificadores novos em **inglês**, conforme ADR-0007, ainda que
  `tb_waitlist.aceite_lgpd` (legado) use PT.
- **A3.** `consented_at` é `TIMESTAMPTZ` mapeado como `Instant`. Como é tabela nova, isso segue o
  padrão de tabelas do repo sem divergir de nada — a ressalva anterior (colunas legadas de
  `tb_usuario` em `timestamp without time zone`) deixou de se aplicar, já que `tb_usuario` não é
  mais alterada.
- **A10.** Versão é a **data de vigência** do documento (`YYYY-MM-DD`), com o backend como fonte da
  verdade via `app.lgpd.*`. O cliente ecoa a versão que renderizou; o servidor rejeita divergência.
- **A4.** O enforcement se aplica **somente à role `TECNICO`**. Atletas e admins não são afetados
  por esta change.
- **A5.** O modal é bloqueante no frontend, mas a garantia real é o `403` do backend — o frontend
  é conveniência de UX, não controle de segurança.
- **A7.** *(verificada no pre-mortem)* `JwtTenantFilter` grava em `tb_usuario` a cada request
  autenticada, antes do gate. O `403` é controle de produto, não base legal — ver "Enquadramento".
- **A8.** *(verificada)* `/api/admin/**` e `/api/v1/waitlist` rodam **sem** `TenantContext`
  (`JwtTenantFilter.shouldNotFilter`), e o `Usuario` pode ser `null` quando o sync falha. O
  interceptor trata os dois casos explicitamente.
- **A9.** A `V73` é `CREATE TABLE` puro — não toca em `tb_usuario`, logo não há risco de lock em
  tabela existente. *(Substitui a premissa anterior sobre `ADD COLUMN`, obsoleta desde a reversão
  da Q4.)*
- **A11.** O eco de versão protege contra **cliente defasado**, não contra **payload adulterado**.
  A change prova *aceite autenticado de uma versão identificada*, **não** prova leitura do texto.
  Registrar hash do documento, IP e user-agent está fora do escopo.
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
- ~~**Q4.** Sem `policyVersion`/`termsVersion`, não é possível provar qual texto foi aceito.~~
  **Resolvida em 2026-07-31 — decisão revertida.** O consentimento passa a ser **versionado por
  data de vigência** e gravado em tabela **append-only**, então prova qual texto foi aceito, quando,
  e preserva os aceites anteriores quando a Política mudar. Duas consequências novas assumidas:
  (a) bumpar a versão invalida o consentimento de todos de uma vez — vira um mini-rollout, com
  procedimento próprio nos gates do bloco 5; (b) a data em `app.lgpd.policy-version` precisa bater
  com a exibida na `PrivacidadePage`, senão o registro aponta para um texto que ninguém viu.

- **Q6.** *(nova, decorrente da Q4)* A `V73` nasce com a tabela vazia — nenhum coach existente tem
  consentimento registrado. Confirmar que não há intenção de fazer backfill de "aceite presumido"
  para a base atual (o correto sob LGPD é **não** presumir, mas é decisão a registrar
  explicitamente).
- **Q5.** *(product-review)* `coach-first-login-wizard` empilhará um segundo overlay bloqueante
  logo após este. **Deixou de bloquear esta change em 2026-07-31:** o dialog nasce **standalone**,
  sem numeração de passo, porque a versão anterior da spec codificava a solução ("Passo 1 de 4")
  antes de a decisão existir — hardcodando um total de passos que ninguém confirmou. A unificação
  visual fica com `coach-first-login-wizard`, que conhece os próprios passos; absorver um dialog
  standalone num stepper é trabalho menor do que corrigir numeração errada em duas changes.

## Impacto

- **Backend:** migração `V73` (tabela nova — `tb_usuario` **não** é alterada), entidade
  `UsuarioLgpdConsent` + repository, `ConsentInputDto`, `LgpdProperties` +
  `ConsentEnforcementMode`, `UsuarioService`/`Impl` (+`registerConsent`, +derivação do granted),
  `UsuarioController` (+1 endpoint), `UsuarioMeOutputDto` (+3 campos), `JwtTenantFilter`
  (`USUARIO_ATTR`), `LgpdConsentInterceptor`, `GlobalExceptionHandler` (+2 handlers)
- **Frontend:** `CoachConsentDialog`, `CoachLayout` (interceptação), `PrivacidadePage` (data de
  vigência alinhada à config), cliente OpenAPI regenerado
- **Documentação:** Política de Privacidade, Mapeamento de Dados e RIPD já atualizados; o RIPD
  precisa declarar execução de contrato como base legal do sync (gate 5.5)

## Dependências

- **Destrava:** `keycloak-user-onboarding-auth`, `coach-first-login-wizard` e
  `add-coach-settings-page` (esta última consome a tabela, a entidade e o repository criados aqui)
- **Depende de:** nenhuma

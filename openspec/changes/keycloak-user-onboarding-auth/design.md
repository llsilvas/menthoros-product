# Design — keycloak-user-onboarding-auth

## Discovery obrigatória

Antes da implementação, localizar e registrar no PR: fluxo OIDC do frontend, claim usado por `TenantContext`, representação atual de tenant no Keycloak (Organization, grupo ou atributo), APIs de criação de `Assessoria`/`Usuario`, política de senha/e-mail e contrato padrão de erros. Não criar abstrações com nomes presumidos como `KeycloakOrganizationGateway` sem confirmar o código.

## API pública

`POST /api/public/coach-signups`

```json
{
  "nome": "Ana Souza",
  "email": "ana@example.com",
  "senha": "<redacted>",
  "nomeAssessoria": "Serra Running",
  "slugAssessoria": "serra-running"
}
```

- `201 Created`: `{ "status": "EMAIL_VERIFICATION_REQUIRED", "loginUrl": "/login" }`.
- `400`: validação funcional; `409`: e-mail/slug indisponível; `429`: proteção anti-abuso; `502/503`: falha do provedor.
- A resposta nunca contém token. O `loginUrl` inicia Authorization Code + PKCE pelo adapter existente.
- Normalizar e-mail com a mesma regra do Keycloak; slug em lowercase, `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$`, com lista de reservados. Revalidar unicidade no banco por constraint, não só `existsBy...`.
- Limitar corpo e campos; não retornar ecos da senha; aplicar rate limit antes do provisionamento.

## Orquestração e consistência

Keycloak não participa da transação PostgreSQL. `@Transactional` sozinho não desfaz recursos externos. O serviço orquestrador mantém IDs de cada etapa e compensa em ordem inversa:

1. Validar entrada, rate limit, disponibilidade aparente e configuração.
2. Criar a `Assessoria` local e registrar `ASSESSORIA_CREATED` em `tb_signup_provisioning`.
   ⚠️ **Sem estado novo em `tb_assessoria`** — ver "Estados e o destino da `Assessoria` em falha".
3. Criar container de tenant no Keycloak.
4. Criar usuário desabilitado/pendente de verificação, definir senha, role `TECNICO` e vínculo ao tenant.
5. Criar `Usuario` local com `keycloakId` e assessoria.
6. Disparar verify-email. **Só com o envio bem-sucedido:** habilitar o usuário e marcar
   assessoria/operação `ACTIVE`. ⚠️ Habilitar antes deixaria conta habilitada que ninguém
   confirma se o envio falhar — ver "Restrições de código", item 2.

Em falha, excluir/desabilitar recursos externos criados e remover/marcar como falha os locais. Se compensação falhar, persistir uma operação `RECONCILIATION_REQUIRED` (sem senha) com correlation ID e IDs externos; uma rotina/admin runbook deve permitir retry idempotente. Nunca logar senha/tokens.

Se a modelagem atual não tiver estado de provisionamento, a discovery decide entre adicionar esse estado ou uma tabela `signup_provisioning`. Essa decisão deve ocorrer antes de estimar migrations finais.

## Idempotência e concorrência

- Constraint única para slug normalizado e para e-mail local normalizado, além da unicidade no Keycloak.
- Aceitar header `Idempotency-Key`; guardar hash do request sem senha e resultado por janela limitada. A mesma chave/payload retorna o resultado; payload diferente retorna `409`.
- Tratar corrida após pre-check como conflito e compensar recursos já criados.

## Frontend e jornada

O formulário não contém checkbox de aceite jurídico. Ele mostra links informativos para Termos/Privacidade; o aceite versionado acontece após autenticação. Após `201`, mostrar instrução para verificar e-mail e CTA “Ir para login”. Não gravar credenciais ou tokens no browser.

Jornada integrada:

```text
/cadastro → provisionamento → verificar e-mail → login OIDC/PKCE
→ GET /api/v1/me → consentimento pendente → onboarding pendente → dashboard
```

## Segurança e operação

- CORS apenas para origens configuradas; CSRF conforme a arquitetura do endpoint; CAPTCHA/rate limiting distribuído.
- Credencial de service account do Keycloak com privilégios mínimos e rotação.
- Métricas: tentativa/sucesso/conflito/rate-limit/falha/compensação, sem PII de alta cardinalidade.
- Teste de integração real com Keycloak em ambiente efêmero; mocks não comprovam claims/roles.

## Rollout

Publicar backend com endpoint protegido por feature flag, executar smoke/reconciliação, publicar frontend e abrir gradualmente. Desabilitar a flag interrompe novos cadastros sem afetar contas já criadas.


## Esboço de migration (V75) — decidido, não adiado

O DoR apontou que o impacto em dados estava só adiado ("a discovery decide"). Levantamento do schema
real em 2026-08-07 resolve boa parte antes de começar.

### O que JÁ existe em `tb_assessoria`

```
dominio                    varchar  UNIQUE   ← é o slug; a reserva não precisa de coluna nova
keycloak_organization_id   varchar
keycloak_group_id          varchar  UNIQUE
keycloak_realm             varchar
max_atletas, max_tecnicos, plano, ativo
```

📌 **Consequência para a task de slug:** "reservar o slug" não é criar campo — é usar a unique
`tb_assessoria_dominio_key` que já existe. A corrida entre dois cadastros simultâneos com o mesmo
slug resolve-se pela constraint, não por verificação prévia (que sempre tem janela).

### O que FALTA: `tb_signup_provisioning` (tabela nova, V75)

**Por que tabela separada e não coluna em `tb_assessoria`:** o cadastro começa **antes** de a
assessoria existir, e precisa sobreviver ao caso em que ela nunca chega a ser criada. Estado de
provisionamento pendurado na assessoria não consegue registrar a tentativa que falhou no primeiro
passo — que é justamente a que precisa de rastro.

```sql
CREATE TABLE IF NOT EXISTS tb_signup_provisioning (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key           VARCHAR(64)  NOT NULL,
    request_hash              VARCHAR(64)  NOT NULL,   -- hash do payload SEM senha
    resultado                 JSONB,                   -- resposta devolvida na 1a execucao
    email                     VARCHAR(255) NOT NULL,
    slug                      VARCHAR(120) NOT NULL,
    status                    VARCHAR(40)  NOT NULL,
    assessoria_id             UUID         REFERENCES tb_assessoria(id) ON DELETE SET NULL,
    keycloak_organization_id  VARCHAR(64),
    keycloak_user_id          VARCHAR(64),
    correlation_id            VARCHAR(64)  NOT NULL,
    error_detail              TEXT,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ,
    CONSTRAINT uk_signup_provisioning_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_signup_provisioning_status ON tb_signup_provisioning(status);
CREATE INDEX IF NOT EXISTS idx_signup_provisioning_email  ON tb_signup_provisioning(email);
```

⚠️ **`request_hash` e `resultado` não são enfeite — são o contrato de idempotência desta change.**
A regra é "mesma chave + mesmo payload devolve o mesmo resultado; mesma chave + payload diferente
devolve `409`". Sem guardar o hash não dá para distinguir os dois casos, e sem guardar o
resultado a segunda chamada não tem o que devolver.

`status` acompanha a ordem de criação, para a compensação saber o que desfazer:
`PENDING` → `ASSESSORIA_CREATED` → `ORG_CREATED` → `USER_CREATED` → `COMPLETED`, mais `FAILED` e
`RECONCILIATION_REQUIRED`.

⚠️ **Desvio deliberado do padrão de tabela do módulo: não tem `tenant_id`.** O `CLAUDE.md` do backend
exige `tenant_id UUID NOT NULL` em tabela tenant-scoped — mas esta registra o ato de **criar** um
tenant, e existe antes de haver um. Documentar o desvio aqui evita que a próxima revisão o trate
como esquecimento.

⚠️ **`created_at`/`updated_at` em `TIMESTAMPTZ`**, embora `tb_assessoria` use `timestamp without time
zone`. O padrão do módulo pede `TIMESTAMPTZ` em tabela nova; não replicar a dívida da tabela vizinha.

**Versão:** a última migration é a `V74`; esta é a **`V75`** — conferir antes de escrever, o número
anda.


## Decisões de arquitetura (task 1.2), tomadas em 2026-08-07

### Tenant no Keycloak: **Organizations**, não grupo/atributo

Não é escolha de opinião — é o caminho já implementado:

```
gateway   POST /admin/realms/{realm}/organizations
          POST /admin/realms/{realm}/organizations/{orgId}/members/invite-user
realm     organizationsEnabled: true
token     organization: { <alias>: { tenant_id: [...], id: ... } }
```

Organization é primitiva de multi-tenancy: membros, convites, casamento por domínio, IdP por
organização. Grupo é hierarquia genérica de autorização — escolhê-lo significaria reconstruir à mão
o que a feature entrega pronta, e o `SPRINTS.md` registra a migração Groups→Organizations como
pendente (ou seja, andar para trás).

**Três restrições que vêm junto, registradas para não virarem surpresa:**

1. **Um usuário, uma organização.** Há bugs conhecidos do Keycloak quando o usuário pertence a mais
   de uma (a claim `organization` some — keycloak#43635, #35830). O modelo do produto é um coach por
   assessoria, então não morde; **modelar usuário em duas assessorias exige revisitar isto**.
2. **`organization` é optional client scope.** Se o cliente não pedir, o token sai sem `tenant_id`, o
   login conclui normalmente e **tudo responde 403**. Coberto por teste no front; manter assim.
3. **A feature é nova (KC 26) e tem arestas.** Em 2026-08-07 uma colisão do client scope
   `organization` produzia `unknown_error` intermitente na emissão de token.

📌 **A coluna `keycloak_group_id` (UNIQUE) em `tb_assessoria` é dívida legada.** Não usar em código
novo. E, verificado no mesmo dia: a única assessoria de dev está com `keycloak_organization_id` **e**
`keycloak_group_id` vazios — o vínculo nunca foi persistido, o que confirma que **o provisionamento
jamais rodou ponta a ponta em dados reais**.

### Verificação de e-mail: `verifyEmail: true` no realm

**Decisão do CTO: desconsiderar os cadastros existentes.** Isso remove o que tornava a questão
espinhosa — a política retroativa sobre usuários já criados com `email_verified: false`.

Com isso, `verifyEmail: true` passa a ser configuração de realm, versionada no
`menthoros-realm.json` como os demais atributos, e o fluxo nativo do Keycloak dispara a verificação.
A pré-condição de SMTP foi resolvida em 2026-08-07.

⚠️ **Ligar `verifyEmail` é retroativo por natureza** — vale para todos os usuários do realm, não só
para os novos. A decisão de desconsiderar os existentes é o que torna isso aceitável; se algum
usuário legado precisar continuar entrando, ele terá de verificar o e-mail ou ser marcado como
verificado à mão.


## Restrições de código que a orquestração TEM de respeitar (2026-08-07)

Levantadas no segundo gate de DoR, verificadas no código. Nenhuma estava no design, e as três mudam
o que a implementação pode fazer.

### 1. `Usuario.id` **é** o subject do Keycloak — a ordem de criação não é livre

```java
// Usuario.java:38-44
/** ID do usuário - MESMO UUID do subject (sub) do JWT do Keycloak */
@Id private UUID id;

// UsuarioSyncServiceImpl:115-119
.id(UUID.fromString(keycloakId))   // ID = subject do JWT
```

**Consequência:** o `Usuario` local **não pode existir antes** do usuário no Keycloak — sua chave
primária é o `sub`. A ordem é obrigatória:

```
1. Assessoria (local)          → obtém tenant
2. Organization (Keycloak)     → obtém orgId
3. Usuário (Keycloak)          → obtém o sub
4. Usuario (local, id = sub)   → só agora é possível
```

E a compensação desfaz exatamente na inversa: `4 → 3 → 2 → 1`.

⚠️ Se o Keycloak um dia emitir id não-UUID, `UUID.fromString` estoura. Hoje ele emite UUID; a
implementação deve **falhar alto** nesse caso, não improvisar um id local.

### 2. Nunca habilitar o usuário antes de o verify-email ter saído

A versão anterior deste design dizia "marca ACTIVE, habilita usuário e dispara verify-email" — e
mandava compensar genericamente se algo falhasse. **Não serve:** se o envio falha depois de
habilitar, sobra usuário habilitado no Keycloak e assessoria ativa, com conta que ninguém confirma.

**Regra inequívoca:** o usuário nasce **desabilitado**. Só é habilitado **depois** de o envio do
verify-email retornar sucesso. Falha no envio ⇒ compensa (remove usuário e organização) ⇒ o cadastro
falha inteiro, e o coach tenta de novo — em vez de ficar com conta que não entra e não avisa por quê.

### 3. `AssessoriaServiceImpl.criarAssessoria` **não** serve para o signup público

```java
// AssessoriaServiceImpl:53-59 — cria a Organization e depois salva o orgId,
// SEM compensar a Organization se o save seguinte falhar.
```

É aceitável no cadastro administrativo, feito por alguém que percebe e corrige. **Não é aceitável no
cadastro público**, onde ninguém está olhando e o resíduo fica órfão no Keycloak.

**O orquestrador novo não deve chamar esse método.** Se houver reuso, é da parte de montagem da
entidade — nunca do fluxo que cria a Organization.

### 4. `RECONCILIATION_REQUIRED` e o `tenantId`

A spec exige registrar `tenantId` no evento; a `tb_signup_provisioning` deliberadamente não tem
`tenant_id` (a tabela existe antes do tenant). **Não é contradição, é ordem:** o campo a registrar é
o `assessoria_id`, que existe a partir do passo 1. Falha antes disso não tem tenant a registrar — e
o `correlation_id` é o que amarra o rastro nesse caso.

### 5. Billing: o signup **não** cria `Assinatura`

`Assinatura` é 1:1 com `Assessoria` e é ela que controla plano e status quando a cobrança existe
(`V68`, `V70`; `AssinaturaServiceImpl` grava plano só ao confirmar cobrança). O signup cria a
`Assessoria` em BASIC com `ativo = true` e **nenhuma** `Assinatura` — esse é o estado pré-cobrança.

⚠️ **Quando a cobrança entrar**, quem a implementar precisa tratar assessoria sem assinatura como
"plano gratuito vigente", não como inadimplente. Registrado aqui porque é exatamente o tipo de
suposição que se perde entre duas changes.


## Anti-abuso — decidido em 2026-08-07

Endpoint público, anônimo, que cria recursos em dois sistemas e **dispara e-mail**. O precedente do
módulo já resolve metade: `WaitlistInputDto` tem campo honeypot e o `WaitlistController` responde
**`CRIADO`** quando ele vem preenchido — indistinguível para o bot —, e o `WaitlistRateLimitFilter`
limita por IP contando por `getRemoteAddr()`, não pelo `X-Forwarded-For` cru (falsificável).

### O recurso escasso não é linha no banco — é a cota de e-mail

O Workspace da GoDaddy entrega ~250 relays/dia. Um cadastro em massa **esgota a cota de envio**, e o
efeito real não é banco cheio: é **o e-mail de verificação dos cadastros legítimos parar de sair**,
sem erro visível para ninguém. Toda a política abaixo protege esse recurso.

### Decisão

| Camada | O quê | Por quê |
|---|---|---|
| **Filtro único** | generalizar o `WaitlistRateLimitFilter` para rota/limite configuráveis | dois mecanismos divergem no primeiro ajuste |
| **Por IP** | ~3/hora | primeira linha, barata |
| **Por e-mail** | ~3/dia | **rotacionar IP é barato**; sem esta, um atacante distribuído esgota a cota de e-mail e ainda bombardeia a caixa de terceiro usando o domínio |
| **Honeypot** | reusar o padrão, com resposta indistinguível | atrito zero, custo zero |
| **Teto diário global** | **~20 cadastros/dia** + alerta | protege a cota de envio e **avisa antes** de o sintoma chegar como "o coach não recebeu o e-mail" |

Os números são ponto de partida para calibrar, não verdades.

⚠️ **O teto acompanha o volume real — e por isso começa baixo.** Decisão do CTO em 2026-08-07: o
volume esperado no pré-piloto é de zero a poucos cadastros por dia. Um teto de 150 **não alarmaria
nada** — um abuso caberia inteiro embaixo dele e esgotaria a cota de e-mail em silêncio. Teto útil é
teto justo acima do volume real; com ~20/dia, qualquer coisa acima já é anomalia evidente. **Subir
conforme o uso crescer** faz parte da operação, não é dívida.

Os limites por IP e por e-mail não tocam usuário legítimo: um coach se cadastra **uma vez**. Três por
hora e três por dia só são atingidos por engano ou por automação.

### CAPTCHA/Turnstile: **não agora** — decisão do CTO

Duas razões, e a segunda é a que pesa:

1. **O dano de um cadastro falso é pequeno.** A conta nasce desabilitada e só é habilitada após a
   verificação de e-mail — ela não opera. O que o abuso consome de verdade é cota de envio, e as
   camadas acima atacam isso diretamente.
2. **CAPTCHA adiciona atrito exatamente no fluxo cuja métrica primária é "assessorias que começam a
   usar".** Pagar conversão para mitigar um risco que ainda é hipótese é o trade errado neste
   estágio.

**Gatilho declarado para reverter a decisão** — para não virar "nunca":

- o teto diário global ser atingido; **ou**
- cadastros não verificados passarem de ~50% numa janela de 24h.

Quando qualquer um disparar, o atrito passa a se justificar porque o abuso deixou de ser hipótese.


## Riscos e mitigações

Consolidado em 2026-08-07 — o gate apontou duas vezes que os riscos estavam espalhados em callouts e
não davam para auditar numa leitura só.

| Risco | Mitigação |
|---|---|
| 🔴 **Identidade órfã: conta no Keycloak sem tenant local.** É pior que falhar — o coach entra e encontra um produto quebrado. | Ordem de criação fixa (`Usuario.id` **é** o `sub`, então o local vem por último) + compensação inversa + `RECONCILIATION_REQUIRED` quando a própria compensação falha. Cenário dedicado na spec. |
| 🔴 **Conta habilitada que ninguém confirma.** Se o verify-email falhar depois de habilitar o usuário, ele existe, está habilitado e não recebe nada. | Usuário **nasce desabilitado**; habilita só após o envio retornar sucesso. Falha no envio compensa o cadastro inteiro. Cenário na spec, não só no design. |
| 🔴 **Abuso esgota a cota de e-mail (~250/dia) e a verificação dos cadastros legítimos para de sair** — sem erro visível para ninguém. | Limite por IP **e por e-mail**, teto diário global (~20/dia) com alerta, honeypot. O teto começa baixo de propósito: com volume real perto de zero, teto alto não alarma. |
| 🟠 **`verifyEmail: true` é retroativo** — vale para todos os usuários do realm, não só os novos. | Decisão do CTO de desconsiderar cadastros existentes. Consequência aceita: usuário legado precisa verificar ou ser marcado à mão. |
| 🟠 **Bugs do Keycloak com usuário em múltiplas organizations** (claim some — keycloak#43635, #35830). | Modelo é um coach por assessoria. **Restrição registrada:** modelar usuário em duas assessorias exige revisitar isto. |
| 🟠 **`organization` é optional client scope.** Sem ele o token sai sem `tenant_id`, o login conclui e **tudo responde 403** — o modo de falha mais caro de diagnosticar. | Já coberto por teste no front (`oidcConfig`/`authFlow`). Manter a cobertura; não remover o scope da requisição. |
| 🟠 **Reuso indevido do `AssessoriaServiceImpl`**, que cria Organization sem compensar. | O orquestrador novo **não** o chama. Registrado nas restrições de código. |
| 🟡 **Credencial admin do Keycloak no Railway não verificada ponta a ponta** — o domínio privado e a porta 8080 foram escolha minha, confirmada só pelo log de boot. | Task 0.1 aberta de propósito; fecha na primeira task que exercitar o gateway de verdade. |
| 🟡 **Imaturidade da feature Organizations (KC 26).** Em 2026-08-07 uma colisão do client scope `organization` produzia `unknown_error` intermitente. | Conhecido e documentado em `menthoros-infra/keycloak/README.md`. Sem mitigação prévia — é risco aceito da versão. |
| 🟡 **`keycloak_group_id` (UNIQUE) em `tb_assessoria`** é dívida legada de quando o tenant era grupo. | Não usar em código novo. Removê-la é change própria. |

### Rollback

O endpoint nasce atrás de **feature flag**. Desligar a flag interrompe novos cadastros sem tocar em
nada já criado — é o botão de pânico, e não depende de deploy.

Reverter o `verifyEmail` e a configuração de SMTP é mudança de realm + `sync-realm.sh`, independente
do código.


## Estados e o destino da `Assessoria` em falha — resolvido em 2026-08-09

O quarto gate achou uma contradição que **eu introduzi** ao fechar o gap anterior. Eu havia afirmado
as três coisas juntas, e elas não coexistem:

1. o slug usa a UNIQUE existente em `tb_assessoria.dominio`;
2. a assessoria falhada é "marcada como falha";
3. o slug volta a ficar disponível após a falha.

**Uma linha marcada como falha mantém o `dominio` — e a UNIQUE continua prendendo o slug.** Uma
segunda tentativa com o mesmo nome bateria em `409` para sempre.

### Decisão: a compensação **apaga** a `Assessoria`, não a marca

O passo 1 é desfeito por `DELETE`, não por mudança de estado. Três razões, e a primeira é a que
fecha a contradição:

- **libera o slug de verdade**, sem índice parcial, sem mutar `dominio` com sufixo, sem coluna nova;
- **o rastro não se perde:** é exatamente para isso que `tb_signup_provisioning` existe como tabela
  separada — ela guarda a tentativa, o `status`, o erro e os IDs externos, e sobrevive ao `DELETE`
  (a FK é `ON DELETE SET NULL`);
- mantém a compensação sendo o inverso literal da criação: o que o passo 1 criou, o passo 1 desfaz.

### Vocabulário de estados — onde cada um vive

O gate também apontou, com razão, que `PROVISIONING`/`ACTIVE`/`FAILED` apareciam misturados entre
`tb_assessoria`, `tb_signup_provisioning` e linguagem conceitual. Fica assim:

| Onde | Campo | Valores |
|---|---|---|
| `tb_signup_provisioning` | `status` | `PENDING`, `ASSESSORIA_CREATED`, `ORG_CREATED`, `USER_CREATED`, `COMPLETED`, `FAILED`, `RECONCILIATION_REQUIRED` |
| `tb_assessoria` | `ativo` (booleano **já existente**) | `true` a partir da criação |

⚠️ **`tb_assessoria` NÃO ganha coluna de estado.** Não há `PROVISIONING` nem `ACTIVE` nela — o ciclo
de vida do cadastro vive inteiro em `tb_signup_provisioning`. Onde o texto anterior deste design dizia
"criar assessoria local como `PROVISIONING`", leia-se: **criar a `Assessoria` e registrar
`ASSESSORIA_CREATED` na tabela de provisionamento**.

Isso evita schema novo em tabela madura e mantém um único lugar respondendo "em que pé está este
cadastro".

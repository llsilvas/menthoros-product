# keycloak-user-onboarding-auth — Auto-cadastro de Coach e Assessoria

**Tamanho:** L · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-07-31

## Problema

Cada nova assessoria exige criação manual de tenant, usuário e vínculos no Keycloak e no banco local. O processo não escala e falhas parciais podem deixar identidades órfãs.

## Escopo

1. Página pública `/cadastro` com nome do coach, e-mail, senha, nome da assessoria e slug desejado.
2. Endpoint público que reserva o slug, cria `Assessoria` no plano BASIC, provisiona organização/usuário/role no Keycloak e cria o `Usuario` local.
3. Verificação de e-mail pelo fluxo nativo do Keycloak.
4. Compensação explícita e observabilidade para falhas entre PostgreSQL e Keycloak.
5. Após cadastro, redirecionamento para o login OIDC padrão. Depois da autenticação/verificação, a jornada segue para consentimento e wizard conforme as changes correspondentes.

## Fora do escopo

- Troca de senha, recuperação de conta e telas de login customizadas; usar os fluxos OIDC/Keycloak existentes.
- Conversão automática da waitlist, cobrança, escolha de plano ou múltiplos técnicos.
- Aceite LGPD no formulário de cadastro; o aceite auditável pertence a `add-coach-lgpd-consent` e não será duplicado.
- Retornar senha, access token ou refresh token pelo endpoint de signup, armazenar token manualmente no `localStorage` ou implementar Resource Owner Password Credentials.
- Garantia ACID entre banco e Keycloak; integrações externas exigem compensação e reconciliação.

## Dependências e ordem

- Técnica: integração administrativa com Keycloak, criação de `Assessoria`, persistência de `Usuario`, OIDC e `TenantContext` existentes devem ser confirmados na discovery task.
- Jornada: implantar `add-coach-lgpd-consent` antes de abrir o cadastro ao público. `coach-first-login-wizard` pode ser implantada depois; até lá o coach segue ao dashboard.
- `assessoria-settings-ui` e `import-atletas-csv` não são dependências do signup.

## Critérios de aceite

- **Quando** dados válidos e únicos são enviados, **então** a API retorna `201` sem tokens/segredos, e assessoria, organização, usuário Keycloak e usuário local ficam vinculados ao mesmo tenant.
- **Quando** e-mail ou slug já existem, **então** retorna `409` genérico o suficiente para não expor outras contas além do necessário ao fluxo.
- **Quando** uma etapa externa falha, **então** a operação termina em erro controlado, executa compensações na ordem inversa e registra eventual resíduo para reconciliação.
- **Dado** cadastro concluído, **quando** o coach segue o CTA, **então** entra pelo Authorization Code + PKCE usado pela aplicação, verifica o e-mail conforme política e recebe JWT com tenant/role corretos.
- **Quando** o rate limit, limite de payload ou proteção anti-bot dispara, **então** nenhuma entidade é criada.
- Senha e tokens nunca aparecem em logs, respostas de erro, analytics ou traces.

## Métrica de sucesso

**Primária — a que responde se a change cumpriu o objetivo:**
**% de assessorias criadas pelo cadastro público que registram o primeiro atleta em até 7 dias.**

O objetivo declarado não é "se cadastrar", é **começar a usar**. Uma assessoria que se cadastra e não
cadastra atleta nenhum não virou cliente — virou linha no banco. Esta métrica é a única que
distingue as duas coisas, e liga o cadastro à rotina do treinador.

**Secundária — operacional, do provisionamento:**
Pelo menos 90% dos cadastros válidos concluem a criação em até 2 minutos, com menos de 1% de estados
residuais que exijam reconciliação manual.

⚠️ **A secundária sozinha engana.** Ela pode ficar verde com 100% dos cadastros concluindo em 30
segundos e ninguém usando o produto — foi por isso que o gate de DoR a apontou como não ligada à
rotina do treinador. Ela mede se o mecanismo funciona, não se serviu para alguma coisa.

## Open Questions & Assumptions

**Resolvidas em 2026-08-07 — registradas no `design.md`:**

- ~~Container de tenant no Keycloak~~ → **Organizations**, não grupo/atributo. É o caminho já
  implementado no gateway. Vêm junto duas restrições: um usuário por organização, e o scope
  `organization` é optional (sem ele o token sai sem `tenant_id` e tudo responde 403).
- ~~Política de verificação de e-mail~~ → **`verifyEmail: true` no realm**, desconsiderando os
  cadastros existentes (decisão do CTO). A pré-condição de SMTP foi resolvida no mesmo dia.
  ⚠️ **Ajustado em 2026-08-09:** o usuário nasce **habilitado** com required action `VERIFY_EMAIL`,
  não desabilitado — o Keycloak recusa enviar e-mail a usuário desabilitado. Ver `design.md`,
  "Restrições de código", item 2.
- ~~Estado de provisionamento~~ → tabela **`tb_signup_provisioning`** (V75), esboçada no `design.md`.
- ~~Billing~~ → o signup **não** cria `Assinatura`; `Assessoria` em BASIC com `ativo = true` é o
  estado pré-cobrança.

**Resolvida em 2026-08-07 — anti-abuso** (detalhes no `design.md`):

- **Sem CAPTCHA agora**, com gatilho declarado para revisar (teto diário atingido, ou >50% de
  cadastros não verificados em 24h). A conta não conclui login enquanto o e-mail não for verificado,
  então o dano de um cadastro falso é pequeno — e CAPTCHA cobraria conversão no fluxo cuja métrica
  primária é "assessorias que começam a usar".
- **Rate limit em duas dimensões:** ~3/hora por IP e ~3/dia por e-mail, no filtro generalizado.
  A dimensão por e-mail existe porque **o recurso escasso é a cota de ~250 e-mails/dia** — rotacionar
  IP é barato, e esgotar a cota faz a verificação dos cadastros **legítimos** parar de sair.
- **Teto diário global** (~20/dia) com alerta, protegendo a cota de envio. Começa baixo **de
  propósito**: com volume real de zero a poucos por dia, um teto alto não alarmaria nada — o abuso
  caberia embaixo dele. Sobe conforme o uso crescer.
- **Honeypot** reusando o padrão do waitlist, com resposta indistinguível para o bot.

**Nenhuma questão bloqueante em aberto.**

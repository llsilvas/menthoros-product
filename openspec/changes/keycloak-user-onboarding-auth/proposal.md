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

- **Bloqueante:** confirmar se o deployment usa Keycloak Organizations ou grupos/atributos para representar tenant; os documentos usam “container de tenant” até essa decisão.
- **Bloqueante:** definir política de verificação de e-mail: bloquear o primeiro login ou permitir acesso limitado. A premissa recomendada é `verifyEmail=true` antes do acesso protegido.
  **Dado novo (2026-08-04, achado no walking skeleton do PKCE):** já existe usuário no realm com
  `email_verified: false` — o `leandro`. Hoje é inofensivo, porque nada no fluxo lê esse claim. Mas a
  política precisa dizer o que fazer com quem **já está lá**: exigir verificação retroativamente
  quebra acesso existente; não exigir cria duas classes de conta, e a diferença fica invisível até
  alguém depender dela.
- **Bloqueante:** escolher proteção anti-abuso (rate limit distribuído e CAPTCHA/Turnstile) e limites por IP/e-mail.
- **Premissa:** o slug é o campo hoje chamado `dominio` na entidade; a UI o chama “endereço da assessoria” para não sugerir domínio DNS.

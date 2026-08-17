# migrate-keycloak-dev-to-repo-build — o Keycloak de dev passa a rodar a imagem do repositório

**Tamanho:** S · **Trilha:** Full *(o tamanho é pequeno; a trilha é Full pelo risco — este serviço
autentica todo o ambiente de desenvolvimento)*
**Status:** proposta
**Criado:** 2026-08-16

> **Origem: seção 4 de `customize-keycloak-login-theme`,** destacada em 2026-08-16 por decisão do
> CTO. Aquela change já previa o desmembramento: *"as seções 1–3 são mergeáveis sem a 4; se a seção 4
> travar, ela sai para change própria em vez de segurar o resto."* Não travou — foi destacada porque
> o resto ficou pronto e não havia motivo para segurá-lo.

## Why

O tema de login do Menthoros está no ar em **local** e **HomeLab**, mas não em **dev**. Não por
esquecimento: o serviço `menthoros-keycloak` no Railway roda a **imagem pública**
`quay.io/keycloak/keycloak:26.6`, e não existe mecanismo pelo qual um arquivo do repositório chegue
lá dentro.

O problema é maior que o tema. Enquanto a origem for imagem pública, **nada que a gente construa
chega ao Keycloak de dev** — nem tema, nem provider, nem qualquer customização futura. O tema é só a
primeira coisa a esbarrar nisso.

Há ainda um drift silencioso: dev está em `26.6`, uma **tag móvel**, enquanto local e HomeLab estão
pinados em `26.7.0`. A cada redeploy o Keycloak de dev pode trocar de patch sem ninguém pedir, e a
tela de login é testada contra uma versão e servida sobre outra.

## What Changes

- **Trocar a origem do serviço** `menthoros-keycloak` de `source.image` para `source.repo:
  llsilvas/menthoros-infra`, construindo por `docker/Dockerfile.keycloak` — o mesmo Dockerfile que já
  alimenta local e HomeLab.
- **Restringir o gatilho de build por watch patterns**, para que editar um `.md` não redeploye o
  provedor de identidade do ambiente.
- **Alinhar a versão** — o Dockerfile fixa `26.7.0`, então a troca de origem leva dev junto, saindo
  da tag móvel.
- **Aplicar `loginTheme` em dev** pelo `sync-realm.sh`, depois do preflight.

## Fora de escopo

- **`start-dev` em ambiente compartilhado.** Dívida real, anterior a esta change: modo de
  desenvolvimento sem otimização de startup e com garantias relaxadas. Quem mexer na origem do
  serviço vai esbarrar nela, e é tentador consertar junto — não conserte. É mudança de
  comportamento de runtime, não de origem de imagem, e merece decisão própria.
- **`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` no serviço.** São as variáveis do Keycloak antigo; a
  26.x usa `KC_BOOTSTRAP_ADMIN_*`. Funcionam por compatibilidade, mas é pin numa ponte que um dia sai.
- **Imagem própria num registry (GHCR).** Seria mais limpo — imagem imutável, promoção entre
  ambientes —, mas exige esteira de CI e credenciais de registry que o `menthoros-infra` não tem. O
  Dockerfile único é pré-requisito dessa evolução, não obstáculo a ela.
- **Produção.** Não existe ainda (`SPRINTS.md`). O modelo escolhido aqui pode ser revisto quando
  existir; aceita-se fazer duas vezes em troca de exercitar o modelo antes.

## Critérios de aceite

- **CA1** — Dado o serviço com origem trocada, quando o deploy roda, então ele **sobe** e o Keycloak
  responde.
  *Evidência exigida:* deploy `SUCCESS` e `/realms/menthoros` em `200`.
- **CA2** — Dado o deploy concluído, então o tema `menthoros` **consta na lista de temas** do alvo.
  *Evidência exigida:* `menthoros` presente em `themes.login[].name` de `/admin/serverinfo` — não
  basta o arquivo estar no repositório.
- **CA3** — Dado o `startCommand` fixado no serviço (`/opt/keycloak/bin/kc.sh start-dev`), quando a
  origem muda, então ele **continua sendo o comando efetivo**. Ele sobrescreve o `CMD` do nosso
  Dockerfile, e é fácil "corrigir" o Dockerfile achando que ele manda.
- **CA4** — Dado um commit que toca **apenas** `docs/` ou `workspace/`, então **nenhum deploy é
  disparado**.
  *Evidência exigida:* commit real nessas pastas e ausência de deploy novo no serviço.
- **CA5** — Dado o tema instalado, quando o `sync-realm.sh` roda contra dev, então o preflight passa
  e o `loginTheme` é aplicado. Rodar **antes** do deploy tem de abortar.
- **CA6** — Dado o tema aplicado, então o login de dev **funciona igual**: mesmo redirect, mesma
  sessão, credencial inválida devolvendo a tela de erro em PT-BR — não um `500`.
- **CA7** — Dado o deploy, então a versão efetiva do Keycloak em dev é **`26.7.0`**, a mesma de local
  e HomeLab.
  *Evidência exigida:* `systemInfo.version` em `/admin/serverinfo`.

## Métrica de sucesso

Como em `customize-keycloak-login-theme`, não há métrica quantitativa honesta — isto é infraestrutura
de entrega, não feature de coach. O critério é binário e verificável: **um arquivo commitado em
`keycloak/themes/` aparece no Keycloak de dev após o deploy, sem intervenção manual.** Hoje isso é
impossível por construção.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| 🔴 **Uma imagem que não sobe deixa backend e front de dev sem login.** Diferente do HomeLab, aqui não há acesso ao host para consertar à mão. | O rollback é trocar `source` de volta para `image: quay.io/keycloak/keycloak:26.7.0` — operação de painel, não projeto. As variáveis do serviço são preservadas na troca de origem. **Fazer em janela de baixo uso.** |
| 🔴 **Build disparado por qualquer push no `menthoros-infra`** — repo que guarda docs e scripts. Sem watch patterns, editar um `.md` redeploya o provedor de identidade. | CA4 existe para isto. Configurar os patterns **junto** com a troca de origem, não depois. |
| **Versão sobe de `26.6` para `26.7.0` junto com a troca.** É desejável, mas é uma segunda mudança no mesmo passo. | A 26.7.0 já roda em local e HomeLab há tempo, com o mesmo realm e o mesmo tema. O risco de migração está exercitado — foi o que a ordem `local → HomeLab → Railway` comprou. |
| **`sync-realm.sh` aplica o realm no alvo do `.env.sync`.** O `.env.sync.example` aponta para o Railway, mas o `.env.sync` real aponta para o HomeLab. | O preflight aborta se o tema não estiver no alvo. Ainda assim, **conferir a linha `>> Alvo:`** antes de confirmar. Ver `menthoros-infra#12`, que trata do `.env.sync` sobrescrever variáveis exportadas. |

## Open Questions & Assumptions

**Premissas:**

1. O Railway aceita `source.repo` com `dockerfilePath` apontando para `docker/Dockerfile.keycloak` e
   contexto na raiz do repositório. O Dockerfile copia de `keycloak/themes/`, então **contexto
   estreitado quebra o build** — é o motivo de watch patterns terem sido escolhidos em vez de
   `rootDirectory` (decisão registrada em `customize-keycloak-login-theme`).
2. As variáveis de ambiente do serviço sobrevivem à troca de origem. Documentado pelo Railway; a
   confirmar na prática, porque perdê-las derruba a conexão com o banco.

**Em aberto:**

- **Q1 — O repositório é privado; o Railway tem acesso?** A troca de origem exige que a conta do
  Railway enxergue `llsilvas/menthoros-infra`. Se a instalação do GitHub App não incluir este repo,
  o primeiro passo é autorizá-lo — e isso é ação no painel, fora de qualquer script.
- **Q2 — O build no Railway tem cache de camada?** Sem cache, cada push que casar o watch pattern
  reconstrói a imagem inteira. Não bloqueia, mas define se o gatilho pode ser generoso ou precisa ser
  cirúrgico.

# customize-keycloak-login-theme — Tela de login com a identidade do Menthoros

**Tamanho:** S · **Trilha:** Full *(escalada em 2026-08-05: entregar o tema em dev exige mudar a
origem do serviço Keycloak no Railway — ver Q3)*
**Status:** proposta
**Criado:** 2026-08-04

> Origem: `migrate-login-to-authorization-code-pkce`. Ao tirar a senha de dentro da aplicação, o
> login passou a acontecer **na tela do Keycloak** — hoje o tema padrão, em inglês
> (*"Sign in to menthoros"*), sem marca nenhuma. É consequência esperada da migração, não regressão.

## Why

O treinador é redirecionado para uma tela que não se parece com o produto que ele contratou, num
domínio diferente, no momento mais sensível da jornada: a entrada. Para quem está avaliando o
Menthoros, isso lê como "integração de terceiros", não como parte do produto.

O custo de não fazer cresce: com `keycloak-user-onboarding-auth`, a **verificação de e-mail** do
signup público também sai do Keycloak, e a primeira impressão de todo coach novo passa a incluir
uma tela genérica. Recuperação de senha e MFA — que esta migração destravou — vêm pelo mesmo
caminho.

Verificado em 2026-08-04: **nenhum tema está configurado** (`loginTheme`, `accountTheme` e
`emailTheme` ausentes no `menthoros-realm.json`, portanto no default).

## What Changes

- **Tema `menthoros`** para as telas de login, com **`parent=keycloak.v2`** — herda estrutura e
  acessibilidade do tema base e sobrescreve apenas identidade visual (paleta, tipografia, fundo,
  logo).
  ⚠️ **Corrigido em 2026-08-16:** este item dizia `parent=keycloak`, contradizendo `design.md`
  (Decisão 2) e a task 1.1. Verificado na 26.7.0: `keycloak` é o tema **legado** (PatternFly v4) e
  `keycloak.v2` é o servido por padrão. Herdar do errado troca o layout, não a paleta.
- **`loginTheme: menthoros`** no `menthoros-realm.json`, aplicado pelo `sync-realm.sh`.
- **Criar o caminho de entrega do tema, que hoje não existe.** O `Dockerfile.keycloak` está no repo
  mas é **órfão**: o `docker-compose.yml:59` puxa `quay.io/keycloak/keycloak` direto por `image:` e
  nunca o constrói. **Decidido (2026-08-05): compose passa a usar `build:`** apontando para
  `docker/Dockerfile.keycloak`, que copia o tema para `/opt/keycloak/themes/menthoros` — um único
  artefato serve local e remoto, em vez de um volume que resolveria só o local.
- **Tradução PT-BR das telas.** **Decidido (2026-08-05):** entra nesta change, via
  `messages_pt_BR.properties`. Um produto inteiramente em português exibindo *"Sign in to menthoros"*
  contradiz a própria métrica de sucesso — o custo é um arquivo de properties, menor que o de uma
  change separada.
- **Pin do `keycloak-config-cli`.** O `sync-realm.sh` usa `:latest`, o que é drift operacional numa
  ferramenta cuja falha bloqueia autenticação.

## Fora de escopo — abrir como change própria

- **Keycloakify** (gerar o tema a partir de componentes React, reaproveitando MUI e os tokens).
  Atraente para manter uma fonte de verdade visual, mas exige pipeline de build só para o tema.
  Passa a valer se a tela do IdP virar superfície de produto de verdade.
- **Templates FreeMarker próprios** (`login.ftl` etc.). Só quando o layout precisar mudar de
  estrutura, não de aparência — cada template sobrescrito é superfície que quebra a cada upgrade.
- **`accountTheme` e `emailTheme`.** O e-mail entra junto de `keycloak-user-onboarding-auth`, que é
  quem o coloca no caminho crítico.
- ~~Textos e tradução (PT-BR) das telas~~ — **trazido para o escopo** em 2026-08-05 (ver What Changes).

## Critérios de aceite

- **CA1** — Dado um usuário não autenticado, quando é redirecionado ao Keycloak, então vê a tela com
  logo, paleta e tipografia do Menthoros.
  *Evidência exigida:* o tema aparece na lista de temas do realm **antes** de ser aplicado, e a tela
  de login responde `200` servindo o CSS próprio — não basta captura de tela, que não distingue
  "tema aplicado" de "cache do navegador".
- **CA2** — Dado o tema aplicado, quando o login é feito, então **o fluxo funciona igual**: mesmo
  redirect de volta, mesmo destino, mesma sessão. Tema é aparência; qualquer mudança de
  comportamento é regressão.
  *Evidência exigida:* `redirect_uri` final idêntico ao de antes, sessão estabelecida, e credencial
  inválida devolvendo a tela de erro — **não** um `500`.
- **CA3** — Dado erro de credencial, então a mensagem aparece **legível** no tema novo. Herdar o
  `parent` não garante contraste: a mensagem de erro é o texto mais fácil de sumir num fundo escuro.
- **CA4** — Dado o tema, quando aberto em viewport de celular, então permanece utilizável — o coach
  entra do telefone à beira da pista.
- **CA5** — Dado o `sync-realm.sh` aplicado num Keycloak sem o tema instalado, então o realm **não
  fica quebrado**: ou o tema já está na imagem, ou o `loginTheme` não é aplicado. Um realm apontando
  para tema inexistente derruba a tela de login.
- **CA6** — Contraste de texto sobre fundo atende **WCAG AA**, o mesmo padrão que
  `refactor-color-system-premium-v2` estabeleceu para o produto.
- **CA7** — Dado o tema aplicado, então as telas aparecem em **PT-BR** — incluindo o título, os
  rótulos dos campos, o botão de entrar e **as mensagens de erro**. Uma tela metade traduzida é pior
  que uma tela em inglês: denuncia o remendo.
  *Evidência exigida:* tela de login e tela de credencial inválida, ambas sem texto em inglês.

## Métrica de sucesso

Não há métrica quantitativa honesta aqui — é percepção de marca num fluxo que já funciona.
O critério é qualitativo e verificável: **um coach que nunca viu o produto não consegue dizer em que
momento saiu do Menthoros**, exceto pelo domínio na barra de endereço.

A revisão de produto sugeriu formalizar isso como exceção ao critério do `config.yaml`, ou trocar por
um proxy negativo tipo "zero incidentes de login". **Recusado:** o proxy mede se não quebramos, não
se ficou bom. Um número inventado seria pior que admitir que o critério é qualitativo.

## Revisão de produto (2026-08-05) — veredito Refine, escopo mantido

A revisão pela lente do coach levantou uma objeção legítima: o `Why` desta change é a percepção de um
coach avaliando o produto, mas o escopo entrega em **local** e **dev** — e `SPRINTS.md:291` registra
que a **infra Keycloak de produção ainda não existe**. O coach do argumento não passa por nenhum dos
dois ambientes. Somado a isso, a change cresceu de "tema de login" para quatro itens de higiene de
infra (Dockerfile órfão, drift de versão, gatilho de build, pin do `keycloak-config-cli`) dentro de um
envelope dimensionado como `S`.

A recomendação era desmembrar: seções 1–3 agora, seção 4 (Railway) como change própria sequenciada
com o planejamento de produção ou com `keycloak-user-onboarding-auth`.

**Decisão do CTO em 2026-08-05: manter a seção 4 nesta change, em trilha Full.** O que a decisão
assume, registrado para quem revisitar:

- A reforma de deploy do Keycloak de dev **pode ser refeita** quando produção existir. Aceita-se
  fazer duas vezes em troca de ter o modelo de deploy exercitado e validado em dev antes de produção
  — é ensaio, não retrabalho puro.
- O ganho de marca em dev é interno (dogfooding, demo), não comercial. O retorno comercial só chega
  com produção.
- O risco fica concentrado na seção 4 e é mitigável: as seções 1–3 entregam valor sozinhas, e o
  rollback do serviço (voltar `source` para a imagem pública) é uma operação, não um projeto.

**Consequência prática:** a seção 4 só começa depois da seção 3 fechada no local. Se ela travar, as
seções 1–3 são mergeáveis sozinhas — a change não vira refém do Railway.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| 🔴 **Tema quebrado derruba o login de todos.** Diferente de uma tela interna, esta é a porta: um erro de template ou um `loginTheme` apontando para tema inexistente deixa o produto inacessível. | Aplicar primeiro no Keycloak local/HomeLab e validar o fluxo completo antes de qualquer ambiente compartilhado. Rollback é remover `loginTheme` do realm e rodar o sync — anotar o comando na própria change. |
| 🔴 **Divergência de versão do Keycloak.** O `Dockerfile.keycloak` fixa `26.2.5`; o container roda **26.6.0** (o compose usa `KC_VERSION:-26.6`). Temas são acoplados à versão do tema base que estendem. | Alinhar o Dockerfile à versão real **antes** de construir o tema. Sem isso, o tema é testado contra uma base e servido sobre outra. |
| 🔴 **O pin `26.2.5` do `Dockerfile.keycloak` vira downgrade silencioso.** Hoje ele é inerte porque ninguém constrói o arquivo. No instante em que compose e Railway passam a buildar dele, esse pin passa a ser a versão que roda — e o Keycloak **regride de 26.6 para 26.2.5 nos dois ambientes**, sem que ninguém tenha pedido. | Alinhar para 26.6 (task 0.2) é **pré-condição** das tasks 2.1 e 4.1, não higiene paralela. |
| **A seção 4 reconstrói o deploy de dev antes de produção existir.** `SPRINTS.md:291`: infra Keycloak de produção pendente. O modelo de deploy escolhido aqui pode ser revisto quando produção nascer. | Decisão consciente (ver Revisão de produto). Seções 1–3 são mergeáveis sem a 4; se a seção 4 travar, ela sai para change própria em vez de segurar o resto. |
| **Upgrade do Keycloak quebra o tema** | Herdar de `parent=keycloak` e sobrescrever só CSS/imagens reduz a superfície. Se um dia exigir template próprio, a decisão passa a ter custo recorrente e deve ser consciente. |
| 🔴 **O `sync-realm.sh` aplica `loginTheme` cegamente.** A política `no-delete` protege clients, groups, roles e users — **não** atributos de realm. Com `loginTheme: menthoros` no JSON, qualquer sync contra um alvo **sem** o tema instalado aponta o realm para um tema inexistente e derruba a tela de login. E deploy de imagem e sync de realm são planos separados, sem ordenação transacional entre si. | Preflight obrigatório: verificar que o tema aparece na lista do alvo **antes** de aplicar o JSON com `loginTheme`. O que o proposal antes chamava de mitigação ("o realm versionado aplica igual em todos") é justamente o vetor do risco. |

## Open Questions & Assumptions

**Premissas:**

1. ~~O tema pode ser servido pela imagem, já que o `Dockerfile.keycloak` existe.~~ **PREMISSA
   REFUTADA (2026-08-04, passe adversarial):** o `Dockerfile.keycloak` é **órfão** — o
   `docker-compose.yml:59` usa `image: quay.io/keycloak/keycloak:${KC_VERSION:-26.6}` e nada o
   constrói. **Não existe hoje caminho para o tema chegar ao container**, nem local nem remoto.
   Criar esse caminho passou a ser escopo da change, não pré-condição satisfeita.
   **Resolvido para o local em 2026-08-05:** compose com `build:`. **Continua aberto para o remoto**
   — ver Q3.
2. Herdar `parent=keycloak` cobre a acessibilidade e a estrutura das telas, restando identidade
   visual. Padrão da documentação, a confirmar na prática.

**Em aberto:**

- ~~**Q1 — O tema traduz as telas para PT-BR?**~~ **RESOLVIDO (2026-08-05): sim, nesta change**, via
  `messages_pt_BR.properties`. Ver CA7.
- **Q2 — Vale investir no `accountTheme` agora?** É a tela onde o usuário gerencia a própria conta.
  Fora do caminho crítico hoje; entra se a recuperação de senha for divulgada.
- ~~**Q3 — Como o Keycloak de dev é construído no Railway?**~~ **RESPONDIDO (2026-08-05, via Railway
  CLI/API) — e a hipótese pessimista se confirmou.** O serviço `menthoros-keycloak`
  (projeto `robust-expression`, env `develop`, domínio `menthoros-keycloak-develop.up.railway.app`)
  deploya a **imagem pública** `quay.io/keycloak/keycloak:26.6`:

  ```
  source.image     quay.io/keycloak/keycloak:26.6
  source.repo      null
  builder          RAILPACK
  rootDirectory    null
  railwayConfigFile null
  startCommand     /opt/keycloak/bin/kc.sh start-dev
  ```

  **Não há repositório nem Dockerfile no caminho** — o tema não chega ao Keycloak de dev por nenhum
  mecanismo existente. Entregá-lo lá exige **mudar a origem do serviço** (image → build de repo, ou
  imagem própria num registry), o que é mudança de modelo de deploy de um serviço que autentica todo
  o ambiente de desenvolvimento. Por isso a change **escala para trilha Full** e ganha `design.md`.

  Dois detalhes que o `design.md` precisa carregar:
  - o `startCommand` está fixado **no serviço**, não na imagem — sobrevive à troca de origem e
    continua sobrescrevendo o `CMD` de qualquer Dockerfile nosso;
  - `start-dev` num ambiente compartilhado é dívida própria, fora do escopo desta change, mas quem
    mexer na origem do serviço vai esbarrar nela.

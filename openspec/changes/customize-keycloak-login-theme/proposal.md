# customize-keycloak-login-theme — Tela de login com a identidade do Menthoros

**Tamanho:** S · **Trilha:** Fast
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

- **Tema `menthoros`** para as telas de login, com `parent=keycloak` — herda estrutura e
  acessibilidade do tema base e sobrescreve apenas identidade visual (paleta, tipografia, fundo,
  logo).
- **`loginTheme: menthoros`** no `menthoros-realm.json`, aplicado pelo `sync-realm.sh`.
- **Criar o caminho de entrega do tema, que hoje não existe.** O `Dockerfile.keycloak` está no repo
  mas é **órfão**: o `docker-compose.yml` puxa `quay.io/keycloak/keycloak` direto por `image:` e
  nunca o constrói. Ou o compose passa a usar `build:`, ou outro mecanismo (volume, provider) é
  escolhido — decisão da discovery.
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
- Textos e tradução (PT-BR) das telas — ver Open Questions.

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

## Métrica de sucesso

Não há métrica quantitativa honesta aqui — é percepção de marca num fluxo que já funciona.
O critério é qualitativo e verificável: **um coach que nunca viu o produto não consegue dizer em que
momento saiu do Menthoros**, exceto pelo domínio na barra de endereço.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| 🔴 **Tema quebrado derruba o login de todos.** Diferente de uma tela interna, esta é a porta: um erro de template ou um `loginTheme` apontando para tema inexistente deixa o produto inacessível. | Aplicar primeiro no Keycloak local/HomeLab e validar o fluxo completo antes de qualquer ambiente compartilhado. Rollback é remover `loginTheme` do realm e rodar o sync — anotar o comando na própria change. |
| 🔴 **Divergência de versão do Keycloak.** O `Dockerfile.keycloak` fixa `26.2.5`; o container roda **26.6.0** (o compose usa `KC_VERSION:-26.6`). Temas são acoplados à versão do tema base que estendem. | Alinhar o Dockerfile à versão real **antes** de construir o tema. Sem isso, o tema é testado contra uma base e servido sobre outra. |
| **Upgrade do Keycloak quebra o tema** | Herdar de `parent=keycloak` e sobrescrever só CSS/imagens reduz a superfície. Se um dia exigir template próprio, a decisão passa a ter custo recorrente e deve ser consciente. |
| 🔴 **O `sync-realm.sh` aplica `loginTheme` cegamente.** A política `no-delete` protege clients, groups, roles e users — **não** atributos de realm. Com `loginTheme: menthoros` no JSON, qualquer sync contra um alvo **sem** o tema instalado aponta o realm para um tema inexistente e derruba a tela de login. E deploy de imagem e sync de realm são planos separados, sem ordenação transacional entre si. | Preflight obrigatório: verificar que o tema aparece na lista do alvo **antes** de aplicar o JSON com `loginTheme`. O que o proposal antes chamava de mitigação ("o realm versionado aplica igual em todos") é justamente o vetor do risco. |

## Open Questions & Assumptions

**Premissas:**

1. ~~O tema pode ser servido pela imagem, já que o `Dockerfile.keycloak` existe.~~ **PREMISSA
   REFUTADA (2026-08-04, passe adversarial):** o `Dockerfile.keycloak` é **órfão** — o
   `docker-compose.yml:59` usa `image: quay.io/keycloak/keycloak:${KC_VERSION:-26.6}` e nada o
   constrói. **Não existe hoje caminho para o tema chegar ao container**, nem local nem remoto.
   Criar esse caminho passou a ser escopo da change, não pré-condição satisfeita.
   *Ainda não verificado:* como o Railway constrói o Keycloak de dev/produção.
2. Herdar `parent=keycloak` cobre a acessibilidade e a estrutura das telas, restando identidade
   visual. Padrão da documentação, a confirmar na prática.

**Em aberto:**

- **Q1 — O tema traduz as telas para PT-BR?** Hoje aparece *"Sign in to menthoros"*. O Keycloak
  suporta `messages_pt_BR.properties`, e o produto é inteiramente em PT-BR — mas isso é conteúdo, não
  aparência, e pode virar escopo próprio.
- **Q2 — Vale investir no `accountTheme` agora?** É a tela onde o usuário gerencia a própria conta.
  Fora do caminho crítico hoje; entra se a recuperação de senha for divulgada.

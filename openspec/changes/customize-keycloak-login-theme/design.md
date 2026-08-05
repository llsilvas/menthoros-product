# Design — customize-keycloak-login-theme

**Criado:** 2026-08-05 · **Trilha:** Full (escalada — ver `proposal.md`, Q3)

> Este documento existe por um motivo só: **o tema não tem como chegar ao Keycloak**, nem local nem
> em dev. O CSS é a parte fácil. O que exige decisão é o caminho de entrega.

## O problema, em uma frase

Um tema do Keycloak é um diretório dentro do container (`/opt/keycloak/themes/<nome>`). Hoje nenhum
dos dois ambientes constrói uma imagem nossa: o local usa `image:` no compose, e o Railway usa a
imagem pública. Não existe artefato onde colocar o tema.

Estado verificado em 2026-08-05:

| | Local (`docker-compose.yml`) | Dev (Railway, `menthoros-keycloak`) |
|---|---|---|
| Origem | `image: quay.io/keycloak/keycloak:${KC_VERSION:-26.6}` | `source.image: quay.io/keycloak/keycloak:26.6` |
| Repo/Dockerfile | `docker/Dockerfile.keycloak` existe mas é **órfão** | `source.repo: null` |
| Comando | `command: start-dev` (compose) | `startCommand: /opt/keycloak/bin/kc.sh start-dev` (serviço) |
| Versão efetiva | `26.6` (tag móvel) | `26.6` (tag móvel) |
| Versão no Dockerfile | **26.2.5** — divergente | — |

**Atualizado em 2026-08-05.** O HomeLab foi para **26.7.0** (pin exato), e `docker-compose.yml` e
`Dockerfile.keycloak` passaram a apontar para a mesma versão. Falta o Railway, que segue em `26.6`
— alinhá-lo é a task 4.1. Nenhum dos ambientes estava pinado em versão exata: `26.6` é tag móvel e
trocava o Keycloak a cada redeploy sem ninguém pedir, o mesmo drift que o `keycloak-config-cli` em
`:latest`.

## Decisão 1 — Um único Dockerfile alimenta os dois ambientes

`docker/Dockerfile.keycloak` deixa de ser órfão e passa a ser **a** definição da imagem do Keycloak:

- o `docker-compose.yml:59` troca `image:` por `build:` apontando para ele;
- o serviço do Railway troca `source.image` por `source.repo: llsilvas/menthoros-infra`, com o
  Dockerfile como builder.

**Por que não uma imagem própria num registry (GHCR).** Seria mais limpo — imagem imutável, versão
explícita, Railway seguindo em `image:`. Mas exige um pipeline de CI e credenciais de registry que
hoje **não existem** no `menthoros-infra` (o repo não tem workflow nenhum). Construir essa esteira
para entregar um CSS é ceremônia maior que o problema. Se um dia a imagem do Keycloak precisar de
promoção entre ambientes, essa é a evolução natural — e o Dockerfile único já é o pré-requisito
dela.

**Por que não volume montado.** Resolve o local em cinco minutos e não resolve o Railway. Dois
mecanismos para o mesmo artefato é como as duas realidades divergem.

**O que isso custa.** O Keycloak de dev passa a rebuildar a cada push no `menthoros-infra` — um repo
que hoje guarda docs e scripts. É preciso restringir o build ao que importa (`rootDirectory` ou
watch patterns), senão editar um `.md` redeploya o provedor de identidade do ambiente.

## Decisão 2 — Herdar de `keycloak.v2`, não de `keycloak`

`theme.properties` com **`parent=keycloak.v2`**, sobrescrevendo apenas CSS, imagens e mensagens.
Nenhum `.ftl` próprio. Cada template sobrescrito é superfície que quebra a cada upgrade do Keycloak,
e o ganho aqui é de aparência, não de estrutura.

**Corrigido em 2026-08-05 — a versão anterior deste documento dizia `parent=keycloak`, e estava
errada.** Verificado na imagem 26.7.0 e na tela real do HomeLab:

```
temas de login na imagem:  base, keycloak, keycloak.v2   (os três com parent=base)
tema servido de fato:      resources/<hash>/login/keycloak.v2/css/styles.css
```

Os dois convivem: `keycloak` é o tema legado (PatternFly v4) e `keycloak.v2` é o que o Keycloak
serve por padrão hoje (PatternFly v5, `styles=css/styles.css`). Herdar de `keycloak` não daria "o
tema padrão com outra cor" — daria **o layout antigo**, uma mudança estrutural que ninguém pediu,
disfarçada de escolha de paleta.

Consequência aceita: o layout é o do tema base. Se um dia o layout precisar mudar de verdade, a
conversa é Keycloakify (fora de escopo, ver `proposal.md`).

## Decisão 3 — PT-BR via `messages_pt_BR.properties`

Traduzir só as chaves das telas em escopo; o resto herda. **As mensagens de erro entram na primeira
leva** — são as que escapam da tradução e denunciam o remendo, e são justamente as que o usuário lê
quando algo dá errado.

## Armadilhas encontradas na investigação

Cada uma destas já custou uma premissa errada neste documento:

1. **O `startCommand` mora no serviço, não na imagem.** No Railway ele está fixado como
   `/opt/keycloak/bin/kc.sh start-dev`; no compose, como `command: start-dev`. Ambos **sobrevivem à
   troca de origem** e continuam sobrescrevendo o `CMD ["start"]` do nosso Dockerfile. Isso é
   conveniente (o comportamento não muda) e perigoso (é fácil "corrigir" o Dockerfile achando que
   ele manda, e nada acontecer).

2. ~~**A versão do Dockerfile passa a valer de verdade.**~~ **Neutralizado em 2026-08-05:**
   `Dockerfile.keycloak` e `docker-compose.yml` foram para `26.7.0`. O risco era real — o pin
   `26.2.5` era inerte só porque ninguém construía o arquivo, e viraria downgrade silencioso no
   instante em que os ambientes passassem a buildar dele. Continua valendo para o Railway, que ainda
   está em `26.6`: a task 4.1 não pode trocar a origem do serviço sem levar a versão junto.

3. **Não existe `KC_VERSION` no serviço do Railway.** A versão está embutida na tag da imagem. Ao
   trocar para build de repo, o controle de versão migra da configuração do serviço para o
   Dockerfile — que passa a ser o único lugar onde a versão do Keycloak é declarada.

4. **`sync-realm.sh` e deploy de imagem são planos separados.** Não há ordenação transacional entre
   eles, e a política `no-delete` protege clients, groups, roles e users — **não** atributos de
   realm. Um `loginTheme` apontando para tema inexistente derruba a tela de login. Daí o preflight
   obrigatório: o tema tem de constar na lista de temas do alvo **antes** do JSON ser aplicado.

## Ordem de execução (não é negociável)

Por ambiente, sempre:

```
1. versão alinhada  →  2. imagem com o tema no ar  →  3. preflight (tema listado)  →  4. loginTheme
```

Inverter 2 e 4 derruba o login. Como local e dev são deploys independentes, a sequência roda
**duas vezes**, inteira, e o local vai primeiro.

## Rollback

| Falha | Reversão |
|---|---|
| Tema feio, quebrado ou ilegível | Remover `loginTheme` do `menthoros-realm.json` e rodar o `sync-realm.sh`. Volta ao tema padrão sem tocar na imagem. É o rollback rápido e cobre quase tudo. |
| Imagem não sobe / Keycloak não inicia em dev | Voltar `source` do serviço para `image: quay.io/keycloak/keycloak:26.6`. As variáveis do serviço são preservadas na troca de origem — nenhuma delas depende do builder. |
| Realm apontando para tema inexistente (login caiu) | Mesmo rollback da primeira linha. Este é o cenário que o preflight existe para evitar. |

O primeiro procedimento vai no README do `menthoros-infra` (task 5.1): é a emergência da porta de
entrada do produto e precisa estar onde se procura sob pressão, não numa change arquivada.

## Fora de escopo, registrado para não se perder

Encontrado durante a investigação, não endereçado aqui:

- **`start-dev` no Keycloak de dev.** Modo de desenvolvimento num ambiente compartilhado — sem
  otimização de startup, com garantias relaxadas. Dívida real, anterior a esta change.
- **`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` no serviço.** São as variáveis do Keycloak antigo;
  a 26.x usa `KC_BOOTSTRAP_ADMIN_*`. Funcionam por compatibilidade, mas é pin numa ponte que um dia
  sai.
- **`keycloak-config-cli` em `:latest`** no `sync-realm.sh`. Pinar é task 2.5 desta change; o resto
  do drift operacional não é.

# Tasks — customize-keycloak-login-theme (S · **Full** · infra)

> Escopo: `menthoros-infra` (tema, `Dockerfile.keycloak`, `menthoros-realm.json`).
> **Zero diff em `apps/`** — nenhuma linha de aplicação muda; o app já redireciona ao Keycloak.
>
> Validação: o próprio login, exercitado no navegador. Não há suíte automatizada aqui.
>
> Estado reverificado em 2026-08-05: nenhum `*Theme` no `menthoros-realm.json`, `docker-compose.yml:59`
> ainda usando `image:`, `Dockerfile.keycloak` órfão em `26.2.5`, `keycloak-config-cli` em `:latest`.
>
> **Discovery encerrada em 2026-08-05.** Entrega por `build:` no compose (0.1), PT-BR dentro desta
> change (0.3), e o Keycloak de dev confirmado rodando imagem pública no Railway (0.4) — o que
> escalou a change para Full e produziu o `design.md` (0.5). Resta só a 0.2, que agora bloqueia a
> seção 4 de verdade.

## 0. Discovery

- [x] 0.1 **Definir COMO o tema chega ao container.** **Decidido em 2026-08-05: compose com `build:`**
      apontando para `docker/Dockerfile.keycloak`, que copia o tema para
      `/opt/keycloak/themes/menthoros`. Volume foi descartado por resolver só o ambiente local.
      A execução virou a task 2.1.
- [x] 0.2 **Pinar a versão exata do Keycloak — local/HomeLab.** Feito em 2026-08-05: `Dockerfile.keycloak`
      (era `26.2.5`) e `docker-compose.yml` (era a tag móvel `26.6`) agora em **`26.7.0`**, a mais
      recente. O HomeLab foi recriado nessa versão, com dump do banco antes; a migração de schema
      subiu os realms `master` e `menthoros` para 26.7.0 sem erro e a tela de login voltou em `200`.
      Nenhum ambiente estava pinado em versão exata — `26.6` flutuava entre patches a cada redeploy.
      **O Railway continua em `26.6`**; alinhá-lo faz parte da task 4.1.
- [x] 0.3 **Decidir Q1 (PT-BR).** **Decidido em 2026-08-05: traduz nesta change**, via
      `messages_pt_BR.properties`. Registrado no proposal como CA7. Execução na task 1.5.
- [x] 0.4 **Descobrir como o Keycloak de dev é construído no Railway (Q3).** **Respondido em
      2026-08-05 via Railway CLI/API:** o serviço `menthoros-keycloak` (projeto `robust-expression`,
      env `develop`) roda a **imagem pública** `quay.io/keycloak/keycloak:26.6` — `source.repo: null`,
      sem `rootDirectory`, sem `railwayConfigFile`, com `startCommand` fixado no serviço
      (`/opt/keycloak/bin/kc.sh start-dev`). **Não existe caminho para o tema chegar em dev**;
      entregá-lo exige trocar a origem do serviço. A change **escala para trilha Full**.
- [x] 0.5 **Escrever o `design.md`.** Feito em 2026-08-05. Decisão: **um único `Dockerfile.keycloak`
      alimenta os dois ambientes** — compose com `build:` e o serviço do Railway apontando para o repo
      `menthoros-infra`. GHCR foi descartado por exigir uma esteira de CI que o repo não tem.

## 1. Tema

- [x] 1.1 Criar `keycloak/themes/menthoros/login/theme.properties` com **`parent=keycloak.v2`**, declarando os
      CSS e recursos próprios. **Herdar, não substituir** — estrutura e acessibilidade vêm do base.
      ⚠️ **Não é `parent=keycloak`.** Verificado na 26.7.0: os dois temas coexistem, mas o servido por
      padrão é o `keycloak.v2` (PatternFly v5). Herdar do `keycloak` traria o **layout legado**, não
      o tema atual repaginado.
- [x] 1.2 CSS com os tokens de marca já definidos no produto: lime `#BDDE5A` (primária), off-white
      `#F8FAFC` (texto), superfícies navy e o fundo dark-first, de
      `apps/menthoros-front/src/shared/design-tokens`. **A tipografia NÃO está lá** — a família real é
      `"Syne", "Inter", …`, declarada no tema MUI em `apps/menthoros-front/src/App.tsx:71` (achado do
      passe adversarial). Não improvisar tons nem fontes próximas: é assim que duas identidades
      nascem.
- [x] 1.3 Logo e favicon.
      **Desvio do previsto, com motivo:** a task pedia `logo_menthoros.svg`, mas ele tem **683KB**
      (253KB após gzip) — peso demais para a porta de entrada do produto. Usado
      `logo_transparent.png` reduzido para 160px (**23KB**, com alpha). O `menthoros_navbar.png`,
      primeira escolha por ser o do shell, foi descartado: é RGB **sem canal alpha** e renderizava
      como um retângulo opaco colado sobre o fundo (visto no navegador).
      Favicon: `menthoros_favicon.png` a 64px embrulhado em `.ico`, que é o caminho de fallback do
      `template.ftl` do base — assim não foi preciso sobrescrever template nenhum.
- [x] 1.4 Verificar **contraste WCAG AA** do texto sobre o fundo, incluindo **a mensagem de erro**
      (CA3/CA6) — é o texto que mais some num tema escuro, e é justamente o que o usuário precisa ler
      quando erra a senha.
      *verify:* medição de contraste (par de cores + razão calculada + veredito AA) registrada **como
      comentário no topo do próprio CSS do tema** — fica junto do que ela mede e sobrevive ao
      arquivamento da change, ao contrário de uma nota aqui.
- [x] 1.5 **`messages/messages_pt_BR.properties`** com os textos das telas de login (CA7, decisão
      0.3): título, rótulos, botão de entrar e — sobretudo — **as mensagens de erro**, que são as que
      escapam da tradução e denunciam o remendo. Traduzir apenas as chaves que aparecem nas telas em
      escopo; o resto herda do `parent`.
      *verify:* tela de login e tela de credencial inválida sem nenhum texto em inglês.

## 2. Aplicação local

- [x] 2.1 **Trocar `image:` por `build:` no `docker-compose.yml:59`** (decisão 0.1), apontando para
      `docker/Dockerfile.keycloak`, e copiar o tema para `/opt/keycloak/themes/menthoros` no
      Dockerfile. Manter `command: start-dev` — o Dockerfile hoje define `CMD ["start"]`, que é modo
      de produção; o compose precisa continuar sobrescrevendo.
      *verify:* tema presente dentro do container em `/opt/keycloak/themes/menthoros`.
- [x] 2.2 Subir o Keycloak local com a imagem nova e confirmar que o tema **aparece na lista** de
      temas do realm antes de aplicá-lo.
      *verify:* tema selecionável no console de administração.
- [x] 2.3 **Preflight como guarda no `sync-realm.sh`, não como instrução.** O script aplica o JSON
      **cegamente**, e a política `no-delete` protege clients, groups, roles e users — **não**
      atributos de realm. Um sync contra alvo sem o tema derruba a tela de login (CA5).
      **Decidido em 2026-08-16 (DoR):** o preflight vira código — o script lê `loginTheme` do
      `menthoros-realm.json` e, se declarado, consulta os temas do alvo e **aborta** quando ausente.
      "Lembre de conferir" é fraco demais para a porta de autenticação, e o achado veio dos dois
      revisores do gate.
      *verify:* rodar contra um alvo sem o tema instalado sai com código ≠ 0 e **sem** ter aplicado o
      realm; rodar contra o alvo com o tema segue normalmente.
      ⚠️ Tem de estar pronta **antes** da 2.4 — é ela que protege o primeiro sync com `loginTheme`.
- [x] 2.4 Definir `loginTheme: menthoros` no `menthoros-realm.json` e aplicar com `sync-realm.sh`
      **contra o Keycloak local**. ⚠️ **Nesta ordem:** tema no container primeiro, `loginTheme`
      depois — e o inverso vale para **cada ambiente**, porque deploy de imagem e sync de realm são
      planos separados, sem ordenação transacional entre si.
      ⚠️ **Conferir o alvo antes de rodar.** O `sync-realm.sh` não pede confirmação: aplica em quem
      estiver no `.env.sync`, que hoje é o HomeLab (`http://192.168.15.24:8080`) — enquanto o
      `.env.sync.example` traz o **Railway de dev**. Rodar contra um alvo sem o tema instalado é
      exatamente o cenário do CA5.
- [x] 2.5 **Pinar o `keycloak-config-cli`** no `sync-realm.sh` (hoje `:latest`). É a ferramenta que
      aplica a configuração de autenticação; deixá-la flutuando é drift num caminho cuja falha
      bloqueia login.

## 3. Validação no navegador (P0 — não há teste automatizado aqui)

- [x] 3.1 Login completo pelo fluxo real: tela com a marca, autentica, volta ao destino correto
      (CA1/CA2). O fluxo tem de se comportar **exatamente** como antes — tema é aparência.
      *verify:* três evidências, não uma captura de tela — (a) `GET` da tela de login retorna `200` e
      o HTML referencia `resources/<hash>/login/menthoros/`, provando que é o CSS próprio e não cache;
      (b) o `redirect_uri` final é idêntico ao registrado antes da mudança; (c) sessão estabelecida
      (token emitido, app carrega autenticado).
- [x] 3.2 Credencial errada: mensagem de erro visível e legível, **e a resposta não é `500`** (CA3).
      Template quebrado costuma aparecer como erro de servidor, não como tela feia.
      *verify:* status HTTP da tela de erro registrado (`200`, não `5xx`) e o texto da mensagem em
      PT-BR (CA7) — a mensagem de erro é a que mais escapa da tradução.
- [x] 3.3 Viewport de celular: utilizável (CA4).
      *verificado* com Playwright no viewport do iPhone 13 (390×664): sem scroll horizontal, nenhum
      elemento vazando a largura. **Achado corrigido:** todos os alvos de toque vinham com 36px do
      PatternFly — passa no WCAG 2.2 AA (24px) e fica abaixo dos 44px de Apple HIG/AAA. Como o CA4 é
      justamente sobre entrar do telefone "à beira da pista", subiram para 44px no breakpoint móvel.
- [x] 3.4 Logout e novo login continuam funcionando.
      *verificado:* tela de logout responde `200`, com o tema aplicado e título "Saindo".
- [x] 3.5 Telas herdadas conferidas — todas com o tema aplicado, **nenhuma `500`** e sem texto em
      inglês: login (`200`), logout (`200`), atualização de perfil / `VERIFY_PROFILE` (`200`,
      "Atualizar Informações da Conta"), erro de client inválido (`400`, página renderizada).
      ⚠️ **Pendência honesta:** a tela de **recuperação de senha não pôde ser exercitada** — o realm
      não tem `resetPasswordAllowed`, então a rota devolve `400` (recurso desligado), não a tela.
      O mesmo vale para o cadastro.
      **Corrigido o encaminhamento em 2026-08-16:** a versão anterior desta nota dizia "quando
      `keycloak-user-onboarding-auth` ligar esses fluxos" — mas aquela change **declarou recuperação
      de conta fora de escopo** (`proposal.md:21`) e foi **arquivada em 2026-08-11**. O item estava
      órfão. Registrado no **Radar do `SPRINTS.md`** como item próprio (XS · Fast, só um atributo no
      realm). Quem o executar fecha esta pendência junto: as telas compartilham este CSS e ninguém
      as abre ao testar login.

## 3b. HomeLab — o ensaio do Railway (nova em 2026-08-16)

> **Por que existe.** O HomeLab (`192.168.15.24:8080`) não estava em lugar nenhum da change, embora
> seja **o alvo do `.env.sync`** — ou seja, o Keycloak que de fato recebe os syncs no dia a dia. A
> spec descrevia dois ambientes enquanto a operação acontecia num terceiro.
>
> Entra **antes** da seção 4 de propósito: é o ensaio mais próximo do Railway que existe — mesma
> imagem, mesmo Dockerfile, ambiente compartilhado de verdade — e sai quase de graça, porque já está
> em 26.7.0 e usa o `docker-compose.yml` deste repo.
>
> **Pré-requisito:** o PR das seções 1–3 mergeado em `main`. Antes disso o compose da máquina ainda
> tem `image:` e não constrói nada.

- [ ] 3b.0 **Conferir o nome do projeto compose ANTES de subir qualquer coisa.** Bloqueia a 3b.1.
      O Docker deriva o projeto do nome do **diretório** e o volume de `<projeto>_<volume>`. Se a
      stack do HomeLab foi subida de uma pasta com outro nome, rodar da pasta `menthoros-infra`
      monta um volume **vazio** e o Keycloak sobe sem o realm — sintoma idêntico a perda de dados.
      Aconteceu na máquina de dev em 2026-08-16 (armadilha 5 do `design.md`).
      ```bash
      docker inspect menthoros-db --format '{{index .Config.Labels "com.docker.compose.project"}}'
      docker volume ls | grep pg_data
      ```
      *verify:* saber o nome do projeto atual e qual volume tem os dados. Se o projeto **não** for
      `menthoros-infra`, todos os comandos da 3b.1 levam `-p <nome-atual>`.
- [ ] 3b.1 Na máquina do HomeLab: `git pull origin main` e `docker compose up -d --build keycloak`
      (com `-p <nome-atual>` se a 3b.0 apontou outro projeto).
      ⚠️ **`--build` não é opcional** — sem ele o compose reusa a imagem já existente com aquela tag
      e nada muda, sem erro nenhum.
      Só o serviço `keycloak` é recriado. O Keycloak usa `KC_DB: postgres` e o estado vive no volume
      `pg_data` — que só é o mesmo de antes se o projeto for o mesmo (por isso a 3b.0).
      *verify:* `docker exec menthoros-keycloak ls /opt/keycloak/themes/menthoros` lista os arquivos
      **e** o realm `menthoros` continua respondendo (`curl -s -o /dev/null -w '%{http_code}'
      http://192.168.15.24:8080/realms/menthoros` → `200`). O segundo não é zelo: é o que distingue
      "subiu com o tema" de "subiu limpo contra um banco vazio".
- [ ] 3b.2 Rodar `./keycloak/sync-realm.sh` da máquina de dev — o `.env.sync` já aponta para o
      HomeLab, então não passar nada. O preflight confirma o tema antes de aplicar.
      ⚠️ Não adianta passar `KEYCLOAK_URL=` na linha de comando: o `.env.sync` sobrescreve variáveis
      exportadas (issue `menthoros-infra#12`).
      *verify:* `>> Preflight OK` seguido de `>> Sincronização concluída.`
- [ ] 3b.3 Repetir a validação da seção 3 no HomeLab — login completo, credencial inválida, logout,
      celular. É ambiente compartilhado: é aqui que aparece o que a máquina do dev não reproduz.

## 4. Ambiente de dev (Railway) — só depois do HomeLab (3b) validado

> Serviço `menthoros-keycloak`, projeto `robust-expression` (`4f4f3290-…`), env `develop`
> (`76759ba8-…`). Este serviço autentica **todo** o ambiente de desenvolvimento: uma imagem que não
> sobe deixa backend e front sem login.
>
> **As seções 1–3 são mergeáveis sem esta.** Se a seção 4 travar, ela sai para change própria em vez
> de segurar o tema e a tradução (decisão registrada no proposal, Revisão de produto).
>
> **O que o ensaio do HomeLab (3b) NÃO cobre:** lá a origem do serviço já é o `docker-compose.yml`
> deste repo, então entregar o tema é um `--build`. Aqui a origem é **imagem pública**, e a 4.1 é
> troca de modelo de deploy — o ensaio valida a imagem e o tema, não o mecanismo de origem.

- [ ] 4.1 **Trocar a origem do serviço** de `image: quay.io/keycloak/keycloak:26.6` para o repo
      `llsilvas/menthoros-infra`, construindo por `docker/Dockerfile.keycloak`.
      ⚠️ A 0.2 (versão **`26.7.0`** no Dockerfile) tem de estar **feita e mergeada** antes: a partir
      daqui é o Dockerfile que define a versão do Keycloak, e um pin esquecido em `26.2.5` vira
      downgrade silencioso em dev. **O Railway sobe de `26.6` para `26.7.0` nesta task** — é a mesma
      versão já validada no HomeLab, e é o baseline que o rollback tem de restaurar.
      *verify:* deploy `SUCCESS` e Keycloak respondendo; tema presente em `/opt/keycloak/themes/menthoros`.
- [ ] 4.2 **Restringir o gatilho de build por watch patterns** ao que compõe a imagem
      (`docker/Dockerfile.keycloak`, `keycloak/themes/**`). Sem isso, editar um `.md` no
      `menthoros-infra` redeploya o provedor de identidade de dev.
      **Decidido em 2026-08-16 (DoR): watch patterns, não `rootDirectory`.** O `rootDirectory`
      estreitaria o **contexto de build** para uma subpasta, e o Dockerfile precisa copiar de
      `keycloak/themes/` — que ficaria fora dele. Watch pattern filtra o gatilho sem mexer no contexto.
      *verify:* commit que toca só `docs/` não dispara deploy.
- [ ] 4.3 Conferir que o `startCommand` do serviço (`/opt/keycloak/bin/kc.sh start-dev`) sobreviveu à
      troca de origem e continua sendo o comando efetivo — ele sobrescreve o `CMD` do Dockerfile.
- [ ] 4.4 Repetir o preflight da 2.3 **contra o Railway** e só então sincronizar o `loginTheme`
      (CA5). Deploy de imagem e sync de realm são planos separados.
- [ ] 4.5 Refazer a validação da seção 3 no fluxo real de dev — não basta ter passado no local.

## 5. Fechamento

- [x] 5.1 Registrar o **rollback** no README do `menthoros-infra`: remover `loginTheme` do realm e
      rodar o `sync-realm.sh` devolve o tema padrão. É o procedimento de emergência da porta de
      entrada do produto — precisa estar onde se procura sob pressão.
- [ ] 5.2 Registrar no `SPRINTS.md`.

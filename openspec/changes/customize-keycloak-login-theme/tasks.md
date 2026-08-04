# Tasks — customize-keycloak-login-theme (S · Fast · infra)

> Escopo: `menthoros-infra` (tema, `Dockerfile.keycloak`, `menthoros-realm.json`).
> **Zero diff em `apps/`** — nenhuma linha de aplicação muda; o app já redireciona ao Keycloak.
>
> Validação: o próprio login, exercitado no navegador. Não há suíte automatizada aqui.
>
> Estado verificado em 2026-08-04: nenhum tema configurado no realm.

## 0. Discovery (bloqueia o resto)

- [ ] 0.1 **Definir COMO o tema chega ao container — hoje não há caminho nenhum.** Verificado no
      passe adversarial: o `Dockerfile.keycloak` é **órfão**; o `docker-compose.yml:59` usa `image:`
      direto e nunca o constrói. Decidir entre: (a) compose com `build:` apontando para o Dockerfile;
      (b) volume montado; (c) provider/extensão. E confirmar **separadamente** como o Railway constrói
      o Keycloak de dev/produção — o mecanismo local pode não servir lá.
      *verify:* mecanismo escolhido, e evidência de que o tema aparece dentro do container
      (`/opt/keycloak/themes/menthoros`).
- [ ] 0.2 **Alinhar a versão do `Dockerfile.keycloak`** (`26.2.5`) com a que roda de fato (**26.6.0**,
      do `KC_VERSION` no compose). Temas herdam do tema base **daquela** versão; testar contra uma e
      servir sobre outra é um bug esperando acontecer.
      *verify:* Dockerfile e compose apontando a mesma versão; container sobe.
- [ ] 0.3 **Decidir Q1 (PT-BR).** O tema traduz as telas agora ou fica para depois? Hoje aparece
      "Sign in to menthoros" num produto inteiramente em português.
      *verify:* decisão registrada no proposal.

## 1. Tema

- [ ] 1.1 Criar `themes/menthoros/login/theme.properties` com `parent=keycloak`, declarando os CSS e
      recursos próprios. **Herdar, não substituir** — estrutura e acessibilidade vêm do base.
- [ ] 1.2 CSS com os tokens de marca já definidos no produto: lime `#BDDE5A` (primária), off-white
      `#F8FAFC` (texto), superfícies navy e o fundo dark-first, de
      `apps/menthoros-front/src/shared/design-tokens`. **A tipografia NÃO está lá** — a família real é
      `"Syne", "Inter", …`, declarada no tema MUI em `apps/menthoros-front/src/App.tsx:71` (achado do
      passe adversarial). Não improvisar tons nem fontes próximas: é assim que duas identidades
      nascem.
- [ ] 1.3 Logo: `logo_menthoros.svg` (existe em `apps/menthoros-front/src/assets/icons/`) e favicon.
- [ ] 1.4 Verificar **contraste WCAG AA** do texto sobre o fundo, incluindo **a mensagem de erro**
      (CA3/CA6) — é o texto que mais some num tema escuro, e é justamente o que o usuário precisa ler
      quando erra a senha.
      *verify:* medição de contraste registrada, no espírito do `contrastMatrix.test.ts` do front.

## 2. Aplicação

- [ ] 2.1 Copiar o tema para a imagem no `Dockerfile.keycloak` (`/opt/keycloak/themes/menthoros`).
- [ ] 2.2 Subir o Keycloak local com a imagem nova e confirmar que o tema **aparece na lista** de
      temas do realm antes de aplicá-lo.
      *verify:* tema selecionável no console de administração.
- [ ] 2.3 **Preflight antes de qualquer sync com `loginTheme`:** confirmar que `menthoros` consta na
      lista de temas do alvo. O `sync-realm.sh` aplica o JSON **cegamente**, e a política `no-delete`
      protege clients, groups, roles e users — **não** atributos de realm. Sem o preflight, um sync
      contra alvo sem o tema derruba a tela de login (CA5).
      *verify:* tema listado no alvo; só então o JSON com `loginTheme` é aplicado.
- [ ] 2.4 Definir `loginTheme: menthoros` no `menthoros-realm.json` e aplicar com `sync-realm.sh`.
      ⚠️ **Nesta ordem:** tema no container primeiro, `loginTheme` depois — e o inverso vale para
      **cada ambiente**, porque deploy de imagem e sync de realm são planos separados, sem ordenação
      transacional entre si.
- [ ] 2.5 **Pinar o `keycloak-config-cli`** no `sync-realm.sh` (hoje `:latest`). É a ferramenta que
      aplica a configuração de autenticação; deixá-la flutuando é drift num caminho cuja falha
      bloqueia login.

## 3. Validação no navegador (P0 — não há teste automatizado aqui)

- [ ] 3.1 Login completo pelo fluxo real: tela com a marca, autentica, volta ao destino correto
      (CA1/CA2). O fluxo tem de se comportar **exatamente** como antes — tema é aparência.
- [ ] 3.2 Credencial errada: mensagem de erro visível e legível, **e a resposta não é `500`** (CA3).
      Template quebrado costuma aparecer como erro de servidor, não como tela feia.
- [ ] 3.3 Viewport de celular: utilizável (CA4).
- [ ] 3.4 Logout e novo login continuam funcionando.
- [ ] 3.5 Conferir que as telas herdadas não ficaram quebradas — em especial a de **recuperação de
      senha**, que compartilha o CSS e ninguém costuma abrir ao testar login. Confirmar que responde
      a tela, não `500`.

## 4. Fechamento

- [ ] 4.1 Registrar o **rollback** no README do `menthoros-infra`: remover `loginTheme` do realm e
      rodar o `sync-realm.sh` devolve o tema padrão. É o procedimento de emergência da porta de
      entrada do produto — precisa estar onde se procura sob pressão.
- [ ] 4.2 Registrar no `SPRINTS.md`.

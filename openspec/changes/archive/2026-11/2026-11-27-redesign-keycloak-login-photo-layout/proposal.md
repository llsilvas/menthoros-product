**Tamanho:** S · **Trilha:** Fast

> Fast porque é só CSS e um asset de imagem no tema de login (`menthoros-infra/keycloak/themes/menthoros`),
> sem `.ftl` próprio, sem mudança no realm, sem contrato de API. Um repo só.

**Status:** proposta (2026-11-21, `/change`)
**Criado:** 2026-11-21

## Por que

Com `fix-login-direct-keycloak-redirect`, a tela do Keycloak passa a ser a **única** tela de login que
o treinador vê. Hoje ela é um card centralizado sobre um gradiente: correta, mas genérica. O founder
prototipou um layout com foto em tela cheia (treinador ao amanhecer, atleta ao fundo) e card de vidro
à esquerda — protótipo no artboard "Login Keycloak — Menthoros".

Junto, um defeito conhecido: campos preenchidos pelo autofill do navegador ficam com **fundo claro e
letra clara**. O tema deixa o `<input>` transparente com texto `#F8FAFC` e não tem regra de autofill
nem `color-scheme`; o navegador pinta o fundo dele por cima.

## O que muda

- **Fundo:** foto em tela cheia (`img/login-bg.webp`), ancorada à direita, com degradê navy à esquerda
  para garantir contraste sob o formulário. Reverte a decisão "gradiente, não imagem" do tema atual
  — custo aceito: um asset de ~96 KB na porta de entrada.
- **Card:** alinhado à esquerda em telas largas, vidro navy (72% + blur), borda branca a 15%.
- **Tipografia e bordas alinhadas ao app logado:** Inter em tudo (títulos em peso 800), raio 8px,
  campos com borda branca a 15%. A Syne sai do tema (e o arquivo de fonte dela).
- **Subtítulo** "A IA propõe. O treinador decide." sob o título do login.
- **Autofill:** `color-scheme: dark` + regra `:-webkit-autofill`/`:autofill` mantendo fundo escuro e
  texto claro.
- **Celular:** sem foto de fundo atrás do formulário (card ocupa a tela, canvas navy).

## Fora de escopo

- **Logo.** Fica como está hoje no tema; a posição/arte final será decidida depois (founder).
- Ícones dentro dos campos (exigiria `.ftl` próprio ou hack frágil de `background-image`).
- Templates FreeMarker próprios, `accountTheme`, `emailTheme`.
- Mudança no `menthoros-realm.json`.

## Critérios de aceite

- **CA1** — GIVEN viewport ≥ 992px, WHEN a tela de login abre, THEN a foto cobre a tela, o card fica à
  esquerda e o rosto do treinador não é coberto.
- **CA2** — GIVEN o card sobre a foto, THEN título, rótulos e link medem ≥ 4.5:1 contra o fundo
  efetivo (card de vidro sobre degradê).
- **CA3** — GIVEN um campo preenchido por autofill, THEN o fundo continua escuro e o texto legível
  (≥ 4.5:1).
- **CA4** — GIVEN viewport ≤ 576px, THEN o formulário é utilizável sem rolagem horizontal e os alvos
  de toque mantêm 44px.
- **CA5** — GIVEN erro de credencial, THEN a mensagem continua legível (regra existente preservada).
- **CA6** — nenhum `.ftl` próprio; `theme.properties` inalterado.

## Métrica de sucesso

- Qualitativa: a tela de entrada é reconhecível como Menthoros (foto + voz da marca) em vez de um card
  genérico. Sem métrica numérica — não há instrumentação na tela do IdP.
- Zero ocorrência de campo ilegível por autofill (hoje: reproduzível com senha salva).

## Open Questions & Assumptions

- **Aberto (founder):** arte e posição final do logo.
- **Assumido:** a causa do campo branco é autofill. Não foi reproduzida antes da change; a verificação
  local com senha salva confirma ou derruba.
- **Assumido:** a foto é de uso liberado (gerada/licenciada pelo founder). O arquivo recebido tem
  1672×941; em monitor mais largo ela amplia. Trocar por uma exportação maior é só substituir o asset.

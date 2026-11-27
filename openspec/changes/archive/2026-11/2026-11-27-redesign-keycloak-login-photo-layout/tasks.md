# Tasks — redesign-keycloak-login-photo-layout

Repo: `menthoros-infra`. Branch: `feat/redesign-keycloak-login-photo-layout`, em worktree.
Validação: subir `quay.io/keycloak/keycloak:26.7.0` local com o tema montado e conferir no navegador
(desktop 1440 e celular 375).

## 1. Layout

- [x] 1.1 Adicionar `resources/img/login-bg.webp`.
- [x] 1.2 `menthoros.css`: foto em tela cheia + degradê; card de vidro à esquerda em ≥ 992px;
      celular sem foto (CA1, CA4).
- [x] 1.3 Inter em tudo, raio 8px, bordas brancas a 15%; remover Syne (CSS e arquivo de fonte).
- [x] 1.4 Subtítulo "A IA propõe. O treinador decide." (`messages_pt_BR.properties` ou CSS).

## 2. Autofill

- [x] 2.1 `color-scheme: dark` + regra de autofill (CA3).

## 3. Verificação

- [ ] 3.1 **Adiada (2026-11-27, arquivamento):** Keycloak local com o tema: login, erro de credencial, celular (CA1–CA5).
      Feito em 11-21 no realm `master`, PT-BR, em 1440 e 375, Chromium e WebKit (Playwright):
      layout, erro de credencial, sem rolagem horizontal, alvos de 44px, autofill por simulacao
      (fundo claro forcado + declaracoes da regra). **Pendente:** autofill real com senha salva
      (CA3), Firefox (o do Playwright nao sobe nesta maquina) e o realm `menthoros`.

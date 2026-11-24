**Tamanho:** S · **Trilha:** Fast

> Fast porque é uma correção de fluxo só no front (`apps/menthoros-front`), sem contrato de API, sem
> schema e sem mudança no realm do Keycloak. O mecanismo de login (Authorization Code + PKCE) não muda;
> muda só quem dispara o redirect.

**Status:** proposta (2026-11-21, `/change`)
**Criado:** 2026-11-21

## Por que

Clicar em "Entrar" na landing leva a `/#/auth/login`, uma tela do próprio app que só tem um botão
"Entrar" — e é esse segundo clique que redireciona ao Keycloak. Desde a migração para PKCE a tela não
coleta mais nada: é um passo morto. O mesmo vale para quem abre uma rota protegida sem sessão
(`ProtectedRoute` manda para a mesma tela).

Há ainda uma perda de destino no carregamento direto de rota protegida: quando o Keycloak recusa a
restauração silenciosa (`login_required`), o `AuthProvider` manda para `#/auth/login` **sem** a rota
de origem, então depois do login o usuário cai na home da role, não na rota que abriu.

## O que muda

- `LoginPage` (`/#/auth/login`) deixa de ser uma tela com botão e vira **rota de trânsito**: ao montar
  sem sessão, dispara `login(destino)` sozinha e mostra só o indicador de carregamento.
- A rota **continua existindo**, porque três coisas dependem dela:
  1. **Destino por role** — sem rota de origem, o login volta para `/#/auth/login`, que redireciona
     ATLETA / TECNICO / demais para a home certa.
  2. **Fallback manual** — o card com o botão "Entrar" continua aparecendo quando o redirect não pode
     ou não deve ser automático: falha ao iniciar o fluxo (mensagem de erro), navegador offline (PWA —
     o redirect terminaria na página de erro do navegador) e retorno sem sessão logo após uma
     tentativa automática (botão voltar na tela do Keycloak, ou login que não fechou). Este último
     evita laço de redirect app ↔ Keycloak.
  3. **Links existentes** — landing, `CadastroPage` e o guard continuam apontando para `ROUTES.LOGIN`;
     todos passam a ir direto ao Keycloak sem mudar um por um.
- Recusa da restauração silenciosa em rota protegida: o `AuthProvider` volta para a **rota de origem**
  (o guard a leva ao login com o destino), em vez de `#/auth/login` sem destino.

## Fora de escopo

- Trocar hash router por browser router.
- Fluxo `/cadastro?convite=` e o botão "Ir para o login" do cadastro (já chama `login()` direto).
- Logout e renovação silenciosa.
- Tema/tela de login do Keycloak.

## Critérios de aceite

- **CA1** — GIVEN usuário sem sessão em `/#/auth/login` (vindo do "Entrar" da landing), WHEN a página
  monta, THEN `login()` é chamado uma vez, sem clique, e o botão "Entrar" não é exibido.
- **CA2** — GIVEN o guard interrompeu `/coach/inbox`, WHEN a página de login monta, THEN `login` é
  chamado com `#/coach/inbox`.
- **CA3** — GIVEN rota protegida aberta por URL sem sessão no provedor, WHEN a restauração silenciosa
  é recusada, THEN o navegador vai ao endpoint de autorização **sem** `prompt=none`, e após o login o
  usuário termina na rota que abriu (E2E).
- **CA4** — GIVEN `login()` rejeita, THEN a tela mostra o erro e o botão "Entrar" para tentar de novo.
- **CA5** — GIVEN `navigator.onLine === false`, THEN não há redirect automático; o botão aparece.
- **CA6** — GIVEN o usuário volta ao `/#/auth/login` sem sessão logo após um redirect automático,
  THEN não há novo redirect automático (sem laço); o botão aparece. Um login concluído limpa a marca.
- **CA7** — GIVEN sessão válida em `/#/auth/login`, THEN segue o destino por role (inalterado).
- **CA8** — `bun lint`, `bun run build`, `bun test:run` e o E2E de autenticação passam.

## Métrica de sucesso

- Cliques entre "Entrar" e a tela de credenciais do Keycloak: de 2 para 1. Para o treinador, um passo
  a menos em toda sessão nova (o token não é persistido, então isso acontece a cada sessão expirada).

## Open Questions & Assumptions

- **Assumido:** manter a rota `/#/auth/login` como trânsito atende "eliminar a tela intermediária" — o
  usuário vê só um spinner breve antes do Keycloak. Remover a rota exigiria mover destino por role e
  fallback de erro/offline para outro lugar, sem ganho visível.
- **Assumido:** no carregamento direto de rota protegida continuam sendo dois saltos ao Keycloak
  (`prompt=none` recusado, depois o interativo). Fundir em um só mexe no bootstrap e fica fora.
- **Aberto:** botão voltar com bfcache pode restaurar a página no estado "redirecionando" — já era
  assim com o botão desabilitado; não tratado aqui.

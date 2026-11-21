# Tasks — fix-login-direct-keycloak-redirect

Repo: `apps/menthoros-front`. Validação: `bun lint && bun run build && bun test:run`; bloco final também
`bun test:e2e` (auth). Branch: `fix/fix-login-direct-keycloak-redirect`, em worktree.

## 1. Redirect automático na LoginPage

- [x] 1.1 Testes (`LoginPage.test.tsx`): login automático ao montar (CA1), destino do guard (CA2),
      erro mostra botão (CA4), offline não redireciona (CA5), marca de tentativa evita laço (CA6);
      destino por role mantido (CA7). Verify: vermelho antes.
- [x] 1.2 `LoginPage` dispara `login(destino)` ao montar; card com botão vira fallback (erro, offline,
      retorno sem sessão). Marca de tentativa em `sessionStorage`, limpa no login concluído.
      Verify: `bun test:run`.

## 2. Destino preservado na recusa silenciosa

- [x] 2.1 `AuthProvider`: recusa de `prompt=none` volta para a rota de origem (o guard leva ao login
      com o destino), não para `#/auth/login`. Verify: `bun test:run`.

## 3. E2E e validação

- [x] 3.1 `tests/e2e/auth/login.spec.ts`: rota protegida sem sessão vai ao endpoint de autorização sem
      `prompt=none` e volta na rota aberta (CA3); ajustar specs que paravam na tela com botão.
- [x] 3.2 `bun lint && bun run build && bun test:run` + E2E de autenticação/PWA (CA8).

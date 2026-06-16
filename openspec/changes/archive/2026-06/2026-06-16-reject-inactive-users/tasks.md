# Tasks: reject-inactive-users

## 1. Decisão

- [x] 1.1 Decidido: `423 Locked` + corpo genérico `{"error":"Usuário inativo"}`. Documentado no
  proposal.

## 2. Rejeição na cadeia de segurança

- [x] 2.1 No `JwtTenantFilter` (após `usuarioSyncService.syncUsuarioFromJwt`), resolver o `Usuario` e
  rejeitar quando `ativo == false`, escrevendo a resposta de erro padronizada.
- [x] 2.2 Garantir que `public-paths`, `strava-paths` e a isenção `/api/admin/**` não passam por essa
  verificação (não regressar rotas públicas).
- [x] 2.3 N/A — a rejeição é escrita direto no filtro (antes do dispatcher); não há exceção de domínio a mapear no `GlobalExceptionHandler`.

## 3. Testes

- [x] 3.1 Teste do filtro: usuário `ativo=false` → status decidido; usuário `ativo=true` → segue o
  fluxo; rota pública não é afetada.
- [x] 3.2 `./mvnw clean test` — verde. (675 testes, 0 falhas/erros após fixes do QA.)

## 4. Pós-QA

- [x] 4.1 (crítico) Fail-safe na falha de sync: leitura direta de `ativo` (`findByKeycloakId`);
  inativo→423, ativo→prossegue, leitura falha→503. Testes `SyncFalha` (fallbackInativo/Ativo,
  naoVerificavel).
- [x] 4.2 Corpo de erro com `charset=UTF-8` (helper `writeJsonError` unifica as 4 respostas de erro
  do filtro — corrige acento corrompido).
- [x] 4.3 Reforço de testes: `TenantContext` limpo após rejeição, `setContentType` assertado,
  `never setStatus(anyInt())` no caminho feliz.

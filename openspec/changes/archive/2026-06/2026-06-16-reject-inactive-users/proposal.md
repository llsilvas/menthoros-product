**Tamanho:** S · **Trilha:** Fast

# Proposal: reject-inactive-users

## Status

Proposed

## Why

A entidade `Usuario` tem o flag local `ativo` (controle local, "pode ser diferente do Keycloak").
Hoje nenhum ponto do fluxo de requisição rejeita um usuário com `ativo = false`: qualquer endpoint
autenticado serve normalmente um usuário desativado localmente enquanto o JWT do Keycloak continuar
válido. Gap descoberto no QA de `add-current-user-endpoint` (achado I5) — e é o **bloqueante de ship**
daquela change, pois afeta também o `GET /me`.

É um gap cross-cutting (todos os endpoints autenticados), não específico de um controller — por isso
o fix correto é na cadeia de filtro de segurança, não em cada handler.

## What Changes

- Após a sincronização do `Usuario` no `JwtTenantFilter`, rejeitar a requisição quando
  `usuario.ativo == false`.
- **Decidido:** status `423 Locked` (conta autenticada porém bloqueada) com corpo genérico
  (`{"error":"Usuário inativo"}`) — sem vazar identificadores internos. O filtro escreve a resposta
  diretamente (mesmo padrão das rejeições de `tenant_id` já existentes); como filtros rodam antes do
  dispatcher, o `GlobalExceptionHandler` não intercepta — não há exceção de domínio a mapear.
- Garantir que rotas públicas (`public-paths`, `strava-paths`, `/api/admin/**` isento) não são
  afetadas: a checagem só ocorre dentro do bloco que exige JWT presente; requisições públicas sem
  autenticação não entram nesse caminho.
- **Fail-safe na falha de sync (decisão de QA):** o resultado do sync alimenta a decisão de acesso.
  Se o sync lançar exceção, o filtro faz uma leitura direta do status (`findByKeycloakId`) — se
  inativo, `423`; se ativo, prossegue; se nem a leitura direta for possível (ex.: banco fora),
  responde `503`. Não decide acesso "no escuro" (evita que inativo passe numa falha de sync).

## Impact

- **Bloqueia:** `add-current-user-endpoint` (#0) — ship só após esta change mergeada.
- **Arquivos de produção (trabalho futuro):** `JwtTenantFilter` (ou novo passo de validação),
  possível novo branch no `GlobalExceptionHandler`. Sem migração nova.
- **Comportamento:** usuários `ativo=false` deixam de acessar endpoints autenticados — mudança de
  comportamento intencional (segurança), sem breaking change de contrato.

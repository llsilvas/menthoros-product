# Tasks — fix-reconciliation-it-auth (S · Fast · backend · 11 tasks)

> Escopo: **só `src/test`**. Qualquer diff em `src/main` nesta change é sinal de que algo saiu do
> escopo — investigar antes de continuar.
>
> Validação: `./mvnw verify -Dit.test=ManualReconciliationControllerIT` (Docker no ar para
> Testcontainers; `POSTGRES_DB=localhost` para os testes de contexto). O Surefire **não** roda `*IT` —
> `./mvnw test` passar não diz nada aqui.
>
> **Anchors verificados em 2026-07-29** contra `develop` @ `e7ad39e`.

## 0. Ponto de partida

- [ ] 0.1 Branch `feature/fix-reconciliation-it-auth` a partir de `develop` atualizado
- [ ] 0.2 Congelar o estado atual: rodar `./mvnw verify -Dit.test=Task5p1ControllerIT` e registrar o
  resultado (esperado: **20 testes, 14 falhas**, todas `403`). É a linha de base contra a qual o
  sucesso é medido
  - verify: as 14 falhas são exatamente `shouldEnforceTenantHeaderRequirement`,
    `shouldFilterByMultipleStatuses`, `shouldFilterByStatusAmbiguo`, `shouldHandleWhenTenantHeaderMissing`,
    `shouldHaveAllRequiredFieldsInDto`, `shouldHaveScoreBreakdownFields`, `shouldRespectPaginationParameters`,
    `shouldReturn400ForInvalidStatus`, `shouldReturn400ForNonPendingStatus`,
    `shouldReturn400WhenVincularWithoutTreinoPlanejadoId`, `shouldReturnEmptyListWhenNoMatches`,
    `shouldReturnOkWithCandidatesList`, `shouldReturnOkWithPaginatedPendingActivities`,
    `shouldReturnStructuredErrorResponse`. Os 2 verdes são os de 401 (sem `@WithMockUser`)

## 1. Mecanismo de autenticação

- [ ] 1.1 Adicionar o helper `jwtDe(UUID subject, UUID tenantId, String papel)` à classe, **replicando**
  `OnboardingSensitiveDataAccessIT:277-281` — `jwt().authorities(new SimpleGrantedAuthority("ROLE_" + papel))
  .jwt(j -> j.subject(subject.toString()).claim("tenant_id", tenantId.toString()))`
  - ⚠️ **O subject tem de ser um UUID.** `UsuarioSyncServiceImpl.createNewUsuario` faz
    `UUID.fromString(keycloakId)`. Com subject não-UUID o teste **passa por acidente**: cai no branch
    `syncFalhou` do `JwtTenantFilter` (`:97-105`), que tem fail-safe, e fica verde exercitando um
    caminho degradado — [CA5]
  - ⚠️ As authorities vão **explícitas**: o post-processor `jwt()` não usa o
    `JwtAuthenticationConverter` da app (`CoreSecurityConfig:61`); o default dele mapeia scopes para
    `SCOPE_*`, não `ROLE_*`
- [ ] 1.2 No `setUp`, semear a linha de `Usuario` correspondente ao subject (padrão de
  `OnboardingSensitiveDataAccessIT`), para que o sync siga o caminho de sucesso — [CA5]
  - verify: um teste qualquer da classe passa **sem** que o log emita "Erro ao sincronizar usuário do
    Keycloak"
- [ ] 1.3 Substituir `@WithMockUser` por `.with(jwtDe(...))` nas 17 requests autenticadas, e **remover o
  `.header("X-Tenant-ID", tenantId)`** de todas — a produção não lê esse header
  - verify: `grep -c "WithMockUser\|X-Tenant-ID"` no arquivo ⇒ **0**
- [ ] 1.4 `./mvnw verify -Dit.test=Task5p1ControllerIT` — [CA1]
  - ⚠️ **Aqui é onde o "em aberto" do proposal se resolve.** Se sobrar falha, decidir caso a caso:
    divergência real de contrato é **achado de produção** e vira decisão explícita (corrigir asserção
    ou abrir bug). **Não ajustar asserção só para ficar verde** — registrar o motivo de cada ajuste

## 2. Contratos que faltavam

- [ ] 2.1 Reescrever `shouldEnforceTenantHeaderRequirement` e `shouldHandleWhenTenantHeaderMissing`:
  saem os 400 por falta de `X-Tenant-ID` (contrato que não existe), entra **JWT sem `tenant_id` e sem
  `organization` ⇒ 403** — [CA4]
  - verify: a resposta é 403 e a mensagem indica ausência de tenant; nomes dos testes passam a
    descrever o comportamento real
- [ ] 2.2 Adicionar o caso de **403 por role sem permissão** — autenticado com `ROLE_ATLETA` num
  endpoint que exige `TECNICO`/`ADMIN` — [CA2]
  - ⚠️ Este teste tem de falhar se o `@PreAuthorize` for removido. Conferir rodando com a anotação
    comentada: se continuar verde, ele não está provando nada
- [ ] 2.3 Confirmar que os 2 testes de **401 sem autenticação** seguem verdes e intocados — [CA3]
- [ ] 2.4 `./mvnw verify -Dit.test=Task5p1ControllerIT`

## 3. Rename e fechamento

- [ ] 3.1 Renomear a classe e o arquivo para `ManualReconciliationControllerIT`, e atualizar o javadoc
  do topo — hoje ele descreve "Task 5.1" e afirma validar 3 endpoints
  - verify: `grep -rn "Task5p1" src/` ⇒ **0 ocorrências**
- [ ] 3.2 **Guardrail de escopo:** `git diff --stat develop -- src/main` ⇒ **vazio**
- [ ] 3.3 `./mvnw verify -Dit.test=ManualReconciliationControllerIT` verde integralmente, com contagem
  ≥ 21 testes (os 20 originais + o caso de 403) — [CA6]
  - verify: registrar a contagem final e comparar com a linha de base da task 0.2

## Fora de escopo — abrir como change própria

- **Habilitar CI no `menthoros-backend`.** É a correção estrutural: sem ela, o próximo `*IT` apodrece
  do mesmo jeito, porque `verify` não roda em lugar nenhum automaticamente. Esta change só torna isso
  *possível*, deixando `verify` verde no escopo de reconciliação.
- Migrar outros `*ControllerTest` do slice `@WebMvcTest` para o padrão de JWT. Nenhum deles está
  vermelho hoje; mexer neles não é necessário para fechar este bug.
- Extrair `jwtDe(...)` para uma classe utilitária compartilhada. Com dois chamadores é infra prematura;
  promover quando surgir o terceiro.
- O bug pré-existente de `zerarMetaDadosSemHistorico` e qualquer outro achado de produção que apareça
  na task 1.4 — abrir bug separado, não corrigir aqui.

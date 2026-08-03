# Tasks: fix-tenant-validation-not-found

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify` — verde em `develop`, então qualquer vermelho é desta
  change.

Branch: `fix/tenant-validation-not-found` (já criada a partir de `develop`).

---

## 0. Gate de DoR — verificar a premissa antes de desenhar em cima dela

A change anterior custou duas revisões e um pre-mortem por uma premissa não verificada. Este bloco
existe para não repetir.

- [ ] 0.1 Varrer o front por tratamento de **403** que mude comportamento de tela (redirect, logout,
      toast específico). `src/api/core/request.ts` e os hooks são o ponto de partida.
- [ ] 0.2 Se houver tratamento especial, **parar e reavaliar o escopo** — a change vira dois repos e
      a classificação muda. Se não houver, registrar isso no proposal e seguir.
- [ ] 0.3 Listar quais entidades NÃO são cobertas pelos 6 repositórios do
      `TenantValidationRepository` (pre-mortem #3) e registrar no design.
- **Validação:** premissa 3 do proposal respondida por escrito.

## 1. Distinguir os dois casos no repositório

- [ ] 1.1 Teste primeiro: `resourceExistsInAnyTenant` acha um id em cada uma das 6 entidades
      cobertas (Atleta, TreinoPlanejado, TreinoRealizado, PlanoSemanal, Prova, SugestaoCoach).
- [ ] 1.2 Teste primeiro: id órfão → `false`; id nulo → `false` sem NPE.
- [ ] 1.3 Implementar `resourceExistsInAnyTenant(UUID)` em `TenantValidationRepository`, espelhando
      a varredura existente sem o predicado de tenant.
- **Validação:** `./mvnw clean test`

## 2. Aspect — o comportamento que motivou a change

- [ ] 2.1 Teste primeiro (CA1) — **o teste central**: recurso inexistente resulta em 404 **e
      nenhuma** linha `SECURITY_VIOLATION` é emitida. Capturar log com `ListAppender`.
- [ ] 2.2 Teste primeiro (CA2): recurso de outro tenant resulta em 404 **e** uma linha
      `WARN SECURITY_VIOLATION` com tenant, resourceId e método.
- [ ] 2.3 Teste primeiro (CA3): as duas respostas são indistinguíveis — mesmo status e mesma
      mensagem, sem revelar o motivo.
- [ ] 2.4 Teste primeiro (CA4/CA5): recurso do tenant atual prossegue, e
      `resourceExistsInAnyTenant` **não** é invocado (`verify(..., never())`).
- [ ] 2.5 Implementar a distinção em `TenantValidationAspect`, lançando `DomainNotFoundException`
      com mensagem neutra.
- [ ] 2.6 Conferir que o `GlobalExceptionHandler` já mapeia essa exceção para 404; só acrescentar
      handler se não mapear.
- **Validação:** `./mvnw clean test`

## 3. Contrato dos 29 controllers

- [ ] 3.1 Teste primeiro (CA6): varrer o OpenAPI gerado e falhar se algum endpoint cujo handler tem
      `@RequireTenant` ainda documentar 403 com semântica de tenant. **Escrever antes de reanotar** —
      é o teste que torna a varredura manual verificável.
- [ ] 3.2 Reanotar os `@ApiResponses` dos 29 controllers. **Ler cada um:** endpoints que documentam
      403 por **papel** (`@PreAuthorize`) mantêm o 403 — a troca é só do 403 de tenant (pre-mortem #2).
- **Validação:** `./mvnw clean test` com o teste 3.1 verde.

## 4. Testes existentes de cross-tenant

- [ ] 4.1 Atualizar as asserções de 403 → 404 nos 5 arquivos de teste que cobrem cross-tenant
      (~20 asserções; nem todas são de tenant — ler cada uma).
- [ ] 4.2 Confirmar que nenhuma asserção de 403 **por papel** foi trocada por engano.
- **Validação:** `./mvnw clean test`

## 5. Fechamento

- [ ] 5.1 `./mvnw clean verify` sem nenhuma falha.
- [ ] 5.2 Regerar o cliente do front a partir do OpenAPI (o status documentado mudou) e confirmar
      que o diff é só de documentação, sem mudança de lógica.
- [ ] 5.3 `/qa` — `code-reviewer` + `security-reviewer` (a change mexe em guarda de multi-tenancy,
      então a revisão de segurança não é opcional).
- [ ] 5.4 PR para `develop`, sem merge local.
- **Validação:** CI verde.

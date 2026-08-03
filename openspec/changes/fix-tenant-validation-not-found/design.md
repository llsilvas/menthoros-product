# Design: fix-tenant-validation-not-found

O "porquê" e o escopo estão em `proposal.md`. Aqui só as decisões.

## Como está hoje

```java
// TenantValidationAspect:82-99
boolean belongsToTenant = tenantValidationRepository.resourceBelongsToTenant(resourceId, currentTenant);

if (!belongsToTenant) {
    if (annotation.logDeniedAccess()) {
        log.warn("SECURITY_VIOLATION: Tentativa de acesso cross-tenant | tenant={} | resourceId={} ...");
    }
    throw new AccessDeniedException("Acesso negado: recurso não pertence ao tenant atual");
}
```

Um único booleano carrega duas informações diferentes, e o código assume a pior das duas. O
`TenantValidationRepository` está correto — o defeito é de interpretação, não de consulta.

---

## D1 — Separar "não existe" de "é de outro tenant"

**Decisão:** um segundo método no repositório, chamado **apenas quando a validação já falhou**.

```java
public boolean resourceExistsInAnyTenant(UUID resourceId) { ... }
```

Mesma varredura de `resourceBelongsToTenant`, sem o predicado de tenant. Precisa de um
`existsById`/`findById` por repositório — os seis já injetados.

**Por que não retornar um enum de três estados** (`PERTENCE`, `OUTRO_TENANT`, `INEXISTENTE`) direto
de `resourceBelongsToTenant`: isso faria o caminho **feliz** pagar a busca cross-tenant, que é
exatamente o caminho quente. Com dois métodos, quem autoriza paga o mínimo e quem é negado paga o
extra — e negação é rara por definição (CA5).

**Custo aceito:** no caminho negado são até 2N queries (N do primeiro método + N do segundo).
Negação é rara, e a alternativa (uma query com `UNION ALL`) só se paga se isso virar problema
medido — está registrado como Open Question #2, não como dívida silenciosa.

---

## D2 — 404 nos dois casos, distinção só no log

**Decisão do founder (2026-08-02):** externamente, os dois casos são indistinguíveis.

| Situação | Status | Corpo | Log |
|---|---|---|---|
| Não existe | 404 | idêntico | `DEBUG` |
| Existe em outro tenant | 404 | idêntico | `WARN SECURITY_VIOLATION` |

**Por que não 403 no segundo caso:** um 403 confirmaria ao chamador que o id **existe em algum
lugar**. Com ids sequenciais isso seria enumeração óbvia; com UUID o vazamento é pequeno, mas é
gratuito de evitar e não custa nada em usabilidade — quem tem direito ao recurso nunca vê nenhum
dos dois.

**Consequência aceita e registrada:** depurar em produção passa a exigir o log. É deliberado.

**O que NÃO muda:** a linha `SECURITY_VIOLATION` continua igual em formato e campos. O que muda é
ela passar a ser verdadeira — hoje dispara para plano deletado, tela velha e id digitado errado.

---

## D3 — Qual exceção lançar

`AccessDeniedException` (Spring Security) sai; entra a exceção de domínio de "não encontrado" já
usada no projeto (`DomainNotFoundException`), que o `GlobalExceptionHandler` já mapeia para 404.

**Por que não um `ResponseStatusException(404)` cru:** o módulo tem a regra de que mapeamento
status↔exceção vive no `GlobalExceptionHandler`, não espalhado. Reusar a exceção de domínio mantém
isso e não acrescenta um `@ExceptionHandler` novo.

**Cuidado:** a mensagem não pode revelar o motivo. `"Recurso não encontrado"` — nunca
`"pertence a outro tenant"`, que anularia o D2 pelo corpo da resposta.

---

## D4 — Os 29 controllers

Cada `@ApiResponses` que documenta `403` com texto de tenant ("atleta de outro tenant", "recurso não
pertence ao tenant") vira `404`. Alguns endpoints mantêm 403 por **papel** (`@PreAuthorize`) — esses
não mudam. A distinção é textual e exige ler cada anotação; não dá para `sed`.

**Guarda contra desatenção (CA6):** teste que carrega o OpenAPI gerado, encontra todo endpoint cujo
handler tem `@RequireTenant`, e falha se algum ainda documentar 403 com semântica de tenant. Vale
mais que revisão visual de 29 arquivos, e continua valendo para o próximo controller que alguém
escrever.

---

## D5 — Testes

| Camada | Cobertura |
|---|---|
| `TenantValidationAspectTest` | inexistente → 404 **sem** `SECURITY_VIOLATION`; outro tenant → 404 **com**; do tenant → prossegue sem chamar `resourceExistsInAnyTenant` (CA5) |
| `TenantValidationRepositoryTest` | `resourceExistsInAnyTenant` acha em cada uma das 6 entidades e devolve false para id órfão |
| Auth tests existentes (5 arquivos) | asserções de 403 cross-tenant viram 404 |
| Contrato OpenAPI | CA6 |

Captura de log via `ListAppender` — padrão já usado em `IntervalsIcuClientImplTest`.

**O teste que mais importa é o de ausência:** que o caso inexistente **não** emite
`SECURITY_VIOLATION`. É o defeito que motivou a change, e o único que um teste de status sozinho não
pegaria.

---

## Pre-mortem

A rodar antes do `/implement init`. Hipóteses:

1. **Alguma tela do front trata 403 de forma especial** (redirect, logout) e o 404 muda o
   comportamento — premissa 3 do proposal, a confirmar **antes** de escrever código. É a mesma
   classe de erro que custou caro na change anterior: desenhar sobre premissa não verificada.
2. **Algum endpoint documenta 403 por papel E por tenant** na mesma anotação; trocar cegamente
   removeria a documentação do 403 legítimo de `@PreAuthorize`.
3. **`resourceExistsInAnyTenant` pode achar id de entidade não coberta** pelos 6 repositórios e
   concluir "não existe" quando existe. Nesse caso o comportamento é igual ao de hoje (404 em vez de
   403) — degrada bem, mas vale mapear quais entidades ficam de fora.

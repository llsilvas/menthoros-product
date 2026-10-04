# Design — planos-dialog-padrao-inbox

## Contexto

O dialog de planos do coach (`planosDialog.tsx`) lê `GET /api/v1/planos/{atletaId}` →
`PlanoServiceImpl.buscarPlanoPorAtleta`, que para TECNICO/ADMIN devolve **o primeiro** de
`findAtivosPorAtleta` (`status != CONCLUIDO`, `reviewStatus != REJEITADO`, `order by semanaInicio desc`).
Um objeto, nunca um concluído. Sem endpoint de histórico, as abas das semanas anteriores não têm fonte de dados.

## Decisão

**Endpoint novo de lista, carga única na abertura do dialog** (escolha do founder entre: endpoint só para
concluídos sob demanda · lista única · só front).

`GET /api/v1/planos/atletas/{atletaId}/semanas` — `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`:

1. `findAtivosPorAtleta(atletaId, tenantId)` — todos os em andamento (já existe, mesma regra do endpoint atual).
2. `findConcluidosPorAtleta(atletaId, tenantId, PageRequest.of(0, 4))` — **nova**: `status = CONCLUIDO`,
   `reviewStatus <> REJEITADO`, `order by semanaInicio desc`, limite pelo `Pageable`.
3. Concatena (em andamento primeiro) e monta cada DTO pelo mesmo caminho do endpoint atual
   (`montarOutputDto`: volume realizado, flag de análise) — extraído do `buscarPlanoPorAtleta`, sem mudar
   o comportamento dele.

Por que lista nova e não alterar `GET /{id}`: o `/{id}` serve a Home do atleta e outros fluxos do coach
esperando **um** plano; mudar o shape quebraria os consumidores. Por que limite na query: o dialog não
deve baixar (nem o backend montar DTOs de) um histórico que o usuário não vê.

Path `/atletas/{atletaId}/semanas` (dois segmentos) não colide com `GET /{id}` (um segmento).

## Alternativas descartadas

- **Endpoint só para concluídos, chamado sob demanda:** duas chamadas e estado de carga por aba;
  ganho pequeno com no máximo 4 DTOs extras.
- **Só front:** impossível — o dado não existe no contrato atual.

## Riscos e mitigações (pré-mortem manual)

| Risco | Mitigação |
|---|---|
| Custo: cada plano chama `calcularVolumeRealizadoKm` (1 query) + flag de análise (1 query) → até ~2×(N+4) queries | N em andamento é ~1; teto de 4 concluídos. Aceitável; se virar problema, agrupar numa query por janela. |
| Vazamento entre tenants | Todas as queries filtram `assessoria.id = :tenantId`; `TenantContext.getRequiredTenantId()`. |
| Atleta lê plano de outro | Endpoint restrito a TECNICO/ADMIN (o atleta não tem esse dialog). Teste de 403 previsto. |
| Quebrar `buscarPlanoPorAtleta` ao extrair `montarOutputDto` | Extração mecânica; os testes existentes de `BuscarPlanoPorAtleta` cobrem o caminho. |
| Cliente OpenAPI gerado fica defasado | Wrapper não gerado `PlanoSemanasService` no front; sai quando `generate:api` incluir o endpoint. |
| Limite "4" espalhado | Constante única `LIMITE_SEMANAS_CONCLUIDAS` no `PlanoServiceImpl`; critério de aceite 8 amarra o número. |

## Reviews da trilha Full

`product-reviewer` e pré-mortem cross-model (`/codex:adversarial-review`) **não foram executados** nesta
sessão — pendentes antes do merge. O pré-mortem acima é manual.

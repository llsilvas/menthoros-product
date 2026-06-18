# Proposal: fix-openapi-client-generation

**Tamanho:** L · **Trilha:** Full

## Status

Proposed

## Why

O `CLAUDE.md` do front manda consumir um **cliente gerado** por `npm run generate:api`
("nunca editar `src/api`", "tipos gerados são fonte-verdade"). A **realidade diverge**: o `src/api/`
commitado é **curado à mão** — 8 serviços com nomes limpos em inglês, tipos importados de `src/types/`,
sem `src/api/models/`. Rodar `generate:api` hoje é **destrutivo**: deriva nomes de serviço dos
`@Tag` PT-BR (com acento corrompido — "Análise de Treino" → `AnLiseDeTreinoService`, "Métricas" →
`MTricasService`), produz 19 serviços (1 por tag, ex.: 4 serviços Strava separados) e quebra ~13
arquivos de features que importam os serviços curados.

Isso bloqueia o fluxo documentado e foi descoberto no init de `wire-coach-shell-to-dashboards`
(que teve de criar o serviço do coach à mão). **Decisão (usuário):** restaurar o fluxo do `CLAUDE.md`
— tornar `generate:api` **determinístico e não-destrutivo** e adotar a saída gerada como fonte-verdade.

## What Changes

Toca **dois repos** (backend + front).

- **Backend** (`apps/menthoros-backend`): renomear o `@Tag(name=...)` dos 20 controllers para
  identificadores **ASCII estáveis** (sem acento/espaço) cujo PascalCase resulte em nomes de serviço
  limpos. Decidir consolidação de grupos (ex.: os 4 controllers Strava sob um `@Tag` único). Sem
  mudança de comportamento — apenas metadados de OpenAPI/Swagger.
- **Front** (`apps/menthoros-front`): rodar `generate:api`, adotando `src/api/services/*` +
  `src/api/models/*` gerados como fonte-verdade; migrar os ~13 import sites para os serviços/tipos
  gerados; remover de `src/types/` os tipos que duplicam o contrato (mantendo só domain/UI types).
- **Determinismo:** `generate:api` rodado duas vezes seguidas produz diff **vazio** (idempotente);
  documentar o passo (backend no ar em `:8099`).
- **Docs:** confirmar/ajustar a seção "API Client & Types Standards" do `CLAUDE.md` front para que
  descreva exatamente o resultado (nomes de serviço derivados dos tags ASCII, tipos em `src/api/models`).

## Critérios de aceite

- **CA1 — Geração determinística** — rodar `npm run generate:api` duas vezes consecutivas (backend no
  ar) deixa o working tree **sem diff** na 2ª rodada.
- **CA2 — Nomes limpos** — nenhum serviço gerado tem nome corrompido (sem `AnLise`, `MTricas`,
  `ProjeO`...); todo serviço casa com o `@Tag` ASCII correspondente.
- **CA3 — Sem hand-edit em `src/api`** — após a migração, `src/api/` é 100% saída do gerador; nenhum
  arquivo lá importa de `src/types/`.
- **CA4 — Front verde** — `npm run lint && npm run build && npm run test:run` passam; os ~13 import
  sites consomem os serviços/tipos gerados.
- **CA5 — Backend verde e sem mudança de contrato** — `./mvnw clean test` passa; os **paths** e
  schemas dos endpoints são idênticos (só os `@Tag` mudaram).
- **CA6 — Doc alinhada** — `CLAUDE.md` front descreve o fluxo real; não há mais contradição
  doc↔código.
- **CA7 — Auth/tenant intactos (smoke obrigatório, R5)** — após a regen, uma chamada autenticada real
  envia `Authorization` + `X-Tenant-ID` (config de `main.tsx`/`OpenAPI.HEADERS`). A regen sobrescreve
  `core/OpenAPI.ts`; o build pode passar e o header falhar **em runtime** — por isso é CA explícito,
  não coberto só pelo build verde.

## Métrica de sucesso

**Custo de sincronizar o front com o backend cai a ~zero:** quando o contrato muda, o dev roda
`generate:api` e obtém um diff limpo e revisável — em vez de uma regen destrutiva que ele tem de
desfazer à mão. Proxy verificável: CA1 (idempotência) + CA4 (build verde pós-regen).

## Open Questions & Assumptions

- **A1:** Renomear `@Tag(name)` não afeta comportamento — é metadado de OpenAPI/Swagger UI. *(confirmar
  que nenhum teste/cliente depende do nome PT-BR do tag.)*
- **A2:** O gerador `openapi-typescript-codegen@0.29` nomeia o serviço pelo **primeiro tag** da operação
  e cria `models/` para os schemas. *(validar empiricamente no init.)*
- **Q1 — Consolidação Strava:** os 4 controllers (`Strava OAuth/Status/Sync/Webhook`) viram **um**
  `@Tag` (`strava` → `StravaService`, casa com o curado) ou ficam 4 serviços separados? *(proposta em
  design.md: consolidar em `strava`.)*
- **Q2 — Naming p/ minimizar churn:** escolher tags cujo PascalCase **iguale** os nomes curados já
  consumidos (ex.: `race-projection`→`RaceProjectionService`) para não reescrever import de serviço,
  só o de tipos? *(proposta em design.md: sim, tabela de naming.)*
- **Q3 — Sequenciamento vs `wire-coach-shell-to-dashboards` (6b):** esta change deveria preceder a 6b
  (que hoje cria o `CoachDashboardService` à mão)? *(ver Impact; decisão de cadência do usuário.)*

## Faseamento (product-review)

Duas fases com merge independente — reduz risco e respeita o sequenciamento vs 6b:

- **Fase A — Backend (`@Tag` ASCII), XS/S, mergeável já.** É a correção de raiz; não toca o front;
  desbloqueia qualquer `generate:api` futuro. Pode preceder a 6b sem conflito.
- **Fase B — Front (regen + migração de imports/tipos), M, após a 6b.** Mais arriscada (mexe nos ~13
  import sites **versionados**) e deve esperar o coach shell estabilizar — assim a regen já absorve o
  `CoachDashboardService` em vez de jogá-lo fora.

> Nota: o product-reviewer supôs que `src/api/` estaria no `.gitignore` — **verificado e incorreto**:
> `src/api/` é **versionado** (cliente curado commitado). A Fase B portanto **altera arquivos
> versionados** (não é só bootstrap local), reforçando a revisão item-a-item do diff de regen (R4).

## Impact

- **Repos:** `apps/menthoros-backend` (tags) **e** `apps/menthoros-front` (regen + migração).
- **Relação com `wire-coach-shell-to-dashboards` (6b):** conflito de abordagem. A 6b adota o cliente
  **curado** (decisão tomada no seu init); esta change reverte para **gerado**. **Recomendação:**
  rodar `fix-openapi-client-generation` **antes** da 6b — assim a 6b consome o `CoachDashboardService`
  **gerado** e não cria/joga fora um serviço manual. Se a 6b já estiver em curso, re-sequenciar.
- **Reusa:** `generate:api` script + `openapi-typescript-codegen` já instalado; config central de
  headers em `main.tsx` (`OpenAPI.HEADERS`) permanece.
- **Não faz (anti-goals):** não muda contrato de API (paths/schemas), não adiciona endpoint, não troca
  o gerador por orval, não mexe em comportamento de auth/tenant.
- **Risco:** maior superfície (2 repos, ~13 import sites, remoção de tipos duplicados) — mitigações em
  design.md.

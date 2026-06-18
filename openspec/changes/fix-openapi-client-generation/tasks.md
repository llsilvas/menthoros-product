# Tasks: fix-openapi-client-generation

> Multi-repo. Backend primeiro (tags), depois front (regen + migração). Gates:
> backend `./mvnw clean test`; front `npm run lint && npm run build && npm run test:run`.

## FASE A — Backend (mergeável sozinha; pode preceder a 6b) — ✅ MERGEADA em develop (c8d1b95)

## 1. Backend — `@Tag` ASCII estáveis (`apps/menthoros-backend`)

- [x] 1.1 **Spike de validação (R1):** renomear 1 `@Tag` (ex.: `Projeção de Prova` → `race-projection`),
  subir local, rodar `generate:api` num dir scratch do front e confirmar que o serviço gerado é
  `RaceProjectionService`. Ajustar a tabela de naming (design D1) com o resultado real.
- [x] 1.2 Renomear o `@Tag(name=...)` dos 20 controllers conforme a tabela D1 (ASCII, sem acento/espaço);
  **manter `description` em PT-BR**. Consolidar os 4 controllers Strava sob `@Tag(name = "strava")` (D2).
- [x] 1.3 Conferir que nenhum teste depende do nome PT-BR do tag (A1). **Validação:** `./mvnw clean test`
  verde; `/api-docs` mostra os tags ASCII e os mesmos paths/schemas (CA5).

## FASE A2 — Backend: corrigir schemas de resposta de lista no OpenAPI (pré-requisito da Fase B)

> Descoberto na Fase B: o `/api-docs` declara endpoints de lista com schema de **objeto único** (ou
> sem schema), porque os `@ApiResponse(content=@Content(schema=@Schema(implementation=X.class)))`
> omitem `array`. O cliente gerado herda tipos errados. Referência correta: `CoachDashboardController.getRoster`
> (sem override → springdoc infere `array` do `List<>`).

- [ ] A2.1 Corrigir o `@ApiResponse` do `200` nos endpoints que retornam `List<>`/`Page<>` para declarar
  `array` (via `@ArraySchema` ou removendo o override `implementation=` e deixando o springdoc inferir):
  `AtletaController.listarAtletas`, `ProvaController.listarProvas`, `AtletaProgressController.getHistoricoPmc`
  e `getRecordes`, `RaceProjectionController.getHistory`, `ManualReconciliationController.listarCandidatos`
  (List) e `listarPendentes` (Page). Conferir cada um no `/api-docs` (schema `type: array`).
- [ ] A2.2 `@Operation`/`@ApiResponses` sem schema explícito onde o tipo de retorno já basta (evita
  reintroduzir o gap). **Validação:** `./mvnw clean test` verde; `/api-docs` mostra `array` nesses paths.
- [ ] A2.3 (doc) Nota no `CLAUDE.md` backend (Swagger Standards): endpoints de coleção devem declarar
  `array` no `@ApiResponse` (ou não sobrescrever o schema), senão o cliente gerado vem com tipo errado.

> **Ship da Fase A2** (backend) antes de retomar a Fase B. Só então o `generate:api` produz tipos corretos.

## FASE B — Front (após Fase A2 mergeada e no ar)

## 2. Front — regeneração (`apps/menthoros-front`, backend novo no ar)

- [ ] 2.0 `generate:api` passa a usar `--useUnionTypes` (gera union types; evita `enum`/`namespace`
  que violam `erasableSyntaxOnly` do tsconfig). Já validado na Fase B (idempotente + compila).
- [ ] 2.1 `npm run generate:api`; revisar o diff de `src/api/` — serviços com os nomes esperados (D1),
  `src/api/models/` criado, sem nomes corrompidos (CA2). Backend deve refletir os tags novos.
- [ ] 2.2 **Idempotência (CA1/D4):** rodar `generate:api` de novo → diff vazio na 2ª rodada. Se não,
  investigar fonte de não-determinismo antes de seguir.

## 3. Front — migração de import sites e tipos

- [ ] 3.1 Migrar imports de **tipo** dos hooks/componentes de `src/types/*` para `src/api/models/*`
  onde duplicam o contrato (D3), guiado por `npm run build` (tsc). Serviços curados com nome igual
  (D1) não precisam de troca de import de serviço.
- [ ] 3.2 Strava (R3): conferir que `SyncStravaButton`, `useStravaSync`, `StravaStatusWidget` chamam
  métodos existentes no `StravaService` gerado/consolidado; ajustar assinaturas se diferirem.
- [ ] 3.3 Remover de `src/types/` os tipos que passaram a viver em `src/api/models/` (CA3); manter
  domain/UI types (`WorkoutType`, `FormVariant`, `AvatarStatus`...).
- [ ] 3.4 **Smoke auth/tenant obrigatório (CA7/R5):** chamada autenticada real envia `Authorization` +
  `X-Tenant-ID` (a regen sobrescreve `core/OpenAPI.ts`; pode compilar e falhar em runtime). Confirmar
  `main.tsx`/`OpenAPI.HEADERS` intactos. **Validação:** `npm run lint && npm run build && npm run test:run` (CA4) **+ smoke**.

## 4. Docs

- [ ] 4.1 Alinhar a seção "API Client & Types Standards" do `CLAUDE.md` front ao resultado real
  (nomes derivados dos tags ASCII; tipos em `src/api/models`; `generate:api` idempotente) (CA6).
- [x] 4.2 Anotar no `CLAUDE.md` backend (Controller Standards) a convenção de `@Tag(name)` **ASCII**
  (com `description` PT-BR) para novos controllers — evita reintroduzir o problema.

## 5. Fechamento

- [ ] 5.1 CA1–CA6 verificados; diff de regen limpo e revisado (R4).
- [ ] 5.2 Gates finais: backend `./mvnw clean test`; front `npm run lint && npm run build && npm run test:run`.

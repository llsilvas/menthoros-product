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

## FASE A2 — Backend: schemas array de lista — ✅ MERGEADA em develop (24d606a)

> Descoberto na Fase B: o `/api-docs` declara endpoints de lista com schema de **objeto único** (ou
> sem schema), porque os `@ApiResponse(content=@Content(schema=@Schema(implementation=X.class)))`
> omitem `array`. O cliente gerado herda tipos errados. Referência correta: `CoachDashboardController.getRoster`
> (sem override → springdoc infere `array` do `List<>`).

- [x] A2.1 Corrigir o `@ApiResponse` do `200` nos endpoints que retornam `List<>`/`Page<>` para declarar
  `array` (via `@ArraySchema` ou removendo o override `implementation=` e deixando o springdoc inferir):
  `AtletaController.listarAtletas`, `ProvaController.listarProvas`, `AtletaProgressController.getHistoricoPmc`
  e `getRecordes`, `RaceProjectionController.getHistory`, `ManualReconciliationController.listarCandidatos`
  (List) e `listarPendentes` (Page). Conferir cada um no `/api-docs` (schema `type: array`).
- [x] A2.2 `@Operation`/`@ApiResponses` sem schema explícito onde o tipo de retorno já basta (evita
  reintroduzir o gap). **Validação:** `./mvnw clean test` verde; `/api-docs` mostra `array` nesses paths.
- [x] A2.3 (doc) Nota no `CLAUDE.md` backend (Swagger Standards): endpoints de coleção devem declarar
  `array` no `@ApiResponse` (ou não sobrescrever o schema), senão o cliente gerado vem com tipo errado.

> **Ship da Fase A2** (backend) antes de retomar a Fase B. Só então o `generate:api` produz tipos corretos.

## FASE B — Front — REESCOPADA (opção B): pipeline corrigido, cliente curado mantido

> Decisão (2026-06-18): a adoção do cliente cru-gerado foi **adiada** (3 bloqueios concretos: models
> all-optional, renames de método, endpoints curados inexistentes — ver design.md). Entrega = pipeline
> de geração determinístico/correto + doc. Cliente curado permanece como fachada.

- [x] 2.0 `generate:api` usa `--useUnionTypes` (evita `enum`/`namespace` que violam `erasableSyntaxOnly`).
- [x] 2.1/2.2 (validados, não adotados) Regen com tags ASCII + arrays (A2) + union types produz cliente
  limpo, sem corrupção (CA2 ✓) e **idempotente** (CA1 ✓). Saída **não** commitada — ver decisão acima.
- [~] 3.1–3.4 **ADIADOS (opção B):** migração dos call sites ao cliente gerado não executada (degrada
  tipagem; endpoints pendurados como `obterTreino`→`GET /treinos/{id}` inexistente). CA3/CA7 abandonados
  conscientemente. Migração futura, se desejada, é incremental por-feature com testes.
- [x] 4.1 `CLAUDE.md` front reescrito: `src/api` é cliente **curado** (fachada sobre o OpenAPI);
  `generate:api --useUnionTypes` é base/referência; fluxo de port à mão documentado (CA6).
- [x] 4.2 `CLAUDE.md` backend: convenção `@Tag` ASCII (Fase A) + `array` em endpoints de coleção (A2).

## 5. Fechamento (opção B)

- [x] 5.1 Atingidos: CA1 (idempotência), CA2 (nomes limpos), CA5 (sem mudança de contrato/A2 só metadados),
  CA6 (doc alinhada). **Abandonados (doc):** CA3 (src/api 100% gerado), CA7 (smoke da regen adotada).
- [x] 5.2 Gates: backend `./mvnw clean test` ✓ (746); front `build` + `test:run` ✓ (36); cliente curado intacto.

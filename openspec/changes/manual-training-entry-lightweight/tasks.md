# Tasks: manual-training-entry-lightweight

**Status:** Proposed  
**Trilha:** Full  
**Repos:** menthoros-backend + menthoros-front

---

## Seção 1 — Backend: investigação e setup

- [ ] **1.1** Verificar DDL de V1: `fc_media` e `pace_media` são `NOT NULL`?
  - Ler `V1__*.sql` e confirmar nullable status no banco.
  - Se `NOT NULL`: criar migration `V37__Make_fc_media_pace_media_nullable.sql` com `ALTER TABLE tb_treino_realizado ALTER COLUMN fc_media DROP NOT NULL, ALTER COLUMN pace_media DROP NOT NULL`.
  - Se já nullable: pular migration V37 (próxima migration livre continua sendo V37 para outro uso).
  - **verify:** `./mvnw clean compile` deve passar com ou sem a migration.

- [ ] **1.2** Criar record `TreinoManualInputDto` em `dto/input/`:
  - Campos: `tipo` (TipoTreino, @NotNull), `data` (LocalDate, @NotNull, @PastOrPresent), `duracaoMinutos` (@Positive @NotNull), `distanciaKm` (BigDecimal, nullable), `percepcaoEsforco` (@Min(1) @Max(10) @NotNull), `observacoes` (String, nullable, @Size(max=500)).
  - Anotações Swagger: `@Schema` em cada campo.
  - **verify:** compilação.

- [ ] **1.3** Implementar `TreinoService.registrarTreinoManualAtleta(UUID atletaId, TreinoManualInputDto input)`:
  - Valida que atleta pertence ao tenant (`atletaRepository.findByIdAndTenantId`).
  - Valida `input.data()` não anterior a `LocalDate.now().minusDays(7)` (máx 7 dias retroativos).
  - Converte no mapper: `Duration.ofMinutes(input.duracaoMinutos())`, seta `fonteDados=MANUAL`, `status=REALIZADO`, `criadoPor="ATLETA"`, `fcMedia=null`, `paceMedia=null`.
  - Chama `TssCalculatorService` (método existente) — não duplicar lógica RPE.
  - Best-effort match: `treinoPlanejadoRepository.findFirstByAtletaIdAndDataTreinoAndTipoTreinoAndTreinoRealizadoIsNull(atletaId, data, tipo)` — se encontrado, atualiza `statusTreino=REALIZADO` e seta `treinoPlanejadoId`.
  - Salva, publica `TreinoRegistradoEvent`, chama `tsbService.atualizarTsbDia()`.
  - Documenta: `Idempotent: NO / Side Effects: Database insert + event / Tenant-aware: YES`.
  - **verify:** `./mvnw clean compile`.

- [ ] **1.4** Criar `AtletaTreinoController` (ou adicionar no controller existente de atleta se houver):
  - `POST /api/v1/atletas/me/treinos` com `@PreAuthorize("hasRole('ATLETA')")`.
  - Resolve `atletaId` via cadeia JWT → `AuthenticatedPrincipalResolver` → `usuarioRepository` → `atletaRepository` (padrão existente — extrair para helper se repetitivo).
  - `@Tag(name = "atleta-treinos", description = "Registro de treinos pelo atleta")`.
  - `@Operation`, `@ApiResponses` (201, 400, 422, 403).
  - Retorna `ResponseEntity<TreinoRealizadoOutputDto>` (201).
  - **verify:** `./mvnw clean compile`.

- [ ] **1.5** Criar endpoint `GET /api/v1/atletas/me/treinos?dias=7` no mesmo controller:
  - `@PreAuthorize("hasRole('ATLETA')")`.
  - Parâmetro `dias` com `@RequestParam(defaultValue = "7") @Max(30) Integer dias`.
  - Chama `treinoRealizadoRepository.findByAtletaIdAndDataTreinoBetween(atletaId, hoje.minusDays(dias), hoje)` ordenado por `dataTreino DESC`.
  - Retorna `ResponseEntity<List<TreinoRealizadoOutputDto>>` (200).
  - **verify:** `./mvnw clean compile`.

- [ ] **1.6** Verificar se `TreinoRealizadoOutputDto` expõe `fonteDados`. Se não, adicionar campo ao record e ao mapper.
  - **verify:** `./mvnw clean compile`.

- [ ] **1.7** Testes: `AtletaTreinoServiceImplTest` — `@Nested` por método:
  - `RegistrarTreinoManualAtleta`:
    - happy path: treino criado, evento publicado, TSB atualizado, TSS calculado.
    - best-effort match: TreinoPlanejado existente tem status atualizado.
    - sem match: treino criado standalone sem erro.
    - data anterior a 7 dias → `DomainRuleViolationException`.
    - RPE=11 e RPE=0 → `ConstraintViolationException`.
    - atletaId de outro tenant → `DomainNotFoundException`.
  - `GetTreinosRecentes`:
    - retorna somente treinos do atleta autenticado.
    - dias > 30 → 422.
  - **verify:** `./mvnw clean test`.

- [ ] **1.8** Testes: `AtletaTreinoControllerTest` (`@WebMvcTest`):
  - POST sem role ATLETA → 403.
  - POST com body inválido → 400/422.
  - POST válido → 201 com body.
  - GET válido → 200 com lista.
  - **verify:** `./mvnw clean test`.

---

## Seção 2 — Frontend: cliente e hook

- [ ] **2.1** Criar `ManualTrainingService` em `src/api/services/`:
  - `registrar(input: TreinoManualInput): Promise<TreinoRealizadoDto>` → `POST /api/v1/atletas/me/treinos`.
  - `listarRecentes(dias?: number): Promise<TreinoRealizadoDto[]>` → `GET /api/v1/atletas/me/treinos?dias={dias}`.
  - Exportar de `src/api/index.ts`.
  - **verify:** `npm run lint && npm run build`.

- [ ] **2.2** Criar types em `src/types/Treino.ts`:
  - `TreinoManualInput`: tipo, data, duracaoMinutos, distanciaKm?, percepcaoEsforco, observacoes?.
  - `TreinoRealizadoDto`: id, tipo, data, duracaoMinutos, distanciaKm?, percepcaoEsforco, tssCalculado, fonteDados, observacoes?, dataCriacao.
  - `TipoTreino` enum com labels PT-BR (ex: `CONTINUO: 'Corrida contínua'`).
  - **verify:** `npm run lint && npm run build`.

- [ ] **2.3** Criar hook `useManualTraining`:
  - `registrar(input)` — POST + refresh da lista.
  - `recentes` — estado com os últimos 7 dias.
  - `loading`, `error`.
  - **verify:** `npm run lint && npm run build`.

---

## Seção 3 — Frontend: formulário e página

- [ ] **3.1** Criar `ManualTrainingFormPage` (rota `/atleta/treinos/registrar`):
  - `ManualTrainingForm` component:
    - Chips de tipo: mapear `TipoTreino` enum para label PT-BR + ícone.
    - Date picker: default hoje, max hoje, min = hoje - 7 dias.
    - Campo duração em minutos (`number`, min=1, max=600).
    - Campo distância em km (`number`, opcional, oculto para REGENERATIVO).
    - Slider RPE 1–10 com 4 labels textuais.
    - **Preview TSS estimado** abaixo do slider: `Math.round((dur/60) * Math.pow(rpe/10, 2) * 100)` — "~45 TSS (estimativa)".
    - Campo observações (`TextField`, multiline, max 500 chars).
    - Botão "Registrar treino" (desabilitado enquanto loading).
    - Soft-warning se já existe treino registrado hoje (buscar em `recentes`).
  - Após submit bem-sucedido: toast de confirmação + limpar form + atualizar `RecentTrainingsList`.
  - **verify:** `npm run lint && npm run build`.

- [ ] **3.2** Criar `RecentTrainingsList` component:
  - Lista vertical dos últimos 7 dias: cada item mostra tipo (label PT-BR), duração, distância, RPE, TSS, data, badge "Manual".
  - Estado vazio: "Nenhum treino registrado nos últimos 7 dias".
  - **verify:** `npm run lint && npm run build`.

- [ ] **3.3** Adicionar rota `/atleta/treinos/registrar` no `App.tsx` (ou roteador do shell do atleta).
  Adicionar link/botão "Registrar treino de hoje" na `AtletaHomePage` como ação rápida.
  - **verify:** `npm run lint && npm run build`.

- [ ] **3.4** Testes: `ManualTrainingForm.test.tsx`:
  - Renderiza todos os campos.
  - Submit com dados válidos → chama `ManualTrainingService.registrar`.
  - Submit com RPE inválido → botão desabilitado ou mensagem de erro.
  - Preview TSS atualiza conforme duração/RPE mudam.
  - **verify:** `npm run lint && npm run build && npm run test:run`.

---

## Validação Final

```bash
# Backend
./mvnw clean test

# Frontend
npm run lint && npm run build && npm run test:run
```

Após a validação: `/qa` (code-reviewer + security-reviewer + frontend-reviewer) → `/pr manual-training-entry-lightweight`.

# Tasks: athlete-profile-drilldown

**Status:** Proposed
**Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Seção 0 — Verificações pré-implementação (bloqueia implementação se falhar)

- [ ] **0.1** Verificar props de `PMCChart.tsx`:
  - Ler `src/features/athlete/components/PMCChart.tsx`
  - Confirmar que aceita `data: PMCDataPoint[]` como prop — **sem** `useEffect` + fetch interno no componente
  - Se tiver fetch interno: criar `PMCChartPure` wrapper antes de iniciar a Seção 5
  - Registrar: tipo exato de `PMCDataPoint` para garantir compatibilidade com o backend
  - **verify:** sem falha de build após ajuste

- [x] **0.2** Verificar FK `treinoPlanejadoId` em `TreinoRealizado`:
  - ✅ Confirmado: `TreinoRealizado` tem `@OneToOne(fetch=LAZY) TreinoPlanejado treinoPlanejado` + `treinoPlanejadoId UUID` (inserível=false)
  - Query de aderência: LEFT JOIN de `TreinoPlanejado` com `TreinoRealizado` via `tr.treinoPlanejado = tp` (ou `tr.treinoPlanejadoId = tp.id`)
  - Treinos sem vínculo (`treinoPlanejadoId = null`) = não realizados para fins de aderência

- [x] **0.3** Confirmar valores reais do enum `TreinoExecucaoStatus`:
  - ✅ Confirmado: `REALIZADO`, `PERDIDO`, `PARCIAL`, `LIVRE`, `PENDENTE`, `CONCLUIDO`
  - **Não existe `PLANEJADO`** — treino não realizado = `PENDENTE`; executado = `REALIZADO` ou `CONCLUIDO`; não feito = `PERDIDO` ou `PARCIAL`
  - `TreinoPlanejadoResumoDto.statusExecucao: String` deve usar `.name()` do enum (não valor customizado)

- [x] **0.4** Verificar volume de `SugestaoCoachService.listar(status)`:
  - ✅ Confirmado: `SugestaoCoachRepository.findByTenantIdAndStatus` sem `LIMIT` — retorna todas as sugestões do tenant por status
  - **Decisão: Opção B** — adicionar `listarPorAtleta(UUID atletaId, StatusSugestao status)` ao `SugestaoCoachService` (nova query com `WHERE atletaId = :atletaId` no repository)
  - Razão: sem LIMIT não é seguro filtrar em memória em tenants com muitos atletas e histórico acumulado
  - `CoachAttentionQueueService.getAttentionQueue()` mantém filtro em memória (cap 20 items — OK)

- [ ] **0.5** Verificar estrutura do `CoachAthletesPage`:
  - Ler `src/features/coach/pages/CoachAthletesPage.tsx`
  - Identificar componente de lista (DataGrid, Table, CardList) e padrão de interação existente
  - Confirmar que `onRowClick` ou `onClick` é adicionável sem refator maior

- [ ] **0.6** Verificar props de `CoachAthleteAvatar`:
  - Ler o componente (provavelmente `src/features/coach/components/CoachAthleteAvatar.tsx`)
  - Confirmar que aceita `nome: string` (e/ou `atletaId`) sem dependência de contexto externo
  - Se depende de contexto: usar componente alternativo (Avatar MUI + iniciais inline)

---

## Seção 1 — Backend: DTOs e método de aderência

- [x] **1.1** Criar `AderenciasSemanalDto` em `dto/output/`:
  - `record AderenciasSemanalDto(LocalDate semanaInicio, int totalPlanejado, int totalRealizado, int percentual)`
  - `@Schema` em classe e em todos os campos
  - **verify:** `./mvnw clean compile`

- [x] **1.2** Adicionar método `getAderenciaSemanal(UUID atletaId, int semanas)` à interface `AtletaProgressService`:
  - Retorno: `List<AderenciasSemanalDto>` com uma entrada por semana (mais recente primeiro)
  - JavaDoc: Idempotent/Side Effects/Tenant-aware
  - **verify:** `./mvnw clean compile`

- [x] **1.3** Implementar `getAderenciaSemanal` em `AtletaProgressServiceImpl`:
  - Query JPQL em `TreinoPlanejadoRepository` (novo método `findAderenciaSemanal`):
    ```sql
    SELECT FUNCTION('DATE_TRUNC', 'week', tp.dataTreino) as semanaInicio,
           COUNT(tp.id) as totalPlanejado,
           COUNT(tr.id) as totalRealizado
    FROM TreinoPlanejado tp
    LEFT JOIN TreinoRealizado tr ON tr.treinoPlanejado.id = tp.id
    WHERE tp.atleta.id = :atletaId
    AND tp.dataTreino >= :dataInicio
    GROUP BY FUNCTION('DATE_TRUNC', 'week', tp.dataTreino)
    ORDER BY semanaInicio DESC
    ```
  - Calcular `percentual = (totalRealizado * 100) / max(totalPlanejado, 1)` em Java
  - Retornar lista vazia quando nenhuma semana tem `totalPlanejado > 0`
  - **Atenção:** confirmar se `TreinoPlanejado` usa `atleta.id` ou `atletaId` como coluna — ver entidade
  - **verify:** `./mvnw clean test`

- [x] **1.4** Criar DTO agregador `AtletaPerfilCoachOutputDto` em `dto/output/`:
  - Record raiz + sub-records nested: `PlanoVigenteDto`, `TreinoPlanejadoResumoDto`, `SinalRecenteDto`, `SugestaoRecenteDto`
  - `PlanoVigenteDto` inclui `PlanoReviewStatus reviewStatus` (não só `APROVADO`)
  - `TreinoPlanejadoResumoDto.statusExecucao`: usar valores reais de `TreinoExecucaoStatus` (confirmados na task 0.3) — não usar `"PLANEJADO"`
  - `SinalRecenteDto` inclui `UUID sugestaoId` (nullable — preenchido se existe sugestão associada)
  - `@JsonInclude(NON_NULL)` no record raiz; `@Schema` em todos os campos
  - **verify:** `./mvnw clean compile`

---

## Seção 2 — Backend: serviço e controller

- [x] **2.1** Criar interface `CoachAthleteProfileService` em `services/`:
  - `AtletaPerfilCoachOutputDto buscarPerfil(UUID atletaId, UUID tenantId)`
  - JavaDoc completo (Idempotent/Side Effects/Tenant-aware)
  - **verify:** `./mvnw clean compile`

- [x] **2.2** Criar `CoachAthleteProfileServiceImpl` em `services/impl/`:
  - Injeta: `AtletaRepository`, `AtletaProgressService`, `CoachAttentionQueueService`, `SugestaoCoachService`, `PlanoSemanalRepository`
  - `buscarPerfil(UUID atletaId, UUID tenantId)`:
    1. Validar: `atletaRepository.findByIdAndTenantId(atletaId, tenantId).orElseThrow(DomainNotFoundException)` — **antes de chamar qualquer sub-serviço**
    2. `AtletaProgressService.getHistoricoPmc(atletaId, hoje.minusDays(90), hoje)` — não passa `tenantId`
    3. `AtletaProgressService.getRecordes(atletaId)` — não passa `tenantId`
    4. `AtletaProgressService.getAderenciaSemanal(atletaId, 8)` — novo método
    5. Sinais: `coachAttentionQueueService.getAttentionQueue()` → filtrar por `atletaId`, top 3 por `severity + priorityScore desc`
    6. Sugestões: `sugestaoCoachService.listarPorAtleta(atletaId)` → top 3 por `criadoEm desc` (novo método — task 2.2a)
    7. Para cada sinal: procurar `sugestaoId` nas sugestões do atleta (match por tipo/data, heurístico, null se ausente)
    8. Plano: `planoSemanalRepository.findMostRecentRelevantPlano(atletaId, tenantId, hoje)` → novo método JPQL
  - **Logging de duração por sub-serviço**: `long t = System.nanoTime(); ...; log.debug("[perfil] pmc: {}ms", (System.nanoTime()-t)/1_000_000)`
  - **verify:** `./mvnw clean compile`

- [x] **2.2a** Adicionar `listarPorAtleta(UUID atletaId)` ao `SugestaoCoachService` e `SugestaoCoachServiceImpl`:
  - Interface: `List<SugestaoCoachOutputDto> listarPorAtleta(UUID atletaId)`
  - Impl: `sugestaoCoachRepository.findByAtletaIdAndTenantId(atletaId, tenantId)` (novo método no repository)
  - Repository: `findByAtletaIdAndTenantId(UUID atletaId, UUID tenantId)` com `JOIN FETCH atleta` e `ORDER BY criadoEm DESC`
  - **verify:** `./mvnw clean test`

- [x] **2.2b** Adicionar `findMostRecentRelevantPlano` ao `PlanoSemanalRepository`:
  - Método: `Optional<PlanoSemanal> findMostRecentRelevantPlano(UUID atletaId, UUID assessoriaId, LocalDate hoje)`
  - JPQL: `SELECT p FROM PlanoSemanal p WHERE p.atletaId = :atletaId AND p.assessoriaId = :assessoriaId AND p.semanaFim >= :hoje ORDER BY p.semanaInicio DESC LIMIT 1`
  - Retorna o plano mais recente com `semanaFim >= hoje` (qualquer `reviewStatus`)
  - **verify:** `./mvnw clean compile`

- [x] **2.3** Criar `CoachAthleteProfileController` em `controller/`:
  - `@Tag(name = "coach-athlete-profile", description = "Perfil agregado do atleta para tomada de decisão do coach")`
  - `GET /api/v1/coach/atletas/{atletaId}/perfil`
    - `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`
    - `TenantContext.getRequiredTenantId()` para resolver tenant
    - Retorno: `ResponseEntity<AtletaPerfilCoachOutputDto>`
    - `@Operation`, `@ApiResponses` (200, 401, 403, 404)
    - `@Parameter` no `@PathVariable`
  - **verify:** `./mvnw clean compile`

---

## Seção 3 — Backend: testes

- [x] **3.1** Testes: `AtletaProgressServiceImplTest` — nested class `GetAderenciaSemanal`:
  - Happy path: 8 semanas com dados → percentuais corretos
  - Semana sem treinos planejados → semana omitida (lista não inclui a semana; sem barras 0% silenciosas)
  - Semana 100% realizada → percentual = 100
  - Nenhuma semana com `totalPlanejado > 0` → lista vazia (sem dados = sem barras)
  - `atletaId` cross-tenant → lista vazia (não lança exceção; isolamento garantido pelo filtro de tenant no repositório)
  - **verify:** `./mvnw clean test`

- [x] **3.2** Testes: `CoachAthleteProfileServiceImplTest`:
  - Happy path: todos os sub-serviços retornam dados → DTO montado corretamente
  - `atletaId` não encontrado no tenant → `DomainNotFoundException` **+ `verifyNoInteractions` em todos os sub-serviços** (sub-serviços NÃO são chamados antes da validação passar)
  - Sinais filtrados por `atletaId` (sinais de outros atletas não aparecem no DTO)
  - Sugestões filtradas por `atletaId` (top 3 por `criadoEm` desc)
  - Sinal tem `sugestaoId` preenchido quando existe sugestão com mesmo motivo/data
  - Plano com `reviewStatus = AGUARDANDO_REVISAO` → `planoVigente.reviewStatus == AGUARDANDO_REVISAO`, `treinos` vazio
  - Sem plano com `semanaFim >= hoje` → `planoVigente == null`
  - Aderência: lista vazia quando não há treinos planejados → sem exceção, sem zeros
  - Sem sinais → lista vazia (não quebra)
  - **verify:** `./mvnw clean test`

- [x] **3.3** Testes: `CoachAthleteProfileControllerTest` (`@ExtendWith(MockitoExtension.class)`):
  - GET perfil: 200 com DTO
  - 403 sem role TECNICO/ADMIN
  - 404 atleta não encontrado no tenant
  - **verify:** `./mvnw clean test`

---

## Seção 4 — Frontend: tipos e serviço API

- [ ] **4.1** Criar `src/types/AtletaPerfilCoach.ts`:
  - `AtletaPerfilCoachDto` mapeando o `AtletaPerfilCoachOutputDto` do backend
  - Sub-types: `AderenciasSemanalDto`, `PlanoVigenteDto` (com `reviewStatus: PlanoReviewStatus`), `TreinoPlanejadoResumoDto`, `SinalRecenteDto` (com `sugestaoId: string | null`), `SugestaoRecenteDto`
  - `TreinoPlanejadoResumoDto.statusExecucao`: usar valores reais de `TreinoExecucaoStatus` (confirmados na task 0.3)
  - Reusar tipos já existentes onde possível (`RecordeDto` de `AtletaProgress.ts`)
  - **verify:** `npm run lint && npm run build`

- [ ] **4.2** Criar `CoachAthleteProfileService` em `src/api/services/`:
  - `getProfile(atletaId: string): Promise<AtletaPerfilCoachDto>`
  - Exportar de `src/api/index.ts`
  - **verify:** `npm run lint && npm run build`

- [ ] **4.3** Criar hook `useAthleteProfile(atletaId: string)` em `src/hooks/`:
  - Estado: `profile: AtletaPerfilCoachDto | null`, `isLoading: boolean`, `error: Error | null`
  - `useEffect` dispara `fetchProfile()` quando `atletaId` muda
  - Erro de timeout (HTTP 504/408): `error.message` contém "timeout" (não mensagem genérica)
  - Teste: `useAthleteProfile.test.ts` — happy path, error genérico, timeout específico, refetch
  - **verify:** `npm run lint && npm run build && npm run test:run`

---

## Seção 5 — Frontend: componentes de bloco

- [ ] **5.1** Criar `AdherenceChart` em `src/features/coach/components/`:
  - Props: `semanas: AderenciasSemanalDto[]`
  - **Estado vazio** (`semanas.length === 0`): exibir "Sem dados de aderência — registre treinos para ativar este bloco" (não barras zeradas)
  - Quando há dados: barras horizontais; verde ≥ 80%, amarelo 50–79%, vermelho < 50%
  - Label: semana abreviada (ex.: "02/06") + percentual
  - **verify:** `npm run lint && npm run build`

- [ ] **5.2** Criar `CurrentWeekPlan` em `src/features/coach/components/`:
  - Props: `plano: PlanoVigenteDto | null`, `onGerarPlano: () => void`, `onRevisarPlano: () => void`
  - 3 estados distintos baseados em `plano?.reviewStatus`:
    - `APROVADO`: 7 cards compactos seg→dom: tipo, volume, statusExecucao real (não `"PLANEJADO"`)
    - `AGUARDANDO_REVISAO`: banner azul "Plano gerado aguardando revisão" + botão "Revisar" (`onRevisarPlano`)
    - `null` (sem plano): "Nenhum plano gerado para esta semana" + botão "Gerar Plano" (`onGerarPlano`)
  - **verify:** `npm run lint && npm run build`

- [ ] **5.3** Criar `RecentSignalsPanel` em `src/features/coach/components/`:
  - Props: `sinais: SinalRecenteDto[]`, `onVerSugestao: (id: string) => void`
  - Lista compacta: `SeverityChip` + `motivo` + tempo relativo (ex.: "há 2 dias")
  - Quando `sinal.sugestaoId != null`: exibir badge "Sugestão gerada" clicável (`onVerSugestao(sinal.sugestaoId)`)
  - Estado vazio: "Nenhum sinal recente"
  - **verify:** `npm run lint && npm run build`

- [ ] **5.4** Criar `RecentSuggestionsPanel` em `src/features/coach/components/`:
  - Props: `sugestoes: SugestaoRecenteDto[]`, `onVerSugestao: (id: string) => void`
  - Lista compacta: `SuggestionTypeBadge` + status + tempo relativo + botão "Ver"
  - Estado vazio: "Nenhuma sugestão recente"
  - **verify:** `npm run lint && npm run build`

---

## Seção 6 — Frontend: página e navegação

- [ ] **6.1** Criar `CoachAthleteProfilePage` em `src/features/coach/pages/`:
  - **Pré-condição:** tarefas 0.1 e 0.6 concluídas (props de PMCChart e Avatar verificadas)
  - Consume `useAthleteProfile(atletaId)` — `atletaId` vem de `useParams()`
  - Loading state (skeleton ou spinner)
  - Erro state: distinguir timeout ("Perfil demorou para carregar, tente novamente") de outros erros
  - Layout:
    - Cabeçalho sticky: Avatar/iniciais + nome + objetivo + prova alvo + botão "← Equipe" + tooltip read-only ("Visualização — edição em [tela X]")
    - Bloco 1 — PMC: `<PMCChart data={profile.pmc} />` com adapter de tipos se necessário (task 0.1)
    - Bloco 2 — Aderência: `<AdherenceChart semanas={profile.aderenciaSemanal} />` (mostra estado vazio se lista vazia)
    - Bloco 3 — Plano: `<CurrentWeekPlan plano={profile.planoVigente} onGerarPlano={...} onRevisarPlano={...} />`
    - Bloco 4 — 2 colunas: `<RecentSignalsPanel onVerSugestao={...} />` + `<RecentSuggestionsPanel onVerSugestao={...} />`
    - Bloco 5 — Recordes: lista simples (distância + tempo + data)
  - Botão "Gerar Plano" navega para `/coach/plans/generate?atletaId=...`
  - Botão "Ver Sugestão" / badge "Sugestão gerada" navega para `/coach/inbox?sugestaoId=...`
  - Botão "Revisar" navega para `/coach/planos/revisao`
  - **verify:** `npm run lint && npm run build`

- [ ] **6.2** Adicionar rota `/coach/athletes/:atletaId` no `App.tsx`:
  - Lazy import de `CoachAthleteProfilePage`
  - Dentro do `CoachLayout` (filho do Outlet existente)
  - **verify:** `npm run lint && npm run build`

- [ ] **6.3** Adicionar navegação `onRowClick` no roster (`CoachAthletesPage`):
  - `DataGrid` ou lista de atletas ganha `onRowClick={(row) => navigate('/coach/athletes/' + row.atletaId)}`
  - Cursor pointer no hover
  - **verify:** `npm run lint && npm run build`

- [ ] **6.4** Testes: `CoachAthleteProfilePage.test.tsx`:
  - Renderiza cabeçalho com nome do atleta
  - Exibe PMC chart quando `profile.pmc` tem dados
  - Exibe "Sem dados de aderência" quando `profile.aderenciaSemanal` é vazio
  - Exibe 7 cards de treino quando plano aprovado
  - Exibe banner "aguardando revisão" + botão "Revisar" quando `plano.reviewStatus = AGUARDANDO_REVISAO`
  - Exibe "Nenhum plano gerado" + botão "Gerar Plano" quando `planoVigente == null`
  - Badge "Sugestão gerada" visível quando sinal tem `sugestaoId` preenchido
  - Botão "← Equipe" navega para `/coach/athletes`
  - Estado de loading (spinner visível durante fetch)
  - Estado de erro genérico (Alert exibido)
  - Estado de timeout ("Perfil demorou para carregar")
  - **verify:** `npm run lint && npm run build && npm run test:run`

---

## Validação Final

```bash
# Backend
./mvnw clean test

# Frontend
npm run lint && npm run build && npm run test:run
```

Após validação: `/qa` → `/pr athlete-profile-drilldown`

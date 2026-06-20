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

- [ ] **0.2** Verificar FK `treinoPlanejadoId` em `TreinoRealizado`:
  - Ler entidade `TreinoRealizado.java`
  - Confirmar existência de campo `treinoPlanejadoId UUID` (ou `@OneToOne TreinoPlanejado treinoPlanejado`)
  - Se não existir FK: a query de aderência usará match por `atletaId + dataTreino` — documentar no design.md como fallback
  - Se FK existe mas é `null` para treinos `MANUAL`/Strava: calcular como "não vinculado" = não realizado para aderência

- [ ] **0.3** Confirmar valores reais do enum `TreinoExecucaoStatus`:
  - Ler `src/main/java/br/com/menthoros/backend/enums/TreinoExecucaoStatus.java`
  - Listar todos os valores — **NÃO existe `PLANEJADO`**
  - Mapear para o DTO: valor para "não realizado" é `PENDENTE`; "realizado" é `CONCLUIDO` ou `REALIZADO`
  - Atualizar o comentário no `TreinoPlanejadoResumoDto` com os valores confirmados

- [ ] **0.4** Verificar volume de `SugestaoCoachService.listar(status)`:
  - Ler `SugestaoCoachServiceImpl.listar` e `SugestaoCoachRepository`
  - Se a query retorna lista completa sem `LIMIT` e sem paginação: decidir se mantém filtro em memória (OK para < 100 itens) ou adiciona método `listarPorAtleta(UUID atletaId)` ao serviço
  - Documentar a decisão no design.md (Decisão 3)

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

- [ ] **1.1** Criar `AderenciasSemanalDto` em `dto/output/`:
  - `record AderenciasSemanalDto(LocalDate semanaInicio, int totalPlanejado, int totalRealizado, int percentual)`
  - `@Schema` em classe e em todos os campos
  - **verify:** `./mvnw clean compile`

- [ ] **1.2** Adicionar método `getAderenciaSemanal(UUID atletaId, int semanas)` à interface `AtletaProgressService`:
  - Retorno: `List<AderenciasSemanalDto>` com uma entrada por semana (mais recente primeiro)
  - JavaDoc: Idempotent/Side Effects/Tenant-aware
  - **verify:** `./mvnw clean compile`

- [ ] **1.3** Implementar `getAderenciaSemanal` em `AtletaProgressServiceImpl`:
  - **Pré-condição:** tarefa 0.2 concluída (método de join definido)
  - Query JPQL: contar `TreinoPlanejado` por semana ISO nos últimos `semanas` semanas para o `atletaId`
  - Usar `tp.treinoRealizado IS NOT NULL` se FK existe; `match por atleta+dataTreino` se não existe
  - Calcular `percentual = (totalRealizado * 100) / max(totalPlanejado, 1)`
  - Retornar lista vazia quando nenhuma semana tem `totalPlanejado > 0` (sem dados = sem barras, não 0% em tudo)
  - **verify:** `./mvnw clean test`

- [ ] **1.4** Criar DTO agregador `AtletaPerfilCoachOutputDto` em `dto/output/`:
  - Record raiz + sub-records nested: `PlanoVigenteDto`, `TreinoPlanejadoResumoDto`, `SinalRecenteDto`, `SugestaoRecenteDto`
  - `PlanoVigenteDto` inclui `PlanoReviewStatus reviewStatus` (não só `APROVADO`)
  - `TreinoPlanejadoResumoDto.statusExecucao`: usar valores reais de `TreinoExecucaoStatus` (confirmados na task 0.3) — não usar `"PLANEJADO"`
  - `SinalRecenteDto` inclui `UUID sugestaoId` (nullable — preenchido se existe sugestão associada)
  - `@JsonInclude(NON_NULL)` no record raiz; `@Schema` em todos os campos
  - **verify:** `./mvnw clean compile`

---

## Seção 2 — Backend: serviço e controller

- [ ] **2.1** Criar interface `CoachAthleteProfileService` em `services/`:
  - `AtletaPerfilCoachOutputDto buscarPerfil(UUID atletaId, UUID tenantId)`
  - JavaDoc completo (Idempotent/Side Effects/Tenant-aware)
  - **verify:** `./mvnw clean compile`

- [ ] **2.2** Criar `CoachAthleteProfileServiceImpl` em `services/impl/`:
  - Injeta: `AtletaRepository`, `AtletaProgressService`, `CoachAttentionQueueService`, `SugestaoCoachService`, `PlanoSemanalRepository`
  - `buscarPerfil`: valida tenant (`atletaRepository.findByIdAndTenantId` — lança `DomainNotFoundException` se não encontrado, **sem chamar sub-serviços**)
  - Chamar sub-serviços após validação: PMC 90d → recordes → aderência 8 semanas → sinais → sugestões → plano
  - Sinais: filtrar `getAttentionQueue()` por `i.atletaId().equals(atletaId)`, limit 3 por severidade desc
  - Para cada sinal: procurar `sugestaoId` nas sugestões do atleta com mesmo `tipo` gerado na mesma data (match heurístico, null se não encontrado)
  - Plano: buscar plano mais recente com `semanaFim >= CURRENT_DATE` via JPQL — retorna `PlanoVigenteDto` com `reviewStatus` real; `null` se não existe plano
  - **Logging de duração por sub-serviço** (não só para o método inteiro): `log.debug("pmc: {}ms", ...)`, etc.
  - `AtletaProgressService` não recebe `tenantId` como parâmetro — usa `TenantContext` internamente
  - **verify:** `./mvnw clean compile`

- [ ] **2.3** Criar `CoachAthleteProfileController` em `controller/`:
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

- [ ] **3.1** Testes: `AtletaProgressServiceImplTest` — nested class `GetAderenciaSemanal`:
  - Happy path: 8 semanas com dados → percentuais corretos
  - Semana sem treinos planejados → semana omitida (lista não inclui a semana; sem barras 0% silenciosas)
  - Semana 100% realizada → percentual = 100
  - Nenhuma semana com `totalPlanejado > 0` → lista vazia (sem dados = sem barras)
  - `atletaId` cross-tenant → lista vazia (não lança exceção; isolamento garantido pelo filtro de tenant no repositório)
  - **verify:** `./mvnw clean test`

- [ ] **3.2** Testes: `CoachAthleteProfileServiceImplTest`:
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

- [ ] **3.3** Testes: `CoachAthleteProfileControllerTest` (`@ExtendWith(MockitoExtension.class)`):
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

# Design: athlete-profile-drilldown

**Tamanho:** M · **Trilha:** Full

## Contexto de decisão

A change cria uma tela de perfil individual do atleta para o coach. O dado já existe em serviços separados; o desafio é agregá-lo de forma eficiente sem N+1, expondo um único endpoint que a página consome com uma requisição.

---

## Decisão 1 — Endpoint agregador vs múltiplas chamadas paralelas do frontend

**Opção A (escolhida):** Endpoint único `GET /api/v1/coach/atletas/{atletaId}/perfil` que agrega internamente.

**Opção B:** Frontend faz 5–6 chamadas paralelas (PMC, recordes, aderência, plano, sinais, sugestões).

**Por que A:**
- Uma abertura de página = 1 request → menor latência percebida, menor carga de rede.
- Centraliza a validação de tenant e autorização em um único ponto.
- O critério de aceite CA8 exige explicitamente 1 chamada.
- O dado é composto: o backend pode cachear o perfil completo (curto TTL) de forma mais eficiente do que o frontend coordenaria 6 chamadas independentes.

**Consequência:** o endpoint pode ficar lento se algum sub-serviço for lento. Mitigação: timeout interno (500ms por sub-serviço) e retorno parcial com campo `avisos` indicando o que não carregou.

---

## Decisão 2 — Aderência semanal: nova query ou novo método de serviço

O `AtletaProgressService` não tem aderência semanal. Opções:

**Opção A (escolhida):** Adicionar `getAderenciaSemanal(UUID atletaId, int semanas)` ao `AtletaProgressService`.

**Opção B:** Calcular no agregador diretamente via repositório.

**Por que A:**
- Mantém a separação de responsabilidades: lógica de progresso no `AtletaProgressService`.
- Testável de forma isolada.
- Abre caminho para reutilizar em futuros endpoints.

**Implementação:** query JPQL: `TreinoPlanejado` com `dataTreino` nas últimas N semanas para o `atletaId`. Se existe FK `treinoPlanejadoId` em `TreinoRealizado`, usar `tp.treinoRealizado IS NOT NULL` para contar realizados — verificar antes de implementar (tasks.md 0.2). Agrupar por semana ISO. Retorno: `List<AderenciasSemanalDto>` com `semanaInicio`, `totalPlanejado`, `totalRealizado`, `percentual`.

**Estado sem dados:** quando nenhuma semana tem `totalPlanejado > 0`, retornar lista vazia → frontend exibe "Sem dados de aderência — registre treinos para ativar este bloco" em vez de 8 barras vermelhas (que seriam lidas como "0% de aderência" quando o real é ausência de dado).

---

## Decisão 3 — Filtro de sinais e sugestões por atletaId

`CoachAttentionQueueService.getAttentionQueue()` retorna todos os itens do tenant (sem filtro por atleta).
`SugestaoCoachService.listar(status)` idem.

Ambos os DTOs têm `atletaId`:
- `CoachAttentionItemOutputDto.atletaId`
- `SugestaoCoachOutputDto.atletaId`

**Opção A (escolhida):** Filtrar em memória no agregador (`stream().filter(i -> atletaId.equals(i.atletaId())).limit(3)`).

**Opção B:** Adicionar método com parâmetro `atletaId` aos serviços.

**Por que A (no v1):** o tamanho típico da fila de sinais é pequeno (cap 20 itens do tenant); filtrar em memória é negligenciável.

**Caveat para sugestões:** `SugestaoCoachService.listar(status)` pode retornar volume maior (todas as sugestões do tenant sem `LIMIT`). Verificar antes de implementar (tasks.md 0.4). Se o volume for > 100 itens, evoluir para Opção B (método com parâmetro `atletaId`) mesmo no v1 — não registrar como follow-up se confirmado grande.

---

## Decisão 4 — Plano mais recente relevante

Buscar o plano mais recente do atleta (qualquer status) via `PlanoSemanalRepository.findTopByAtletaIdAndAssessoriaIdOrderBySemanaInicioDesc(atletaId, tenantId)` — com filtro de data no JPQL (`WHERE p.semanaInicio <= :hoje AND p.semanaFim >= :hoje` para planos vigentes, ou o mais recente `ORDER BY semanaInicio DESC LIMIT 1`).

**O campo `reviewStatus` é incluído no `PlanoVigenteDto`** — o frontend renderiza estados distintos:
- `APROVADO` + data vigente → 7 cards de treino com status de execução
- `AGUARDANDO_REVISAO` → banner "Plano gerado aguardando revisão" + botão "Revisar"
- Nenhum plano → `planoVigente == null` → "Nenhum plano gerado" + botão "Gerar Plano"

**Regra de data no JPQL (não em Java):** usar `CURRENT_DATE` do banco para evitar divergência de timezone entre servidor e banco. Não filtrar em Java com `LocalDate.now()`.

**Sem verificação de semana futura:** retornar o plano mais recente com `semanaFim >= CURRENT_DATE`, independente de ser semana atual ou futura (coach vê o que está vigente ou o próximo aprovado).

---

## Decisão 5 — Novo controller ou extensão do CoachDashboardController

**Opção A (escolhida):** Novo `CoachAthleteProfileController` com tag `coach-athlete-profile`.

**Por que:** o perfil é um domínio separado do dashboard; manter em controller próprio preserva SRP e facilita `@WebMvcTest` isolado.

---

## Estrutura do DTO

```java
public record AtletaPerfilCoachOutputDto(
    // Cadastrais
    UUID atletaId,
    String nomeAtleta,
    String objetivo,
    String provaAlvo,        // nullable
    String nivelExperiencia, // nullable
    
    // PMC (90 dias)
    List<PmcPontoDto> pmc,
    
    // Aderência (8 semanas)
    List<AderenciasSemanalDto> aderenciaSemanal,
    
    // Plano vigente
    PlanoVigenteDto planoVigente, // nullable
    
    // Sinais recentes (top 3)
    List<SinalRecenteDto> sinaisRecentes,
    
    // Sugestões recentes (top 3)
    List<SugestaoRecenteDto> sugestoesRecentes,
    
    // Recordes
    List<RecordeDto> recordes,
    
    // Meta
    Instant geradoEm,
    List<String> avisos  // campos que não carregaram (nullable)
)
```

Sub-records:

```java
// já existe — reutilizar
public record PmcPontoDto(LocalDate data, double ctl, double atl, double tsb, double tss) {}

// novo
public record AderenciasSemanalDto(
    LocalDate semanaInicio,
    int totalPlanejado,
    int totalRealizado,
    int percentual
) {}

// novo — resumo do plano mais recente (qualquer status)
public record PlanoVigenteDto(
    UUID planoId,
    LocalDate semanaInicio,
    LocalDate semanaFim,
    PlanoReviewStatus reviewStatus,  // APROVADO | AGUARDANDO_REVISAO | REJEITADO
    List<TreinoPlanejadoResumoDto> treinos  // vazio quando reviewStatus != APROVADO
) {}

public record TreinoPlanejadoResumoDto(
    String diaSemana,
    String tipoTreino,
    double distanciaKm,
    // Valores reais do enum TreinoExecucaoStatus (NÃO "PLANEJADO" — não existe):
    // "PENDENTE" | "CONCLUIDO" | "REALIZADO" | "PERDIDO" | "PARCIAL" | "LIVRE"
    String statusExecucao
) {}

// projeções dos DTOs existentes (evitar re-expor objetos pesados)
public record SinalRecenteDto(
    MotivoAtencao motivo,
    Severidade severidade,
    Instant geradoEm,
    String acaoSugerida,
    UUID sugestaoId  // nullable — preenchido se existe sugestão associada ao sinal (match por motivo/data)
) {}

public record SugestaoRecenteDto(
    UUID id,
    TipoSugestao tipo,
    StatusSugestao status,
    Instant criadoEm
) {}
```

---

## Estrutura de serviço

```
CoachAthleteProfileController
    └── CoachAthleteProfileService (interface)
            └── CoachAthleteProfileServiceImpl
                    ├── AtletaProgressService     (PMC, recordes, aderência — novo método)
                    ├── CoachAttentionQueueService (sinais — filtrar por atletaId em memória)
                    ├── SugestaoCoachService       (sugestões — filtrar por atletaId em memória)
                    ├── PlanoSemanalRepository     (plano vigente — query por atletaId + status APROVADO)
                    └── AtletaRepository            (dados cadastrais — findByIdAndTenantId)
```

---

## Frontend

### Hook

```typescript
// src/hooks/useAthleteProfile.ts
export const useAthleteProfile = (atletaId: string) => {
    const [profile, setProfile] = useState<AtletaPerfilCoachDto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    
    const fetchProfile = useCallback(async () => { ... }, [atletaId]);
    
    useEffect(() => { fetchProfile(); }, [fetchProfile]);
    
    return { profile, isLoading, error, refetch: fetchProfile };
};
```

### Reutilização de componentes existentes

| Componente | Localização | Uso |
|---|---|---|
| `PMCChart` | `features/athlete/components/PMCChart.tsx` | Bloco 1 — copiar props `data: PMCDataPoint[]` |
| `SeverityChip` | `features/coach/components/` | Sinais recentes — chip de severidade |
| `SuggestionTypeBadge` | `features/coach/components/` | Sugestões recentes — tipo |
| `CoachAthleteAvatar` | `features/coach/components/` | Cabeçalho — avatar |

### Navegação

- `CoachAthletesPage` (roster): `<DataGrid onRowClick={(row) => navigate('/coach/athletes/' + row.id)} />`
- Rota: `App.tsx` — `/coach/athletes/:atletaId` → lazy `CoachAthleteProfilePage`

---

## Sem novas migrações

O endpoint agrega dados já persistidos. Nenhuma nova tabela ou coluna.

---

## Performance e resiliência

- Sub-serviços invocados em sequência no v1. **Logging de duração por sub-serviço** (não só para o método inteiro) — obrigatório para identificar gargalos em prod sem refactor.
- Se p95 > 1.5s em staging com dados reais → migrar para `CompletableFuture.allOf` antes do lançamento (PMC, recordes, aderência, sinais, sugestões e plano são todos independentes). Se adotar paralelismo: propagar `TenantContext` para cada thread filho manualmente (`UUID tenantId = TenantContext.getRequiredTenantId(); CompletableFuture.supplyAsync(() -> { TenantContext.setTenantId(tenantId); ... })`).
- Frontend: distinguir erro de timeout (HTTP 504/408) de 404 no `useAthleteProfile` — exibir "Perfil demorou para carregar, tente novamente" em vez de erro genérico.
- Cache: não no v1.

## Premissas a verificar antes de implementar (Seção 0 do tasks.md)

| # | Premissa | Onde verificar |
|---|---|---|
| 0.1 | `PMCChart` aceita `data: PMCDataPoint[]` como prop pura (sem fetch interno) | Ler `PMCChart.tsx` props e verificar ausência de `useEffect` + fetch |
| 0.2 | `TreinoRealizado` tem campo `treinoPlanejadoId UUID` com FK → join direto | Ler entidade `TreinoRealizado.java` |
| 0.3 | `TreinoExecucaoStatus` — valores reais do enum (não tem `PLANEJADO`) | Ler `TreinoExecucaoStatus.java` |
| 0.4 | `SugestaoCoachService.listar(status)` — volume estimado (paginação ou lista completa) | Ler `SugestaoCoachServiceImpl` e `SugestaoCoachRepository` |
| 0.5 | `CoachAthletesPage` — estrutura do componente de lista/grid para adicionar `onRowClick` | Ler `CoachAthletesPage.tsx` |
| 0.6 | `CoachAthleteAvatar` aceita `nome: string` como prop sem dependência de contexto externo | Ler props do componente |

---

## Multi-tenancy

1. `CoachAthleteProfileController`: `TenantContext.getRequiredTenantId()` no método.
2. `CoachAthleteProfileServiceImpl.buscarPerfil(atletaId, tenantId)`:
   - Valida `atletaId` pertence ao tenant via `atletaRepository.findByIdAndTenantId(atletaId, tenantId).orElseThrow(...)`.
   - Repassa `tenantId` para sub-serviços que aceitam (PMC, recordes, aderência).
   - Para sinais e sugestões: filtra por `atletaId` em memória (já são tenant-scoped via `TenantContext`).

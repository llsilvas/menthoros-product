# Design — coach-encerrar-semana

## Contexto e restrições

- Reusa o domínio existente: enum `TreinoExecucaoStatus` (`PENDENTE`, `PERDIDO`, `REALIZADO`, ...),
  `PlanoStatus` (`... CONCLUIDO`), `TreinoPlanejado.statusTreino`, `PlanoSemanal` (`semanaInicio`,
  `semanaFim`, `status`, `atleta`, `tenantId`).
- A transição unitária `PENDENTE → PERDIDO` já existe em `TreinoServiceImpl.marcarTreinoPerdido()`
  (rejeita `REALIZADO`, idempotente em `PERDIDO`, chama `atualizarStatusDoPlano()`). O encerramento
  **orquestra** essa transição em lote — não reimplementa a regra.
- `atualizarStatusDoPlano()` já deriva `CONCLUIDO` quando `realizados + perdidos == total`. Portanto
  fechar o plano é consequência de marcar os pendentes, não um segundo passo manual.
- Schedulers rodam fora do escopo de request → **não há `TenantContext`**. Seguir o padrão do
  `StravaActivitySyncScheduler`: iterar e setar/limpar `TenantContext` por iteração.

## Arquitetura

Uma **regra de domínio única** com dois gatilhos, mantendo o `*ServiceImpl` como orquestrador fino.

```
                       ┌─────────────────────────────────────────┐
  Coach (on-demand)    │  EncerramentoSemanaService              │
  POST .../encerrar ──▶│    encerrarSemana(planoId, aplicarCar.) │──▶ TreinoService.marcarTreinoPerdido(each)
                       │                                          │──▶ (atualizarStatusDoPlano → CONCLUIDO)
  Scheduler (fallback) │                                          │──▶ publish SemanaEncerradaEvent
  cron diário ────────▶│    encerrarPlanosElegiveis()             │
                       └─────────────────────────────────────────┘
```

- **`EncerramentoSemanaService`** (interface + impl): concentra a regra. Métodos:
  - `EncerramentoSemanaResultado encerrarSemana(UUID planoId)` — on-demand, um atleta, **sem** carência.
  - `EncerramentoLoteResultado encerrarSemanaLoteAssessoria(LocalDate hoje)` — on-demand, todos os atletas do tenant corrente, **sem** carência.
  - `int encerrarPlanosElegiveis(LocalDate hoje)` — fluxo automático, aplica carência; retorna nº de planos fechados.
  - Helper privado `finalizarPendentes(PlanoSemanal plano, LocalDate hoje)` — núcleo compartilhado (aplica a regra de elegibilidade plano-aware: passados sempre; o dia corrente só quando `hoje == plano.semanaFim`).
- **`EncerramentoSemanaScheduler`**: só agenda e itera tenants/planos; delega ao service. Nada de regra aqui.
- **Endpoints** no controller de plano do coach: `POST .../planos/{planoId}/encerrar-semana` (individual) e `POST .../semanas/encerrar-lote` (assessoria).

### Encerramento em lote da assessoria

`encerrarSemanaLoteAssessoria(hoje)` roda **em escopo de request** (o `TenantContext` já está populado pelo
`JwtTenantFilter`). Passos:
1. Buscar os atletas do tenant via `AtletaRepository` **tenant-scoped** (`assessoria.id = getRequiredTenantId()`).
   **Não** confiar em query sem filtro de tenant (defesa em profundidade — ver Risco T1).
2. Para cada atleta, resolver a **semana corrente** por uma query **tenant-scoped** e resiliente a sobreposição
   (`... WHERE ps.assessoria.id = :tenantId AND :hoje BETWEEN ps.semanaInicio AND ps.semanaFim ORDER BY ps.semanaInicio DESC LIMIT 1`).
   `findByAtletaIdAndSemana` atual **não** é tenant-scoped e retorna `Optional` (estoura em sobreposição) — não usar como está.
3. Para cada plano não `CONCLUIDO`, encerrar **numa transação própria por atleta** (ver "Fronteira transacional"),
   classificando o resultado em três baldes: **processado**, **sem-plano (ignorado)**, **falha** (record tipado).
   O método do loop **não** é `@Transactional`. Não há carência (ação explícita do treinador).
4. Retornar `EncerramentoLoteResultado` com lista por atleta + totais + falhas tipadas.

> O lote **não** cruza tenants: itera só atletas do `TenantContext` corrente E cada query é tenant-scoped
> (critério 12). Diferente do scheduler automático — que roda **fora** de request e itera/set `TenantContext` por tenant.

### Fronteira transacional (crítico)

`atualizarStatusDoPlano` e `marcarTreinoPerdido` já são `@Transactional`. Para o **lote** ter falha/commit
isolado por atleta (critério 13), o encerramento de **um** atleta precisa rodar em transação independente:

- Extrair `encerrarUmAtleta(...)` para um **bean Spring separado** (`EncerramentoAtletaTransacional`) anotado
  `@Transactional(propagation = REQUIRES_NEW)` — chamada via proxy, **não** self-invocation (senão o proxy é
  ignorado e o lote inteiro compartilha uma TX; a primeira falha marca rollback-only e apodrece todos os `save`
  seguintes com `UnexpectedRollbackException`).
- O método do loop captura a exceção de cada atleta, contabiliza como falha e **continua**.
- Alternativa equivalente: `TransactionTemplate` com nova transação por atleta (padrão já usado no `FitTreinoPersister`).

### Publicação do evento (após commit)

`SemanaEncerradaEvent` SHALL ser consumido via `@TransactionalEventListener(phase = AFTER_COMMIT)`. Publicar
dentro da TX + `@EventListener` síncrono entregaria o evento mesmo se a TX do atleta desse rollback (optimistic
lock, falha em treino posterior) — o primeiro consumidor (`coach-batch-plan-generation`) geraria plano sobre um
encerramento não commitado. Fixado no contrato para o consumidor futuro não reintroduzir o bug.

### Diferença on-demand vs automático

| Aspecto | On-demand (coach) | Automático (scheduler) |
|---|---|---|
| Gatilho | Ação explícita do treinador | `@Scheduled` diário |
| Carência | **Não** aplica | Só planos com `semanaFim <= hoje - 3d` |
| Seleção | 1 plano (`planoId`) | Todos os planos não-`CONCLUIDO` elegíveis, por tenant |
| Autoridade | Treinador decide | Rede de segurança |

Ambos passam pelo mesmo `finalizarPendentesPassados`; a **carência é decidida antes** de entrar no núcleo
(o on-demand chama sem filtro de carência; o automático só seleciona planos já fora da carência).

## Regras de elegibilidade

- **Treino elegível a `PERDIDO`** (on-demand individual e lote):
  `statusTreino == PENDENTE` **E** (`dataTreino < hoje` **OU** (`dataTreino == hoje` **E** `hoje == plano.semanaFim`)).
  - **Fim da semana (domingo, `hoje == semanaFim`)**: inclui o dia corrente → o longão de sábado **e** o de
    domingo entram. Atende o fluxo principal do treinador.
  - **Meio da semana (`hoje < semanaFim`)**: só os **estritamente passados** viram `PERDIDO`; o treino de
    **hoje** fica `PENDENTE` (o atleta ainda pode treinar à noite) e os futuros também. O plano não fecha e o
    resultado retorna `aviso`. Evita a agressão de "matar" o treino do dia num fechamento antecipado.
  - Estritamente futuro (`dataTreino > hoje`) nunca é marcado.
  - A query traz `PENDENTE` com `dataTreino <= hoje`; a **inclusão do dia corrente é decidida no service**
    (plano-aware: só quando `hoje == semanaFim`). No fallback automático `hoje > semanaFim`, então a condição
    do dia corrente é sempre falsa e a regra recai em `dataTreino < hoje` — consistente.
- **Plano elegível ao fallback automático**: `status != CONCLUIDO` **E** `semanaFim <= hoje.minusDays(3)`.
  - Carência medida por `semanaFim` (a semana inteira já passou + 3 dias). A essa altura todo `PENDENTE`
    tem `dataTreino <= hoje`, então a mesma regra `finalizarPendentes` se aplica sem tocar futuros.

- **Origem de `hoje` (fuso — crítico)**: `hoje` SHALL ser derivado de um único ponto com zona explícita
  (`America/Sao_Paulo`), via `Clock` injetável (`LocalDate.now(clock)`), **ou** as queries de elegibilidade
  usam `CURRENT_DATE` do banco. `LocalDate.now()` sem zona usa o fuso do JVM (UTC no container) → domingo 22h BRT
  = segunda 01h UTC → o treino de segunda (semana seguinte) satisfaria `dataTreino <= hoje` e seria marcado
  `PERDIDO` indevidamente. Há precedente na base: `findMostRecentRelevantPlano` usa `CURRENT_DATE` "para evitar
  divergência de fuso". O `@Scheduled` SHALL fixar `zone = "America/Sao_Paulo"`.

- **Fechamento de plano sem elegíveis / vazio**: `atualizarStatusDoPlano` atual manda `total == 0` para
  `PLANEJADO` (nunca `CONCLUIDO`). Sem tratamento, um plano vazio ou só-com-futuros seria re-selecionado pelo
  fallback **todo dia, para sempre**. Regra: quando não há `PENDENTE` com `dataTreino <= hoje` a finalizar e o
  plano já passou (`semanaFim < hoje` no automático; carência decorrida), o encerramento SHALL marcar `CONCLUIDO`
  explicitamente (ou o fallback exclui o plano da seleção). No **on-demand no meio da semana** (`semanaFim > hoje`
  com treinos futuros), o plano **não** fecha e o resultado retorna um `aviso` ("semana ainda não terminou; N
  treinos futuros permanecem PENDENTE") — evita o "cliquei e nada aconteceu" e o comportamento-surpresa.

- **Corrida `PENDENTE → REALIZADO` durante o encerramento**: entre o `SELECT` dos pendentes e o
  `marcarTreinoPerdido(each)`, o atleta pode registrar retroativo (vira `REALIZADO`) e `marcarTreinoPerdido`
  rejeita `REALIZADO` lançando. O núcleo SHALL **pular** (não lançar) um treino que já não está `PENDENTE` no
  momento do update (re-checar status ou capturar a rejeição por-treino como "ignorado"), para uma corrida não
  derrubar o encerramento inteiro do atleta. Semântica: "última escrita vence, reprocesso idempotente".

## Novas queries

`TreinoPlanejadoRepository`:
```java
// pendentes até hoje (inclusive) de um plano específico
@Query("""
    SELECT tp FROM TreinoPlanejado tp
    WHERE tp.planoSemanal.id = :planoId
      AND tp.statusTreino = br.com.menthoros.backend.enums.TreinoExecucaoStatus.PENDENTE
      AND tp.dataTreino <= :hoje
""")
List<TreinoPlanejado> findPendentesAteHojeDoPlano(UUID planoId, LocalDate hoje);
```

`PlanoSemanalRepository` (usar `@Query` com `ps.assessoria.id`, seguindo a convenção do repo — o método
derivado `findByTenantId...` **não** compila/destoa, pois `PlanoSemanal` expõe o tenant via `assessoria`):
```java
// semana corrente de um atleta, tenant-scoped e resiliente a sobreposição
@Query("""
    SELECT ps FROM PlanoSemanal ps
    WHERE ps.atleta.id = :atletaId AND ps.assessoria.id = :tenantId
      AND :hoje BETWEEN ps.semanaInicio AND ps.semanaFim
    ORDER BY ps.semanaInicio DESC
""")
List<PlanoSemanal> findSemanaCorrente(UUID atletaId, UUID tenantId, LocalDate hoje); // usar o primeiro

// planos elegíveis ao fallback automático (por tenant, fora da carência)
@Query("""
    SELECT ps FROM PlanoSemanal ps
    WHERE ps.assessoria.id = :tenantId
      AND ps.status <> br.com.menthoros.backend.enums.PlanoStatus.CONCLUIDO
      AND ps.semanaFim <= :limiteCarencia
""")
List<PlanoSemanal> findElegiveisFallback(UUID tenantId, LocalDate limiteCarencia); // limiteCarencia = hoje - 3d
```

## Contratos

Endpoint on-demand:
- `POST /api/v1/coach/planos/{planoId}/encerrar-semana`
- Auth: `@PreAuthorize` de coach/admin + `@RequireTenant(resourceParamIndex = 0)` (valida que o plano é do tenant).
- 200 → `EncerramentoSemanaOutputDto` (record):
  ```java
  public record EncerramentoSemanaOutputDto(
      UUID planoId,
      PlanoStatus novoStatus,
      int treinosFinalizados,
      List<UUID> treinosPerdidos,
      boolean prontoParaProximaSemana,  // novoStatus == CONCLUIDO
      OrigemEncerramento origem,        // ON_DEMAND | AUTOMATICO — a UI lê daqui, sem endpoint extra
      String aviso                      // preenchido no meio da semana (semanaFim > hoje); null caso contrário
  ) {}
  ```
- 404 se o plano não existe/não é do tenant (via `@RequireTenant`).

Endpoint em lote (assessoria):
- `POST /api/v1/coach/semanas/encerrar-lote`
- Auth: `@PreAuthorize` de coach/admin. **Sem `@RequireTenant`** (não há id de recurso único; opera sobre
  todos os atletas do `TenantContext` corrente).
- 200 → `EncerramentoLoteOutputDto` (record) com falhas **tipadas** (não `List<String>`):
  ```java
  public record EncerramentoLoteOutputDto(
      int atletasProcessados,      // tinham semana corrente e foram encerrados
      int atletasSemPlano,         // sem semana corrente — ignorados (não é falha)
      int planosConcluidos,
      int treinosPerdidosTotal,
      List<EncerramentoSemanaOutputDto> resultados,
      List<FalhaAtleta> falhas
  ) {}
  public record FalhaAtleta(UUID atletaId, String motivo) {}
  ```

Endpoint de **preview / dry-run** (confiança no lote — sem persistir nada):
- `POST /api/v1/coach/semanas/encerrar-lote/preview` (e opcionalmente `.../planos/{planoId}/encerrar-semana/preview`)
- Executa a mesma seleção e **calcula** o impacto (quantos treinos por atleta seriam marcados `PERDIDO`, quais
  planos fechariam) **sem** gravar. `@Transactional(readOnly = true)`.
- 200 → mesmo shape do `EncerramentoLoteOutputDto`, porém rotulado como projeção. Permite ao front mostrar
  "vou marcar 23 treinos como perdidos para 8 atletas — confirmar?" antes do disparo real.

### Migration (`origem_encerramento`)

```sql
-- V<next>__add_origem_encerramento_plano_semanal.sql
ALTER TABLE tb_plano_semanal
  ADD COLUMN origem_encerramento VARCHAR(15);
-- Nullable, sem default — planos encerrados antes desta change ficam NULL (não fabricar dado).
-- Populada pelo service no momento do encerramento (ON_DEMAND ou AUTOMATICO).
```

Mapeamento JPA em `PlanoSemanal`:
```java
@Column(name = "origem_encerramento", length = 15)
@Enumerated(EnumType.STRING)
private OrigemEncerramento origemEncerramento;  // nullable — planos pré-existentes
```

O service seta `plano.setOrigemEncerramento(origem)` **antes** de `save` — dentro da mesma TX do
encerramento. Sem endpoint de leitura dedicado: as queries que já trazem `PlanoSemanal` (roster,
perfil, fila de atenção) passam a expor o campo naturalmente via DTO.

### Carência parametrizável

```yaml
# application.yml
menthoros:
  encerramento-semana:
    enabled: true
    cron: "0 30 3 * * *"
    carencia-dias: 3        # default; override por assessoria é follow-up
```

O `EncerramentoSemanaScheduler` lê `@Value("${menthoros.encerramento-semana.carencia-dias:3}")` e
passa `hoje.minusDays(carenciaDias)` ao `findElegiveisFallback`. A query **não** embute o literal `3`
— recebe `:limiteCarencia` como parâmetro (já está assim no design original).

Evento:
```java
public record SemanaEncerradaEvent(
    UUID planoId, UUID atletaId, UUID tenantId, int treinosPerdidos,
    OrigemEncerramento origem   // ON_DEMAND (coach) | AUTOMATICO (scheduler)
) {}
public enum OrigemEncerramento { ON_DEMAND, AUTOMATICO }
```
Publicado após o fechamento. **Nenhum listener nesta change dispara geração** — apenas um ponto de extensão
para `coach-batch-plan-generation` / revisão semanal reagirem no futuro. O campo `origem` também vai no
`EncerramentoSemanaOutputDto` (resposta imediata da ação → a UI lê direto, sem endpoint extra). Distinguir a
origem em **leituras posteriores** (fila/dashboard de um plano já fechado) exigiria **persistir** `origem` no
`PlanoSemanal` — isso é uma coluna nova (schema) e fica **fora do MVP**: no MVP o coach vê a origem na resposta
da ação; a marcação persistente em telas de leitura é follow-up. O **digest/notificação ativa** ("3 semanas
fechadas automaticamente") é responsabilidade de `add-weekly-athlete-review`, não desta change.

## Scheduler

```java
@Scheduled(cron = "${menthoros.encerramento-semana.cron:0 30 3 * * *}", zone = "America/Sao_Paulo")
public void encerrarSemanasVencidas() { ... }  // 03h30 BRT, configurável
```
- Feature-flag/desligável via property (`menthoros.encerramento-semana.enabled`, default true).
- **Fonte dos tenants**: `AssessoriaRepository.findByAtivoTrue()` (nomear explicitamente, não "iterar tenants ativos" genérico).
- Para cada tenant: `TenantContext.setTenantId(id)` dentro do `try`, chama o encerramento, `TenantContext.clear()`
  no `finally` (padrão `StravaActivitySyncScheduler`). O `finally` é obrigatório: schedulers rodam em **pool de
  threads reutilizadas**; se uma iteração lançar antes do `clear()`, o `TenantContext` (ThreadLocal) vaza para o
  próximo tenant/tarefa. Teste de isolamento (critério 8) SHALL reproduzir uma iteração que lança e verificar que
  a seguinte roda com o tenant correto.
- **Fonte única de tenant**: escolher UMA — o método interno lê de `TenantContext` **ou** recebe `tenantId` por
  parâmetro, nunca os dois (o design anterior setava `TenantContext` do tenant A e passava `tenantId` à query:
  duas fontes que podem divergir). A query `findElegiveisFallback(tenantId, ...)` recebe o `tenantId` explícito →
  o service passa `getRequiredTenantId()`; sem `TenantContext` redundante em métodos que já recebem o parâmetro.
- **Pool dedicado**: `@Scheduled` usa por padrão 1 thread compartilhada com o `StravaActivitySyncScheduler`
  (`PT2H`). Um lote diário longo bloquearia a sync do Strava e a própria próxima execução. Configurar um
  `TaskScheduler`/pool > 1 ou serializar conscientemente (decisão registrada, não acidental).

## Reversibilidade (PERDIDO → REALIZADO)

`registrarTreinoManualAtleta` / `marcar-realizado` hoje promovem `PENDENTE/PARCIAL/LIVRE → REALIZADO`. É preciso
**garantir que `PERDIDO` também seja promovível** ao registrar retroativo (senão um encerramento tornaria o
treino imutável). Task dedicada + teste cobrindo a transição.

## Riscos e mitigações

Índice consolidado (product-review + pré-mortem adversarial aterrado no código). `[A]`lta / `[M]`édia / `[B]`aixa.

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| T1 | **"Transação por atleta" é ilusão** (self-invocation / `@Transactional` no loop → 1 TX; 1ª falha vira rollback-only e apodrece o lote) | A | Bean separado `@Transactional(REQUIRES_NEW)` ou `TransactionTemplate`; loop **não** transacional. Ver "Fronteira transacional". Teste verifica **commit real** de N-1 quando o N-ésimo falha. |
| T2 | **Fuso: `LocalDate.now()` sem zona** marca treino da semana seguinte como `PERDIDO` (domingo 22h BRT = seg 01h UTC) | A | `hoje` de fonte única com zona (`America/Sao_Paulo`, `Clock` injetável) ou `CURRENT_DATE`; `@Scheduled(zone=...)`. Ver "Regras de elegibilidade". |
| T3 | **Isolamento de tenant frágil**: `findByAtletaIdAndSemana` **não** é tenant-scoped; query derivada `findByTenantId...` destoa/não compila | A | Atletas via `AtletaRepository` tenant-scoped; queries de plano com `ps.assessoria.id = :tenantId` (`@Query`); teste negativo cross-tenant. |
| T4 | **Corrida `PENDENTE→REALIZADO`** durante o encerramento derruba o atleta / optimistic lock (`@Version`) | A/M | Núcleo **pula** treino que já não é `PENDENTE` (não lança); semântica "última escrita vence, idempotente"; teste de concorrência. |
| T5 | **Evento antes do commit** (`@EventListener` síncrono na TX) → consumidor gera plano sobre encerramento revertido | M | `@TransactionalEventListener(AFTER_COMMIT)`, fixado no contrato. Ver "Publicação do evento". |
| T6 | **Plano vazio / só-futuros nunca vira `CONCLUIDO`** → fallback reprocessa todo dia; on-demand "não faz nada" | M | Tratar `total == 0`/sem-elegíveis como fechamento explícito quando o plano já passou; on-demand no meio da semana retorna `aviso`. |
| T7 | **Enumeração de tenants + fonte dupla de tenant + pool single-thread** compartilhado com a sync do Strava | M | `AssessoriaRepository.findByAtivoTrue()`; **uma** fonte de tenant; `TaskScheduler` dedicado/pool > 1. |
| T8 | **Semântica de reporte subespecificada** (atleta sem plano? sobreposição de semanas → `Optional` estoura; `List<String>` frágil) | B/M | Três baldes (processado/sem-plano/falha); query resiliente (`ORDER BY ... LIMIT 1`); `FalhaAtleta` record tipado. |
| P1 | **Lote sem preview** = risco de confiança / adoção (muta dezenas num clique, sem ver o impacto) | A(produto) | Endpoint `.../encerrar-lote/preview` (dry-run, `readOnly`) retornando o impacto antes de confirmar. |
| P2 | **Fallback automático invisível** ao coach enfraquece a consciência situacional | M(produto) | Resumo pós-job ao coach via `SemanaEncerradaEvent` (Open Question — dono a definir). |
| — | Falso "perdido" (atleta esqueceu de registrar) | — | Carência de 3 dias no automático; on-demand explícito; reversibilidade `PERDIDO→REALIZADO`. |
| — | Encerrar "sequestra" o treinador (coach-in-the-loop) | — | Não gera o próximo plano; só evento + `CONCLUIDO`; geração segue disparada pelo coach. |

## Alternativas descartadas

- **Só scheduler, sem ação do coach**: não atende o pedido explícito ("o treinador pode pedir para encerrar")
  e enfraquece o coach-in-the-loop.
- **Só endpoint, sem fallback**: deixaria semanas de coaches menos ativos presas em `EM_ANDAMENTO`; a métrica
  de "% de planos que fecham" não seria atingida.
- **Auto-gerar a próxima semana no encerramento**: viola a estrela-guia (IA propõe, coach aprova).

# Tasks: coach-batch-plan-generation

**Status:** Proposed
**Sprint:** Sprint 12 (desbloqueada — dependência de `add-llm-tool-use` removida, SPRINTS.md 2026-07-06)
**Tamanho:** M · Trilha: Full
**Repos:** menthoros-backend + menthoros-front
**Dependências:** `add-coach-shell-dashboards` (concluída), `coach-edit-planned-workout` (concluída)

---

## Bloco 1 — Backend: Infraestrutura do job assíncrono

### 1.1 Migration (V52)

- [x] 1.1.a Confirmar que V51 (`V51__add_origem_encerramento_plano_semanal.sql`) continua sendo a última migration aplicada (`ls db/migration/ | sort -V | tail -3`) — se outra change avançou a numeração, ajustar para a próxima disponível. **Pré-check do índice único:** antes de criar o índice parcial em `tb_plano_semanal`, verificar que não há duplicatas ativas no dado atual:
  ```sql
  SELECT atleta_id, semana_inicio,
         COUNT(*) FILTER (WHERE review_status <> 'REJEITADO') AS ativos
  FROM tb_plano_semanal
  GROUP BY atleta_id, semana_inicio
  HAVING COUNT(*) FILTER (WHERE review_status <> 'REJEITADO') > 1;
  ```
  Se retornar linhas, limpar/consolidar antes (decidir no momento — não há caminho automático seguro).
- [x] 1.1.b Criar `V52__Create_tb_batch_plan_job.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS tb_batch_plan_job (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      status          VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
      total_atletas   INT NOT NULL,
      gerados         INT NOT NULL DEFAULT 0,
      erros           INT NOT NULL DEFAULT 0,
      criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      concluido_em    TIMESTAMPTZ,
      resultado       JSONB,
      CONSTRAINT chk_batch_job_status CHECK (
          status IN ('PENDENTE','EM_PROGRESSO','CONCLUIDO','CONCLUIDO_COM_ERROS')
      )
  );
  CREATE INDEX IF NOT EXISTS idx_batch_plan_job_tenant ON tb_batch_plan_job(tenant_id);

  -- Guarda autoritativa contra planos duplicados (corrida TOCTOU entre lotes concorrentes com o mesmo atleta):
  CREATE UNIQUE INDEX IF NOT EXISTS uk_plano_semanal_atleta_semana_ativo
      ON tb_plano_semanal (atleta_id, semana_inicio)
      WHERE review_status <> 'REJEITADO';

  DO $$ BEGIN RAISE NOTICE '✅ V52 - tb_batch_plan_job + índice único de plano ativo criados'; END$$;
  ```
- [x] 1.1.c Validação: `./mvnw flyway:info` sem conflito; a migration aplica sem violar o índice único (depende do pré-check 1.1.a). `verify:` `./mvnw flyway:migrate` local em base com dado de dev, sem erro de duplicidade.

### 1.2 Enum, entidade e repositório do job

- [x] 1.2.a Criar enum `BatchJobStatus` (PENDENTE, EM_PROGRESSO, CONCLUIDO, CONCLUIDO_COM_ERROS).
- [x] 1.2.b Criar entidade `BatchPlanJob` com campos: `id`, `tenantId`, `status`, `totalAtletas`, `gerados`, `erros`, `criadoEm`, `concluidoEm`, `resultado` (String/JSON).
- [x] 1.2.c Criar `BatchPlanJobRepository` com:
  - `findByIdAndTenantId(UUID id, UUID tenantId)` — para o GET de status.
  - **Updates atômicos, sem leitura + reatribuição em memória** (evita race condition entre virtual threads concorrentes escrevendo no mesmo job):
    ```java
    @Modifying
    @Query("UPDATE BatchPlanJob b SET b.gerados = b.gerados + 1 WHERE b.id = :id")
    void incrementarGerados(@Param("id") UUID id);

    @Modifying
    @Query("UPDATE BatchPlanJob b SET b.erros = b.erros + 1 WHERE b.id = :id")
    void incrementarErros(@Param("id") UUID id);
    ```
- [x] 1.2.d Validação: `./mvnw clean compile`.
- [x] 1.2.e Métodos de repositório para o fast-path do processador (verificados contra o código real — **não existem hoje**):
  - `PlanoSemanalRepository`: adicionar `boolean existsByAtletaIdAndSemanaInicioAndReviewStatusNot(UUID atletaId, LocalDate semanaInicio, PlanoReviewStatus status)` (derived query; `reviewStatus` é `@Enumerated(EnumType.STRING)` → comparação por nome, casa com o índice parcial `WHERE review_status <> 'REJEITADO'`). O repo já tem `findByAtletaIdAndSemanaInicio(...)` (`:35`) mas não a variante `exists...Not`.
  - Validação de tenant do atleta: **reutilizar** `AtletaRepository.findByIdAndTenantId(atletaId, tenantId)` (`:74`, retorna `Optional<Atleta>`) com `.isEmpty()` — **não existe** `existsByIdAndTenantId`; o tenant é resolvido via `atleta.assessoria.id` no `@Query` existente.
  - `verify:` `./mvnw clean compile` — os derived queries resolvem sem erro de mapeamento.

### 1.3 DTOs

- [x] 1.3.a Criar `BatchGeracaoPlanoInputDto` (record em `dto/input/`):
  ```java
  public record BatchGeracaoPlanoInputDto(
      @NotEmpty @Size(min = 1, max = 20) List<UUID> atletaIds,
      ModoGeracaoPlano modo
  ) {}
  ```
  Valor default de `modo` via `@JsonProperty` ou construtor compacto com default `PROXIMA_SEMANA`.
- [x] 1.3.b Criar `BatchJobStatusOutputDto` (record em `dto/output/`) com: `UUID jobId`, `BatchJobStatus status`, `int totalAtletas`, `int gerados`, `int erros`, `List<BatchGeradoItemDto> geradosDetalhes`, `List<BatchErroItemDto> errosDetalhes`.
- [x] 1.3.c Criar records aninhados `BatchGeradoItemDto(UUID atletaId, UUID planoId, String atletaNome)` e `BatchErroItemDto(UUID atletaId, String motivo)`.
- [x] 1.3.d Validação: `./mvnw clean compile`.

### 1.4 `BatchPlanAsyncConfig` — executor de virtual threads

- [x] 1.4.a Criar `BatchPlanAsyncConfig.java` em `config/external/` (onde vivem as async configs existentes — `config/external/StravaWebhookAsyncConfig.java:10` e `config/external/WorkoutAnalysisAsyncConfig.java:14`; nome segue a convenção — uma config por feature, não um `AsyncConfig` genérico). Nota: `WorkoutAnalysisAsyncConfig` não repete `@EnableAsync` (basta uma vez no contexto) — como `StravaWebhookAsyncConfig` já declara `@EnableAsync`, confirmar se é necessário repetir em `BatchPlanAsyncConfig` ou se o contexto já o tem ativo:
  ```java
  @Configuration
  @EnableAsync
  public class BatchPlanAsyncConfig {
      @Bean("batchPlanExecutor")
      public Executor batchPlanExecutor() {
          return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
      }
  }
  ```
  Sem pool dimensionado (core/max/queue) — cada atleta roda em sua própria virtual thread, tarefa I/O-bound (chamada ao LLM).
- [x] 1.4.b Criar `LlmConcurrencyLimiter` (`@Component`) com `Semaphore` para limitar chamadas *reais* ao LLM (independente do nº de virtual threads):
  ```java
  @Component
  public class LlmConcurrencyLimiter {
      private final Semaphore semaphore;

      public LlmConcurrencyLimiter(@Value("${app.batch-plan.llm-concorrencia:4}") int permits) {
          this.semaphore = new Semaphore(permits);
      }

      public <T> T executar(Supplier<T> chamadaLlm) throws InterruptedException {
          semaphore.acquire();
          try {
              return chamadaLlm.get();
          } finally {
              semaphore.release();
          }
      }
  }
  ```
- [x] 1.4.c Adicionar `app.batch-plan.llm-concorrencia: 4` em `application.yml`.
- [x] 1.4.d Validação: `./mvnw clean compile`.

### 1.5 Service: `BatchPlanService`

- [ ] 1.5.a Criar interface `BatchPlanService`:
  ```java
  UUID iniciarLote(BatchGeracaoPlanoInputDto input, UUID tenantId);
  BatchJobStatusOutputDto consultarStatus(UUID jobId, UUID tenantId);
  ```
- [ ] 1.5.b Criar `BatchPlanServiceImpl`:
  - `iniciarLote`: **deduplicar `atletaIds`** (`input.atletaIds().stream().distinct().toList()`) antes de qualquer coisa — evita tasks concorrentes para o mesmo atleta e `total_atletas` inflado (dedup silenciosa, não é erro de input; a validação `@Size(max=20)` já rodou sobre a lista original no controller). Capturar o `tenantId` do `TenantContext` **aqui, na thread HTTP síncrona** (não dentro do fluxo async). Criar `BatchPlanJob` (status PENDENTE, `totalAtletas` = tamanho da lista distinta), persistir, chamar método `@Async` **em um bean separado** (nunca self-invocation na mesma classe — chamada interna `this.processarLote(...)` não passa pelo proxy Spring e o `@Async` seria ignorado silenciosamente, rodando síncrono na thread HTTP e quebrando o CA1 sem erro visível). Extrair `processarLote` para um componente dedicado (ex.: `BatchPlanProcessor`) injetado no service, ou usar auto-injeção via `@Lazy` do próprio proxy — preferir o componente separado, mais explícito.
  - `BatchPlanProcessor.processarLote(UUID jobId, List<UUID> atletaIds, ModoGeracaoPlano modo, UUID tenantId)`, anotado `@Async("batchPlanExecutor")`:
    - **`TenantContext.setTenantId(tenantId)` no início do método externo, `clear()` no `finally` que envolve todo o processamento** — o método async roda em virtual thread própria (não na HTTP), não herda o ThreadLocal, e executa queries tenant-aware fora das subtasks (transição para EM_PROGRESSO, gravação de `resultado`, fechamento). Isto é adicional ao set/clear por subtask (abaixo): são dois níveis de propagação.
    - Atualizar job para EM_PROGRESSO.
    - Submeter **todas as N tasks de uma vez** (uma virtual thread por atleta, sem chunking sequencial nem barreira `allOf().join()` por grupo) — o progresso deve refletir a ordem real de resposta do LLM, não saltos de bloco.
    - Cada task individual:
      - `TenantContext.setTenantId(tenantId)` no início; `TenantContext.clear()` no `finally` (ThreadLocal puro não sobrevive ao handoff assíncrono — virtual thread também não herda; setar manualmente é obrigatório, mesmo padrão do `EncerramentoSemanaScheduler`).
      - Validar que atleta pertence ao tenant: `atletaRepository.findByIdAndTenantId(atletaId, tenantId).isEmpty()` (método existente `:74`; **não** há `existsByIdAndTenantId`) → se vazio, registrar erro `"Atleta não encontrado"`.
      - Verificar plano duplicado (fast-path, best-effort): `planoSemanalRepository.existsByAtletaIdAndSemanaInicioAndReviewStatusNot(atletaId, semanaAlvo, REJEITADO)` → se sim, erro `"Plano já existe para esta semana"` sem chamar o LLM. O `exists`-check cobre o caso sequencial mas tem janela TOCTOU entre lotes concorrentes — a guarda autoritativa é o índice único parcial (1.1.b).
      - Chamar `planoService.gerarPlanoTreino(atletaId, modo)` **através do `LlmConcurrencyLimiter.executar(...)`** (limita concorrência real ao provedor, não ao pool de threads).
      - Capturar `DataIntegrityViolationException` na persistência do plano (violação do índice único `uk_plano_semanal_atleta_semana_ativo` por lote concorrente) e convertê-la em erro individual `"Plano já existe para esta semana"` — mesma mensagem do fast-path, sem abortar as demais tasks do lote.
      - Erros transitórios do provedor (429/5xx) recebem retry curto (2 tentativas, backoff 2s → 4s) *antes* de cair no catch definitivo — não confundir com o retry estrutural já existente em `PlanoResilienceService` (esse cobre validação, não infra).
      - Sucesso ou erro definitivo → `batchPlanJobRepository.incrementarGerados(jobId)` ou `incrementarErros(jobId)` (update atômico, sem leitura+reatribuição em memória).
    - Ao final (todas as tasks concluídas): setar `status = CONCLUIDO | CONCLUIDO_COM_ERROS`, setar `concluidoEm`, persistir `resultado` como JSON.
  - `consultarStatus`: `batchPlanJobRepository.findByIdAndTenantId(jobId, tenantId)` → lançar `ResourceNotFoundException` se ausente (mapeada para **404** no `GlobalExceptionHandler:74`; **não** usar `DomainNotFoundException`, que não tem handler explícito e cairia em 500); retornar DTO com estado atual.
- [ ] 1.5.c Validação: `./mvnw clean test`.

### 1.6 Controller: `CoachBatchPlanController`

- [ ] 1.6.a Criar `CoachBatchPlanController` em `controller/`:
  - Tag: `coach-batch-plan`.
  - `POST /api/v1/coach/planos/gerar-lote` → `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, body `@Valid BatchGeracaoPlanoInputDto`, retorno `202 Accepted` com body `{ "jobId": uuid, "totalAtletas": N }` e header `Location: /api/v1/coach/planos/lote/{jobId}`.
  - `GET /api/v1/coach/planos/lote/{jobId}` → retorno `BatchJobStatusOutputDto`.
  - `@Operation` + `@ApiResponses` em ambos (202, 400, 403 no POST; 200, 404 no GET).
- [ ] 1.6.b Validação: `./mvnw clean test`.

### 1.7 Testes de unidade — service

- [ ] 1.7.a `BatchPlanServiceImplTest` com `@Nested`:
  - `IniciarLote > cria job e retorna jobId`.
  - `IniciarLote > rejeita lista vazia`.
  - `IniciarLote > rejeita lista com mais de 20 atletas`.
  - `IniciarLote > deduplica atletaIds repetidos — totalAtletas reflete a contagem distinta` (ex.: `[A, A, B]` → job com `totalAtletas = 2`).
  - `IniciarLote > delega processamento ao bean assíncrono (não self-invocation)` — verificar via mock/spy que o método `@Async` é chamado através do proxy, não diretamente.
  - `ConsultarStatus > retorna estado atual do job`.
  - `ConsultarStatus > lança ResourceNotFoundException para jobId de outro tenant` (→ 404).
- [ ] 1.7.b `BatchPlanProcessorTest`:
  - `gera planos para todos os atletas válidos`.
  - `registra erro individual sem abortar o lote`.
  - `atleta de outro tenant → motivo Atleta não encontrado`.
  - `atleta com plano existente → motivo Plano já existe`.
  - `status CONCLUIDO_COM_ERROS quando há pelo menos um erro`.
  - `TenantContext é setado antes de cada chamada e limpo no finally, mesmo em erro`.
  - `TenantContext é setado no método externo processarLote (envolvendo transição de status e gravação de resultado) e limpo no finally` — validar o nível externo de propagação, além do por-subtask.
  - `respeita o limite de concorrência do Semaphore` (ex.: mock do `LlmConcurrencyLimiter` verificando nº máximo de permits em uso simultâneo).
  - `retry curto ativa apenas para exceção de rate-limit/infra do provedor (429/5xx), não para falha de validação estrutural`.
  - `updates de progresso usam a query atômica (incrementarGerados/incrementarErros), não leitura+reatribuição`.
- [ ] 1.7.c `CoachBatchPlanControllerTest` com `@WebMvcTest`:
  - POST retorna 202 com `jobId` e header `Location`.
  - POST retorna 400 para lista vazia.
  - GET retorna 200 com status do job.
  - GET retorna 404 para jobId desconhecido.
- [ ] 1.7.d Validação: `./mvnw clean test` — todos os testes passando.

### 1.8 Recovery de jobs órfãos no restart

Um job fica preso em `PENDENTE`/`EM_PROGRESSO` se a aplicação cair no meio do processamento (fire-and-forget em virtual threads). Os planos já gerados persistem (transação curta por atleta), mas o job precisa ser fechado — senão o polling do front só desiste no timeout de 5 min.

- [ ] 1.8.a Adicionar ao `BatchPlanJobRepository`:
  ```java
  @Query("SELECT b FROM BatchPlanJob b WHERE b.status IN ('PENDENTE','EM_PROGRESSO') AND b.criadoEm < :limite")
  List<BatchPlanJob> findJobsOrfaos(@Param("limite") OffsetDateTime limite);
  ```
- [ ] 1.8.b Criar `BatchPlanRecoveryService` (`@Component`) com um listener de `ApplicationReadyEvent` (ou `@Scheduled` leve) que:
  - Busca jobs órfãos com `criadoEm` anterior a um limiar (`app.batch-plan.recovery-limite-min:30` — nenhum lote real dura tanto).
  - Fecha cada um como `CONCLUIDO_COM_ERROS`, setando `concluidoEm`. **Fechamento por contagem, em nível de job — não por atleta** (o schema não persiste `atletaIds` nem detalhe parcial durante o `EM_PROGRESSO`; só os contadores `gerados`/`erros`, que já refletem o processado até a queda). Calcular `naoProcessados = totalAtletas - gerados - erros` (um número) e gravar em `resultado` uma nota de job: `{ "observacao": "Lote interrompido por reinício da aplicação. N atleta(s) podem não ter sido processados — reenvie o lote." }`, preservando os `gerados`/`erros` já contabilizados.
  - **Não** reprocessa automaticamente (evita duplicar planos já gerados antes da queda) — o coach reenvia o lote; atletas já com plano caem no fast-path/índice único, tornando o reenvio seguro.
  - Idempotente: só atua sobre jobs em estado não-terminal — rodar duas vezes não altera um job já `CONCLUIDO`/`CONCLUIDO_COM_ERROS`.
- [ ] 1.8.c `BatchPlanRecoveryServiceTest`:
  - `fecha job preso em EM_PROGRESSO anterior ao limiar como CONCLUIDO_COM_ERROS, com concluidoEm preenchido`.
  - `grava observacao de job no resultado com a contagem de nao processados (sem detalhar por atleta)`.
  - `ignora job recente dentro do limiar`.
  - `ignora job já em estado terminal (idempotência — nenhuma escrita)`.
- [ ] 1.8.d Validação: `./mvnw clean test`.

---

## Bloco 2 — Frontend

### 2.1 Tipos TypeScript

- [ ] 2.1.a Criar `src/types/BatchPlanJob.ts`:
  ```ts
  export type BatchJobStatus = 'PENDENTE' | 'EM_PROGRESSO' | 'CONCLUIDO' | 'CONCLUIDO_COM_ERROS';
  export interface BatchPlanJobStatus {
    jobId: string;
    status: BatchJobStatus;
    totalAtletas: number;
    gerados: number;
    erros: number;
    geradosDetalhes: { atletaId: string; planoId: string; atletaNome: string }[];
    errosDetalhes: { atletaId: string; motivo: string }[];
  }
  ```
- [ ] 2.1.b Validação: `npm run build`.

### 2.2 API service

- [ ] 2.2.a Em `src/api/services/` criar `BatchPlanService.ts` com:
  ```ts
  gerarEmLote(atletaIds: string[], modo?: 'PROXIMA_SEMANA' | 'SEMANA_ATUAL'): Promise<{ jobId: string; totalAtletas: number }>
  consultarStatus(jobId: string): Promise<BatchPlanJobStatus>
  ```
- [ ] 2.2.b Validação: `npm run build`.

### 2.3 Hook `useBatchPlanGeneration`

- [ ] 2.3.a Criar `src/hooks/useBatchPlanGeneration.ts` com:
  - Estado: `jobId: string | null`, `status: BatchPlanJobStatus | null`, `loading: boolean`, `error: string | null`.
  - Função `gerarLote(atletaIds, modo)`: dispara POST, seta `jobId`, inicia polling.
  - Polling: `setInterval` de 3s enquanto status não é terminal; para ao concluir. O contador (`gerados`/`erros`) deve subir de forma contínua a cada poll, refletindo o progresso real do backend (atualização por atleta individual, não em blocos).
  - Timeout de segurança **adaptativo ao tamanho do lote** (não 5min fixos — o pior caso saudável de 20 atletas é ~13min): `timeoutMs = Math.max(5, Math.ceil(totalAtletas / 4) * 3) * 60_000`. Ao estourar sem estado terminal, para o polling e seta um aviso ("A geração está demorando mais que o esperado — verifique novamente em instantes"), **sem descartar o `jobId`** (permite reconsulta). O polling também para imediatamente quando o backend reporta estado terminal, sem esperar o timeout — a fonte de verdade de "travado" é o backend (recovery, design §9).
  - Função `reset()` para limpar o estado.
- [ ] 2.3.b Testes unitários (`useBatchPlanGeneration.test.ts`):
  - Inicia polling após disparar lote.
  - Para polling quando status CONCLUIDO.
  - Seta error em falha de rede.
  - Reseta estado com `reset()`.
- [ ] 2.3.c Validação: `npm run lint && npm run build`.

### 2.4 Seleção no roster e toolbar

- [ ] 2.4.a No `CoachAthletesPage`:
  - Adicionar coluna de checkbox por linha de atleta.
  - Estado `selecionados: string[]`.
  - Checkbox "selecionar todos" no header da coluna (indeterminate quando parcial).
- [ ] 2.4.b Toolbar flutuante (MUI `Toolbar` no rodapé ou topo fixo) aparece quando `selecionados.length > 0`:
  - Texto: "N atleta(s) selecionado(s)".
  - Botão "Gerar planos".
  - Botão "Cancelar seleção".
- [ ] 2.4.c Validação: `npm run lint && npm run build`.

### 2.5 Dialog de confirmação e progresso

- [ ] 2.5.a Criar `BatchPlanDialog.tsx` com dois estados:
  - **Confirmação:** lista de atletas selecionados, modo de geração, aviso "Planos entrarão em Aguardando Revisão", botões Confirmar/Cancelar.
  - **Progresso:** `LinearProgress` com `value = (gerados + erros) / totalAtletas * 100`, contador "X de N gerados", spinner enquanto em andamento.
  - **Resultado:** ao concluir, exibe `X planos gerados` (verde) e `Y erros` (laranja) com lista colapsável de erros.
- [ ] 2.5.b Integrar `useBatchPlanGeneration` no dialog.
- [ ] 2.5.c Após conclusão: chamar `reset()`, limpar `selecionados` no roster, invalidar cache de planos pendentes (para atualizar badge no nav).
- [ ] 2.5.d Validação: `npm run lint && npm run build`.

### 2.6 Testes de componente

- [ ] 2.6.a Teste do `BatchPlanDialog`: exibe confirmação antes do disparo; exibe progresso após confirmar; exibe resultado ao concluir.
- [ ] 2.6.b Teste da integração no `CoachAthletesPage`: toolbar aparece ao selecionar; desaparece ao cancelar seleção.
- [ ] 2.6.c Validação: `npm run lint && npm run build && npm test`.

---

## Bloco 3 — QA e entrega

- [ ] 3.1 `./mvnw clean test` — todos os testes passando.
- [ ] 3.2 `npm run lint && npm run build && npm test` — tudo verde.
- [ ] 3.3 Teste manual ponta-a-ponta:
  - Selecionar 3 atletas no roster → Gerar planos → verificar 202 e `jobId`.
  - Polling até conclusão → verificar progresso subindo continuamente (não em saltos) → 3 planos em `AGUARDANDO_REVISAO`.
  - Incluir ID de atleta de outro tenant → verificar erro individual sem abortar os demais.
  - Incluir atleta com plano existente → verificar motivo "Plano já existe para esta semana".
  - Enviar lista com 21 IDs → verificar 400.
  - Enviar lista com IDs repetidos (`[A, A, B]`) → verificar `totalAtletas = 2` (dedup) e nenhum erro artificial de "Plano já existe".
  - Chamar GET com `jobId` de outro tenant → verificar 404.
  - Confirmar que endpoint `GET /coach/attention-queue` responde normalmente durante geração em lote (virtual threads não bloqueiam o pool HTTP).
  - Lote de 20 atletas: confirmar (via log/métrica) que no máximo `app.batch-plan.llm-concorrencia` chamadas ao LLM ficam em voo simultaneamente.
- [ ] 3.4 **Baseline da métrica de sucesso (antes do deploy):** executar a query de baseline sobre os planos gerados individualmente nas 2 semanas anteriores — delta `MIN(criado_em)` → `MAX(criado_em)` agrupado por coach + `semana_inicio`, filtrando grupos com ≥2 planos. Registrar o resultado (média dos deltas) como documento de referência para a comparação pós-lançamento (`tb_batch_plan_job.criado_em → concluido_em`). Confirmar amostra mínima (≥3 grupos com ≥2 planos); se insuficiente, estender a janela. Sem este baseline registrado, a métrica primária (≥60% de redução) não é verificável — não considerar a change entregue sem ele.
- [ ] 3.5 Revisores: `menthoros-workflow:code-reviewer` + `menthoros-workflow:security-reviewer`.
- [ ] 3.6 Abrir PR (`feature/coach-batch-plan-generation`) e aguardar CI verde.

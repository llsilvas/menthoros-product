# Tasks: coach-batch-plan-generation

**Status:** Proposed
**Sprint:** Sprint 12 (desbloqueada — dependência de `add-llm-tool-use` removida, SPRINTS.md 2026-07-06)
**Tamanho:** M · Trilha: Full
**Repos:** menthoros-backend + menthoros-front
**Dependências:** `add-coach-shell-dashboards` (concluída), `coach-edit-planned-workout` (concluída)

---

## Bloco 1 — Backend: Infraestrutura do job assíncrono

### 1.1 Migration (V52)

- [ ] 1.1.a Confirmar que V51 (`V51__add_origem_encerramento_plano_semanal.sql`) continua sendo a última migration aplicada (`ls db/migration/ | sort -V | tail -3`) — se outra change avançou a numeração, ajustar para a próxima disponível.
- [ ] 1.1.b Criar `V52__Create_tb_batch_plan_job.sql`:
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
  DO $$ BEGIN RAISE NOTICE '✅ V52 - tb_batch_plan_job criada'; END$$;
  ```
- [ ] 1.1.c Validação: `./mvnw flyway:info` sem conflito.

### 1.2 Enum, entidade e repositório do job

- [ ] 1.2.a Criar enum `BatchJobStatus` (PENDENTE, EM_PROGRESSO, CONCLUIDO, CONCLUIDO_COM_ERROS).
- [ ] 1.2.b Criar entidade `BatchPlanJob` com campos: `id`, `tenantId`, `status`, `totalAtletas`, `gerados`, `erros`, `criadoEm`, `concluidoEm`, `resultado` (String/JSON).
- [ ] 1.2.c Criar `BatchPlanJobRepository` com:
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
- [ ] 1.2.d Validação: `./mvnw clean compile`.

### 1.3 DTOs

- [ ] 1.3.a Criar `BatchGeracaoPlanoInputDto` (record em `dto/input/`):
  ```java
  public record BatchGeracaoPlanoInputDto(
      @NotEmpty @Size(min = 1, max = 20) List<UUID> atletaIds,
      ModoGeracaoPlano modo
  ) {}
  ```
  Valor default de `modo` via `@JsonProperty` ou construtor compacto com default `PROXIMA_SEMANA`.
- [ ] 1.3.b Criar `BatchJobStatusOutputDto` (record em `dto/output/`) com: `UUID jobId`, `BatchJobStatus status`, `int totalAtletas`, `int gerados`, `int erros`, `List<BatchGeradoItemDto> geradosDetalhes`, `List<BatchErroItemDto> errosDetalhes`.
- [ ] 1.3.c Criar records aninhados `BatchGeradoItemDto(UUID atletaId, UUID planoId, String atletaNome)` e `BatchErroItemDto(UUID atletaId, String motivo)`.
- [ ] 1.3.d Validação: `./mvnw clean compile`.

### 1.4 `BatchPlanAsyncConfig` — executor de virtual threads

- [ ] 1.4.a Criar `BatchPlanAsyncConfig.java` em `config/` (nome segue a convenção existente do projeto — uma config por feature, como `StravaWebhookAsyncConfig` e `WorkoutAnalysisAsyncConfig` — não um `AsyncConfig` genérico):
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
- [ ] 1.4.b Criar `LlmConcurrencyLimiter` (`@Component`) com `Semaphore` para limitar chamadas *reais* ao LLM (independente do nº de virtual threads):
  ```java
  @Component
  public class LlmConcurrencyLimiter {
      private final Semaphore semaphore;

      public LlmConcurrencyLimiter(@Value("${menthoros.batch-plan.llm-concorrencia:4}") int permits) {
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
- [ ] 1.4.c Adicionar `menthoros.batch-plan.llm-concorrencia: 4` em `application.yml`.
- [ ] 1.4.d Validação: `./mvnw clean compile`.

### 1.5 Service: `BatchPlanService`

- [ ] 1.5.a Criar interface `BatchPlanService`:
  ```java
  UUID iniciarLote(BatchGeracaoPlanoInputDto input, UUID tenantId);
  BatchJobStatusOutputDto consultarStatus(UUID jobId, UUID tenantId);
  ```
- [ ] 1.5.b Criar `BatchPlanServiceImpl`:
  - `iniciarLote`: criar `BatchPlanJob` (status PENDENTE), persistir, chamar método `@Async` **em um bean separado** (nunca self-invocation na mesma classe — chamada interna `this.processarLote(...)` não passa pelo proxy Spring e o `@Async` seria ignorado silenciosamente, rodando síncrono na thread HTTP e quebrando o CA1 sem erro visível). Extrair `processarLote` para um componente dedicado (ex.: `BatchPlanProcessor`) injetado no service, ou usar auto-injeção via `@Lazy` do próprio proxy — preferir o componente separado, mais explícito.
  - `BatchPlanProcessor.processarLote(UUID jobId, List<UUID> atletaIds, ModoGeracaoPlano modo, UUID tenantId)`, anotado `@Async("batchPlanExecutor")`:
    - Atualizar job para EM_PROGRESSO.
    - Submeter **todas as N tasks de uma vez** (uma virtual thread por atleta, sem chunking sequencial nem barreira `allOf().join()` por grupo) — o progresso deve refletir a ordem real de resposta do LLM, não saltos de bloco.
    - Cada task individual:
      - `TenantContext.setTenantId(tenantId)` no início; `TenantContext.clear()` no `finally` (ThreadLocal puro não sobrevive ao handoff assíncrono — virtual thread também não herda; setar manualmente é obrigatório, mesmo padrão do `EncerramentoSemanaScheduler`).
      - Validar que atleta pertence ao tenant: `atletaRepository.existsByIdAndTenantId(atletaId, tenantId)` → se não, registrar erro `"Atleta não encontrado"`.
      - Verificar plano duplicado: `planoSemanalRepository.existsByAtletaIdAndSemanaInicioAndReviewStatusNot(atletaId, semanaAlvo, REJEITADO)` → se sim, erro `"Plano já existe para esta semana"`.
      - Chamar `planoService.gerarPlanoTreino(atletaId, modo)` **através do `LlmConcurrencyLimiter.executar(...)`** (limita concorrência real ao provedor, não ao pool de threads).
      - Erros transitórios do provedor (429/5xx) recebem retry curto (2 tentativas, backoff 2s → 4s) *antes* de cair no catch definitivo — não confundir com o retry estrutural já existente em `PlanoResilienceService` (esse cobre validação, não infra).
      - Sucesso ou erro definitivo → `batchPlanJobRepository.incrementarGerados(jobId)` ou `incrementarErros(jobId)` (update atômico, sem leitura+reatribuição em memória).
    - Ao final (todas as tasks concluídas): setar `status = CONCLUIDO | CONCLUIDO_COM_ERROS`, setar `concluidoEm`, persistir `resultado` como JSON.
  - `consultarStatus`: `batchPlanJobRepository.findByIdAndTenantId(jobId, tenantId)` → 404 se ausente; retornar DTO com estado atual.
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
  - `IniciarLote > delega processamento ao bean assíncrono (não self-invocation)` — verificar via mock/spy que o método `@Async` é chamado através do proxy, não diretamente.
  - `ConsultarStatus > retorna estado atual do job`.
  - `ConsultarStatus > lança EntityNotFoundException para jobId de outro tenant`.
- [ ] 1.7.b `BatchPlanProcessorTest`:
  - `gera planos para todos os atletas válidos`.
  - `registra erro individual sem abortar o lote`.
  - `atleta de outro tenant → motivo Atleta não encontrado`.
  - `atleta com plano existente → motivo Plano já existe`.
  - `status CONCLUIDO_COM_ERROS quando há pelo menos um erro`.
  - `TenantContext é setado antes de cada chamada e limpo no finally, mesmo em erro`.
  - `respeita o limite de concorrência do Semaphore` (ex.: mock do `LlmConcurrencyLimiter` verificando nº máximo de permits em uso simultâneo).
  - `retry curto ativa apenas para exceção de rate-limit/infra do provedor (429/5xx), não para falha de validação estrutural`.
  - `updates de progresso usam a query atômica (incrementarGerados/incrementarErros), não leitura+reatribuição`.
- [ ] 1.7.c `CoachBatchPlanControllerTest` com `@WebMvcTest`:
  - POST retorna 202 com `jobId` e header `Location`.
  - POST retorna 400 para lista vazia.
  - GET retorna 200 com status do job.
  - GET retorna 404 para jobId desconhecido.
- [ ] 1.7.d Validação: `./mvnw clean test` — todos os testes passando.

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
  - Timeout de segurança: 5min → para polling, seta `error = "Timeout"`.
  - Função `reset()` para limpar o estado.
- [ ] 2.3.b Testes unitários (`useBatchPlanGeneration.test.ts`):
  - Inicia polling após disparar lote.
  - Para polling quando status CONCLUIDO.
  - Seta error em falha de rede.
  - Reseta estado com `reset()`.
- [ ] 2.3.c Validação: `npm run lint && npm run build`.

### 2.4 Seleção no roster e toolbar

- [ ] 2.4.a No `CoachDashboardPage`:
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
- [ ] 2.6.b Teste da integração no `CoachDashboardPage`: toolbar aparece ao selecionar; desaparece ao cancelar seleção.
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
  - Chamar GET com `jobId` de outro tenant → verificar 404.
  - Confirmar que endpoint `GET /coach/attention-queue` responde normalmente durante geração em lote (virtual threads não bloqueiam o pool HTTP).
  - Lote de 20 atletas: confirmar (via log/métrica) que no máximo `menthoros.batch-plan.llm-concorrencia` chamadas ao LLM ficam em voo simultaneamente.
- [ ] 3.4 Revisores: `menthoros-workflow:code-reviewer` + `menthoros-workflow:security-reviewer`.
- [ ] 3.5 Abrir PR (`feature/coach-batch-plan-generation`) e aguardar CI verde.

# Design: coach-batch-plan-generation

## Decisões Técnicas

### 1. Padrão `202 Accepted + polling` — justificativa e estrutura

Geração de plano chama LLM (~5s/atleta). 20 atletas = ~100s, além do timeout de proxy (Nginx/ALB: 60–75s) e do risco de exaurir o pool HTTP do Tomcat (20 threads × 100s = todos bloqueados).

Padrão adotado: **async fire-and-forget** com job persistido no banco.

```
POST /coach/planos/gerar-lote           → 202 Accepted + { jobId }
                │
                └─▶ @Async executor "batchPlanExecutor" (virtual threads)
                           │
                    para cada atletaId (todas as tasks submetidas de uma vez):
                           ├─ planoService.gerarPlanoTreino(atletaId, modo)
                           ├─ success → UPDATE atômico (gerados++)
                           └─ error   → UPDATE atômico (erros++, motivo genérico)
                           │
                    ao final → job.status = CONCLUIDO | CONCLUIDO_COM_ERROS

GET /coach/planos/lote/{jobId}          → estado atual do job (polling a cada 3s)
```

Vantagens: thread HTTP retorna em < 500ms; virtual threads não bloqueiam o pool HTTP; job é resiliente a restart (persistido no banco); progresso reportado por atleta individual conforme o LLM responde (sem barreira de bloco).

### 2. Schema da tabela `tb_batch_plan_job`

```sql
CREATE TABLE IF NOT EXISTS tb_batch_plan_job (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    total_atletas   INT NOT NULL,
    gerados         INT NOT NULL DEFAULT 0,
    erros           INT NOT NULL DEFAULT 0,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluido_em    TIMESTAMPTZ,
    resultado       JSONB,
    CONSTRAINT chk_batch_job_status CHECK (status IN ('PENDENTE','EM_PROGRESSO','CONCLUIDO','CONCLUIDO_COM_ERROS'))
);

CREATE INDEX IF NOT EXISTS idx_batch_plan_job_tenant ON tb_batch_plan_job(tenant_id);
```

`resultado` é um JSONB com a lista de gerados e erros ao final do job — evita nova tabela de itens:
```json
{
  "gerados": [{ "atletaId": "uuid", "planoId": "uuid", "atletaNome": "..." }, ...],
  "erros":   [{ "atletaId": "uuid", "motivo": "..." }, ...]
}
```

Retenção: job é deletado após 7 dias por job de limpeza (cron, fora do escopo desta change — adicionar como follow-up).

### 3. Entidade e repositório

```java
@Entity @Table(name = "tb_batch_plan_job")
public class BatchPlanJob {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "tenant_id") private UUID tenantId;
    @Enumerated(EnumType.STRING) private BatchJobStatus status;
    private int totalAtletas, gerados, erros;
    private LocalDateTime criadoEm, concluidoEm;
    @Column(columnDefinition = "jsonb") private String resultado; // serializado como JSON
}
```

`BatchPlanJobRepository` com `findByIdAndTenantId(UUID, UUID)` para validação de tenant no GET.

### 4. Executor — Virtual Threads (não pool dimensionado) — `BatchPlanAsyncConfig`

**Por que não `ThreadPoolTaskExecutor`:** a chamada ao LLM é I/O-bound, não CPU-bound, e a latência real por atleta é bem maior que o "~5s" estimado no proposal — `PlanoResilienceService.java:20` documenta **~80s por tentativa**, com até 1 retry estrutural = pior caso ~160s/atleta. Dimensionar um pool de platform threads (core=2/max=3) para essa espera é desperdício de recurso e ainda serializa o lote (3 atletas em voo por vez, o resto espera na fila). Java 21 (já em uso, `pom.xml`) + Spring Boot 3.5.14 suportam virtual threads nativamente — cada tarefa (1 atleta) roda na própria virtual thread, bloqueando "de graça" sem prender uma platform thread.

```java
@Configuration
@EnableAsync
public class BatchPlanAsyncConfig implements AsyncConfigurer {

    @Bean("batchPlanExecutor")
    public Executor batchPlanExecutor() {
        return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
    }
}
```

Nome de classe segue a convenção existente no projeto (`StravaWebhookAsyncConfig`, `WorkoutAnalysisAsyncConfig` — uma config por feature, não uma `AsyncConfig` genérica compartilhada).

**Todas as N tasks (até 20) são submetidas de uma vez ao executor** — sem chunking sequencial nem barreira `allOf().join()` por grupo. O frontend faz polling a cada 3s e precisa ver o contador subir *conforme o LLM responde*, não em saltos de bloco; qualquer barreira intermediária trava o progresso no ritmo do atleta mais lento do grupo.

### 4.1 Controle de concorrência real — `Semaphore`, não pool size

Sem limitador, 20 virtual threads disparariam até 20 chamadas simultâneas ao provedor do LLM (risco de 429/rate-limit) e 20 escritas concorrentes no job. Virtual threads não enfileiram por si — o throttle precisa ser explícito:

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

`menthoros.batch-plan.llm-concorrencia` configurável em `application.yml`, default 4 — quantas chamadas ao LLM em voo por vez, independente de quantas virtual threads existem no lote.

**Premissa em aberto:** o `Semaphore` é por instância da JVM, não um limite global distribuído. Se o backend escalar horizontalmente no futuro, o teto real de concorrência ao LLM vira `4 × nº de instâncias`. Para a escala atual (single instance) isso é aceitável; revisitar se/quando houver múltiplas instâncias em produção.

### 4.2 Retry curto para erro transitório de infra (rate-limit/503) no modo lote

`PlanoResilienceService` já faz retry (1x) apenas para falha *estrutural* de validação — falhas de infra/rede propagam direto (correto no fluxo unitário síncrono, onde 503/429 é raro). Em lote, a concorrência introduzida pelo próprio batch aumenta a chance de 429 do provedor. Sem tratamento, isso viraria falso "erro" pro coach mesmo quando o atleta poderia ter tido plano gerado com sucesso.

Adicionar, só no fluxo de lote, um retry curto e específico para exceções de rate-limit/infra do provedor (não para falha de validação estrutural, que já é tratada a montante):
- 2 tentativas, backoff 2s → 4s.
- Só cobre `HttpClientErrorException.TooManyRequests` (429) e erros 5xx do provedor — qualquer outra exceção (parsing, validação de domínio) segue para o tratamento de erro padrão do item (sem retry adicional, evita mascarar bug real).

### 5. Tratamento de erros individuais — sem oracle de enumeração

Para qualquer `atletaId` que falhe, o `motivo` no campo `erros` segue estas regras:
- Atleta de outro tenant → `"Atleta não encontrado"` (idêntico ao não-existente — sem revelar cross-tenant).
- Atleta com plano já existente na semana → `"Plano já existe para esta semana"`.
- Qualquer exceção de geração (LLM timeout, 503, parsing) → `"Erro ao gerar plano — tente novamente"`.

Nunca propagar a mensagem interna da exceção para o campo `motivo` — risco de expor detalhes internos (stack trace, URL do LLM, modelo utilizado).

### 6. Atualização incremental do job — update atômico por atleta

O service assíncrono atualiza o job no banco a cada plano concluído (sucesso ou erro), individualmente, assim que aquele atleta termina — não em blocos, não só no final. É isso que dá ao frontend o efeito de "vai atualizando conforme o LLM vai respondendo" no polling.

**Pitfall de concorrência:** com N virtual threads terminando em momentos diferentes e escrevendo no mesmo registro de job, um `save()` JPA convencional (ler entidade → incrementar campo em memória → salvar) tem race condition real — duas threads podem ler o mesmo valor antes de qualquer uma persistir, perdendo um incremento; e o `@Version` (optimistic locking, já usado em `PlanoSemanal`) pode lançar `OptimisticLockException` sob concorrência real, exigindo retry manual do próprio update.

**Solução:** increment atômico via query `@Modifying`, sem carregar/reatribuir o campo em memória:

```java
@Modifying
@Query("UPDATE BatchPlanJob b SET b.gerados = b.gerados + 1 WHERE b.id = :id")
void incrementarGerados(@Param("id") UUID id);

@Modifying
@Query("UPDATE BatchPlanJob b SET b.erros = b.erros + 1 WHERE b.id = :id")
void incrementarErros(@Param("id") UUID id);
```

Cada virtual thread chama `incrementarGerados`/`incrementarErros` (dentro de `@Transactional` próprio, curto) assim que o atleta individual termina — sem N+1 real (é o comportamento esperado, não um problema: 1 UPDATE atômico por atleta, sem leitura prévia, sem race).

### 7. Frontend — polling strategy

Intervalo de polling: 3s enquanto `status = PENDENTE | EM_PROGRESSO`. Parar polling quando `status = CONCLUIDO | CONCLUIDO_COM_ERROS`.

Implementação com `useEffect` + `setInterval`:
```ts
useEffect(() => {
  if (!jobId || isTerminal(status)) return;
  const interval = setInterval(() => fetchJobStatus(jobId), 3000);
  return () => clearInterval(interval);
}, [jobId, status]);
```

Timeout de segurança: se após 5 minutos o job não terminou (edge case de travamento), mostrar mensagem de erro ao usuário e parar polling.

### 8. Validação de plano duplicado

Antes de chamar `planoService.gerarPlanoTreino(atletaId, modo)`, o service assíncrono verifica se já existe um plano para o atleta na semana alvo com `PlanoReviewStatus` diferente de `REJEITADO`. Se existir, registra o atleta como erro com `"Plano já existe para esta semana"` sem chamar o LLM.

Lógica: `planoSemanalRepository.existsByAtletaIdAndSemanaInicioAndReviewStatusNot(atletaId, semanaAlvo, REJEITADO)`.
